from __future__ import annotations

import time
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from audit.log import write_audit_event
from auth.middleware import AuthenticatedUser, get_current_user
from auth.rbac import check_permission
from crypto.vault import decrypt_with_master_key, encrypt_with_master_key
from database import get_db
from rotation.scheduler import _rotate_one

router = APIRouter(prefix="/rotation", tags=["rotation"])


class RotationConfigCreate(BaseModel):
    name: str
    db_type: str  # postgres | mysql | redis | mongo
    connection_string: str  # plaintext DSN — will be encrypted before storage
    secret_path: str
    rotation_interval_hours: int = 24
    webhook_url: Optional[str] = None


class RotationConfigResponse(BaseModel):
    id: str
    name: str
    db_type: str
    secret_path: str
    rotation_interval_hours: int
    last_rotated_at: Optional[int]
    next_rotation_at: Optional[int]
    is_active: bool
    webhook_url: Optional[str]


def _ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.get("/configs", response_model=List[RotationConfigResponse])
async def list_configs(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> List[RotationConfigResponse]:
    if not check_permission(current_user.permissions, "rotation:read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing permission: rotation:read")

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT id, name, db_type, secret_path, rotation_interval_hours,
                   last_rotated_at, next_rotation_at, is_active, webhook_url
            FROM rotation_configs
            ORDER BY name
            """
        )
        rows = await cursor.fetchall()

    return [RotationConfigResponse(**dict(r)) for r in rows]


@router.post("/configs", response_model=RotationConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_config(
    body: RotationConfigCreate,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> RotationConfigResponse:
    if not check_permission(current_user.permissions, "rotation:write"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing permission: rotation:write")

    valid_types = {"postgres", "mysql", "redis", "mongo"}
    if body.db_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"db_type must be one of {sorted(valid_types)}",
        )

    # Encrypt connection string (contains database password)
    ct_b64, nonce_b64 = encrypt_with_master_key(body.connection_string.encode())

    config_id = str(uuid.uuid4())
    now = int(time.time())
    next_rotation = now + body.rotation_interval_hours * 3600

    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO rotation_configs
              (id, name, db_type, connection_string_enc, nonce, secret_path,
               rotation_interval_hours, next_rotation_at, is_active, webhook_url)
            VALUES (?,?,?,?,?,?,?,?,TRUE,?)
            """,
            (
                config_id, body.name, body.db_type, ct_b64, nonce_b64,
                body.secret_path, body.rotation_interval_hours,
                next_rotation, body.webhook_url,
            ),
        )
        await db.commit()

    await write_audit_event(
        action="rotation.config_created",
        outcome="success",
        actor_id=current_user.user_id,
        actor_username=current_user.username,
        resource=config_id,
        ip_address=_ip(request),
        metadata={"name": body.name, "db_type": body.db_type},
    )
    return RotationConfigResponse(
        id=config_id,
        name=body.name,
        db_type=body.db_type,
        secret_path=body.secret_path,
        rotation_interval_hours=body.rotation_interval_hours,
        last_rotated_at=None,
        next_rotation_at=next_rotation,
        is_active=True,
        webhook_url=body.webhook_url,
    )


@router.delete("/configs/{config_id}")
async def delete_config(
    config_id: str,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    if not check_permission(current_user.permissions, "rotation:write"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing permission: rotation:write")

    async with get_db() as db:
        result = await db.execute("DELETE FROM rotation_configs WHERE id = ?", (config_id,))
        if result.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Config not found")
        await db.commit()

    await write_audit_event(
        action="rotation.config_deleted",
        outcome="success",
        actor_id=current_user.user_id,
        actor_username=current_user.username,
        resource=config_id,
        ip_address=_ip(request),
    )
    return {"ok": True, "config_id": config_id}


@router.post("/trigger/{config_id}")
async def trigger_rotation(
    config_id: str,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    if not check_permission(current_user.permissions, "rotation:trigger"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing permission: rotation:trigger")

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM rotation_configs WHERE id = ?", (config_id,)
        )
        row = await cursor.fetchone()

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Config not found")

    config = dict(row)
    await write_audit_event(
        action="rotation.manual_trigger",
        outcome="success",
        actor_id=current_user.user_id,
        actor_username=current_user.username,
        resource=config_id,
        ip_address=_ip(request),
        metadata={"config_name": config["name"], "db_type": config["db_type"]},
    )

    # Run in background task so we don't hold the HTTP request open
    import asyncio
    asyncio.create_task(_rotate_one(config))

    return {"ok": True, "config_id": config_id, "message": "Rotation triggered"}
