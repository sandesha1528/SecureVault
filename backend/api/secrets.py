from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from audit.log import write_audit_event
from auth.middleware import AuthenticatedUser, get_current_user
from auth.rbac import check_permission
from secrets.engine import (
    create_secret,
    hard_delete_secret,
    list_secret_paths,
    list_secret_versions,
    read_secret,
    soft_delete_secret,
)
from secrets.paths import validate_path

router = APIRouter(prefix="/secrets", tags=["secrets"])


class SecretWriteRequest(BaseModel):
    value: str
    metadata: Optional[Dict[str, Any]] = None
    expires_at: Optional[int] = None


class SecretResponse(BaseModel):
    id: str
    path: str
    version: int
    value: str
    metadata: Optional[Dict[str, Any]] = None
    created_by: Optional[str] = None
    created_at: int
    expires_at: Optional[int] = None


class SecretMetaResponse(BaseModel):
    id: str
    path: str
    version: int
    metadata: Optional[Dict[str, Any]] = None
    created_by: Optional[str] = None
    created_at: int
    expires_at: Optional[int] = None


def _require_path_permission(permissions: set, action: str, path: str) -> None:
    required = f"secrets:{action}:{path}"
    if not check_permission(permissions, required):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing permission: {required}",
        )


def _ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.get("", response_model=List[str])
async def list_secrets(
    prefix: str = Query(default="", description="Filter paths by prefix"),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> List[str]:
    _require_path_permission(current_user.permissions, "read", prefix or "*")
    return await list_secret_paths(prefix=prefix)


@router.get("/{path:path}/versions", response_model=List[SecretMetaResponse])
async def list_versions(
    path: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> List[SecretMetaResponse]:
    _require_path_permission(current_user.permissions, "read", path)
    try:
        versions = await list_secret_versions(path)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    await write_audit_event(
        action="secret.list_versions",
        outcome="success",
        actor_id=current_user.user_id,
        actor_username=current_user.username,
        resource=path,
    )
    return [SecretMetaResponse(**v) for v in versions]


@router.get("/{path:path}", response_model=SecretResponse)
async def get_secret(
    path: str,
    request: Request,
    version: Optional[int] = Query(default=None),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> SecretResponse:
    _require_path_permission(current_user.permissions, "read", path)
    try:
        secret = await read_secret(path, version=version)
    except KeyError as exc:
        await write_audit_event(
            action="secret.read",
            outcome="error",
            actor_id=current_user.user_id,
            actor_username=current_user.username,
            resource=path,
            metadata={"error": "not_found"},
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    await write_audit_event(
        action="secret.read",
        outcome="success",
        actor_id=current_user.user_id,
        actor_username=current_user.username,
        resource=path,
        ip_address=_ip(request),
        metadata={"version": secret["version"]},
    )
    return SecretResponse(**secret)


@router.put("/{path:path}", response_model=SecretMetaResponse)
async def write_secret(
    path: str,
    body: SecretWriteRequest,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> SecretMetaResponse:
    try:
        validate_path(path)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    _require_path_permission(current_user.permissions, "write", path)

    result = await create_secret(
        path=path,
        value=body.value,
        metadata=body.metadata,
        created_by=current_user.user_id,
        expires_at=body.expires_at,
    )
    await write_audit_event(
        action="secret.write",
        outcome="success",
        actor_id=current_user.user_id,
        actor_username=current_user.username,
        resource=path,
        ip_address=_ip(request),
        metadata={"version": result["version"]},
    )
    return SecretMetaResponse(**result)


@router.delete("/{path:path}")
async def delete_secret(
    path: str,
    request: Request,
    hard: bool = Query(default=False, description="Hard delete removes all versions permanently"),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Dict[str, Any]:
    _require_path_permission(current_user.permissions, "delete", path)
    try:
        if hard:
            await hard_delete_secret(path)
        else:
            await soft_delete_secret(path)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    await write_audit_event(
        action="secret.delete",
        outcome="success",
        actor_id=current_user.user_id,
        actor_username=current_user.username,
        resource=path,
        ip_address=_ip(request),
        metadata={"hard": hard},
    )
    return {"ok": True, "path": path, "hard": hard}
