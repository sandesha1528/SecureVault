from __future__ import annotations

import json
import time
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from audit.log import write_audit_event
from auth.jwt import hash_password
from auth.middleware import AuthenticatedUser, get_current_user
from auth.rbac import check_permission, invalidate_role_cache
from database import get_db

router = APIRouter(tags=["rbac"])


# ── Role models ──────────────────────────────────────────────────────────────

class RoleCreate(BaseModel):
    name: str
    parent_role_id: Optional[str] = None
    permissions: List[str]


class RoleResponse(BaseModel):
    id: str
    name: str
    parent_role_id: Optional[str]
    permissions: List[str]


class UserCreate(BaseModel):
    username: str
    password: str
    role_id: str


class UserUpdate(BaseModel):
    password: Optional[str] = None
    role_id: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    id: str
    username: str
    role_id: Optional[str]
    role_name: Optional[str]
    totp_enabled: bool
    is_active: bool
    created_at: int
    last_login: Optional[int]


def _ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── Roles ────────────────────────────────────────────────────────────────────

@router.get("/roles", response_model=List[RoleResponse])
async def list_roles(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> List[RoleResponse]:
    if not check_permission(current_user.permissions, "users:read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing permission: users:read")
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM roles ORDER BY name")
        rows = await cursor.fetchall()
    return [
        RoleResponse(
            id=r["id"],
            name=r["name"],
            parent_role_id=r["parent_role_id"],
            permissions=json.loads(r["permissions"]),
        )
        for r in rows
    ]


@router.post("/roles", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    body: RoleCreate,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> RoleResponse:
    if not check_permission(current_user.permissions, "users:write"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing permission: users:write")

    role_id = str(uuid.uuid4())
    async with get_db() as db:
        try:
            await db.execute(
                "INSERT INTO roles (id, name, parent_role_id, permissions) VALUES (?,?,?,?)",
                (role_id, body.name, body.parent_role_id, json.dumps(body.permissions)),
            )
            await db.commit()
        except Exception as exc:
            if "UNIQUE" in str(exc):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Role '{body.name}' already exists")
            raise

    await write_audit_event(
        action="rbac.role_created",
        outcome="success",
        actor_id=current_user.user_id,
        actor_username=current_user.username,
        resource=role_id,
        ip_address=_ip(request),
        metadata={"name": body.name},
    )
    return RoleResponse(id=role_id, name=body.name, parent_role_id=body.parent_role_id, permissions=body.permissions)


@router.put("/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: str,
    body: RoleCreate,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> RoleResponse:
    if not check_permission(current_user.permissions, "users:write"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing permission: users:write")

    # Protect built-in roles from permission stripping
    protected_ids = ("role-superadmin", "role-admin", "role-developer", "role-readonly")
    if role_id in protected_ids and body.name != body.name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot rename built-in roles")

    async with get_db() as db:
        result = await db.execute(
            "UPDATE roles SET name=?,parent_role_id=?,permissions=? WHERE id=?",
            (body.name, body.parent_role_id, json.dumps(body.permissions), role_id),
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
        await db.commit()

    invalidate_role_cache(role_id)
    await write_audit_event(
        action="rbac.role_updated",
        outcome="success",
        actor_id=current_user.user_id,
        actor_username=current_user.username,
        resource=role_id,
        ip_address=_ip(request),
    )
    return RoleResponse(id=role_id, name=body.name, parent_role_id=body.parent_role_id, permissions=body.permissions)


@router.delete("/roles/{role_id}")
async def delete_role(
    role_id: str,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    protected = ("role-superadmin", "role-admin", "role-developer", "role-readonly")
    if role_id in protected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete built-in roles")
    if not check_permission(current_user.permissions, "users:write"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing permission: users:write")

    async with get_db() as db:
        await db.execute("DELETE FROM roles WHERE id = ?", (role_id,))
        await db.commit()

    invalidate_role_cache(role_id)
    return {"ok": True, "role_id": role_id}


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> List[UserResponse]:
    if not check_permission(current_user.permissions, "users:read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing permission: users:read")
    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT u.id, u.username, u.role_id, r.name as role_name,
                   u.totp_enabled, u.is_active, u.created_at, u.last_login
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            ORDER BY u.username
            """
        )
        rows = await cursor.fetchall()
    return [
        UserResponse(
            id=r["id"],
            username=r["username"],
            role_id=r["role_id"],
            role_name=r["role_name"],
            totp_enabled=bool(r["totp_enabled"]),
            is_active=bool(r["is_active"]),
            created_at=r["created_at"],
            last_login=r["last_login"],
        )
        for r in rows
    ]


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> UserResponse:
    if not check_permission(current_user.permissions, "users:write"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing permission: users:write")

    user_id = str(uuid.uuid4())
    pw_hash = hash_password(body.password)
    now = int(time.time())

    async with get_db() as db:
        try:
            await db.execute(
                """
                INSERT INTO users (id, username, password_hash, role_id, created_at, is_active)
                VALUES (?,?,?,?,?,TRUE)
                """,
                (user_id, body.username, pw_hash, body.role_id, now),
            )
            await db.commit()
        except Exception as exc:
            if "UNIQUE" in str(exc):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Username '{body.username}' already exists")
            raise

        cursor = await db.execute("SELECT name FROM roles WHERE id = ?", (body.role_id,))
        role_row = await cursor.fetchone()

    await write_audit_event(
        action="rbac.user_created",
        outcome="success",
        actor_id=current_user.user_id,
        actor_username=current_user.username,
        resource=user_id,
        ip_address=_ip(request),
        metadata={"username": body.username, "role_id": body.role_id},
    )
    return UserResponse(
        id=user_id,
        username=body.username,
        role_id=body.role_id,
        role_name=role_row["name"] if role_row else None,
        totp_enabled=False,
        is_active=True,
        created_at=now,
        last_login=None,
    )


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    body: UserUpdate,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    if not check_permission(current_user.permissions, "users:write"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing permission: users:write")

    updates: list = []
    params: list = []

    if body.password is not None:
        updates.append("password_hash = ?")
        params.append(hash_password(body.password))
    if body.role_id is not None:
        updates.append("role_id = ?")
        params.append(body.role_id)
        invalidate_role_cache()
    if body.is_active is not None:
        updates.append("is_active = ?")
        params.append(body.is_active)

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No updates provided")

    params.append(user_id)
    async with get_db() as db:
        result = await db.execute(
            f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        await db.commit()

    await write_audit_event(
        action="rbac.user_updated",
        outcome="success",
        actor_id=current_user.user_id,
        actor_username=current_user.username,
        resource=user_id,
        ip_address=_ip(request),
    )
    return {"ok": True, "user_id": user_id}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    if not check_permission(current_user.permissions, "users:write"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing permission: users:write")
    if user_id == current_user.user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete your own account")

    async with get_db() as db:
        await db.execute("UPDATE users SET is_active = FALSE WHERE id = ?", (user_id,))
        await db.commit()

    await write_audit_event(
        action="rbac.user_deleted",
        outcome="success",
        actor_id=current_user.user_id,
        actor_username=current_user.username,
        resource=user_id,
        ip_address=_ip(request),
    )
    return {"ok": True, "user_id": user_id}
