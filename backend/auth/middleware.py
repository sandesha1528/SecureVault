from __future__ import annotations

from typing import Optional, Set

import structlog
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from auth.jwt import decode_access_token
from auth.rbac import resolve_permissions
from database import get_db

log = structlog.get_logger(__name__)

_bearer = HTTPBearer(auto_error=True)


class AuthenticatedUser:
    def __init__(
        self,
        user_id: str,
        username: str,
        role_id: str,
        role_name: str,
        permissions: Set[str],
    ) -> None:
        self.user_id = user_id
        self.username = username
        self.role_id = role_id
        self.role_name = role_name
        self.permissions = permissions


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> AuthenticatedUser:
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user_id: str = payload["sub"]
    username: str = payload["username"]
    role_name: str = payload.get("role", "readonly")

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT id, role_id, is_active FROM users WHERE id = ?", (user_id,)
        )
        row = await cursor.fetchone()
        if row is None or not row["is_active"]:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or deactivated",
            )

        role_id: Optional[str] = row["role_id"]
        if role_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No role assigned",
            )

        permissions = await resolve_permissions(role_id, db)

        # Fetch role name from DB to stay consistent even if token is stale
        cursor = await db.execute("SELECT name FROM roles WHERE id = ?", (role_id,))
        role_row = await cursor.fetchone()
        resolved_role_name = role_row["name"] if role_row else role_name

    log.debug(
        "auth.middleware.verified",
        user_id=user_id,
        username=username,
        role=resolved_role_name,
    )

    return AuthenticatedUser(
        user_id=user_id,
        username=username,
        role_id=role_id,
        role_name=resolved_role_name,
        permissions=permissions,
    )
