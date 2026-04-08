from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel

from audit.log import write_audit_event
from auth.middleware import AuthenticatedUser, get_current_user
from auth.rbac import check_permission, get_ssh_principals_for_role
from ssh_ca.ca import (
    get_ca_public_key,
    get_krl,
    revoke_certificate,
    rotate_ca,
    sign_certificate,
)
def validate_public_key(pubkey: str) -> bool:
    try:
        parts = pubkey.strip().split()
        if len(parts) < 2:
            return False
        if parts[0] not in ["ssh-ed25519", "ssh-rsa", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521"]:
            return False
        import base64
        base64.b64decode(parts[1])
        return True
    except Exception:
        return False
from database import get_db

router = APIRouter(prefix="/ssh", tags=["ssh"])


class SignRequest(BaseModel):
    public_key: str
    ttl_hours: Optional[int] = None


class SignResponse(BaseModel):
    cert_id: str
    cert: str
    fingerprint: str
    principals: List[str]
    valid_from: int
    valid_to: int
    serial: int


class CertRecord(BaseModel):
    id: str
    user_id: str
    public_key_fingerprint: str
    principals: List[str]
    valid_from: int
    valid_to: int
    revoked: bool
    issued_at: int
    serial: int


def _ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/sign", response_model=SignResponse)
async def sign_cert(
    body: SignRequest,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> SignResponse:
    if not check_permission(current_user.permissions, "ssh:sign"):
        await write_audit_event(
            action="ssh.sign",
            outcome="denied",
            actor_id=current_user.user_id,
            actor_username=current_user.username,
            ip_address=_ip(request),
            metadata={"reason": "missing_permission"},
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing permission: ssh:sign")

    if not validate_public_key(body.public_key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or unsupported SSH public key format",
        )

    from config import get_settings
    settings = get_settings()
    ttl = body.ttl_hours or settings.ssh_cert_ttl_hours

    # Principals MUST come from the user's role — never trust user input
    principals = get_ssh_principals_for_role(current_user.role_name)
    if not principals:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your role does not allow SSH certificate issuance (no principals configured)",
        )

    try:
        result = await sign_certificate(
            user_pubkey=body.public_key,
            username=current_user.username,
            principals=principals,
            ttl_hours=ttl,
            user_id=current_user.user_id,
        )
    except Exception as exc:
        await write_audit_event(
            action="ssh.sign",
            outcome="error",
            actor_id=current_user.user_id,
            actor_username=current_user.username,
            ip_address=_ip(request),
            metadata={"error": str(exc)},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Certificate signing failed: {exc}",
        )

    await write_audit_event(
        action="ssh.sign",
        outcome="success",
        actor_id=current_user.user_id,
        actor_username=current_user.username,
        resource=result["cert_id"],
        ip_address=_ip(request),
        metadata={
            "principals": principals,
            "ttl_hours": ttl,
            "serial": result["serial"],
            "fingerprint": result["fingerprint"],
        },
    )
    return SignResponse(**result)


@router.get("/ca-pubkey", response_model=dict)
async def ca_public_key() -> dict:
    """Return the CA public key. No authentication required — servers download this."""
    pubkey = await get_ca_public_key()
    return {"public_key": pubkey}


@router.get("/krl")
async def krl_download() -> Response:
    """Return the current Key Revocation List as binary. No auth required."""
    krl_bytes = await get_krl()
    return Response(
        content=krl_bytes,
        media_type="application/octet-stream",
        headers={"Content-Disposition": "attachment; filename=krl"},
    )


@router.post("/revoke/{cert_id}")
async def revoke_cert(
    cert_id: str,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    if not check_permission(current_user.permissions, "ssh:revoke"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing permission: ssh:revoke")

    try:
        await revoke_certificate(cert_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    await write_audit_event(
        action="ssh.revoke",
        outcome="success",
        actor_id=current_user.user_id,
        actor_username=current_user.username,
        resource=cert_id,
        ip_address=_ip(request),
    )
    return {"ok": True, "cert_id": cert_id, "revoked": True}


@router.post("/rotate-ca")
async def rotate_ca_endpoint(
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    if not check_permission(current_user.permissions, "ssh:rotate_ca"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing permission: ssh:rotate_ca")

    new_ca = await rotate_ca()
    await write_audit_event(
        action="ssh.rotate_ca",
        outcome="success",
        actor_id=current_user.user_id,
        actor_username=current_user.username,
        ip_address=_ip(request),
        metadata={"new_fingerprint": new_ca["fingerprint"]},
    )
    return {"ok": True, "new_fingerprint": new_ca["fingerprint"]}


@router.get("/certs", response_model=List[CertRecord])
async def list_my_certs(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> List[CertRecord]:
    """List all certificates issued to the current user."""
    import json
    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT id, user_id, public_key_fingerprint, principals,
                   valid_from, valid_to, revoked, issued_at, serial
            FROM ssh_certificates
            WHERE user_id = ?
            ORDER BY issued_at DESC
            """,
            (current_user.user_id,),
        )
        rows = await cursor.fetchall()

    return [
        CertRecord(
            id=r["id"],
            user_id=r["user_id"],
            public_key_fingerprint=r["public_key_fingerprint"],
            principals=json.loads(r["principals"]),
            valid_from=r["valid_from"],
            valid_to=r["valid_to"],
            revoked=bool(r["revoked"]),
            issued_at=r["issued_at"],
            serial=r["serial"],
        )
        for r in rows
    ]
