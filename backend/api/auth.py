from __future__ import annotations

import time
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from audit.log import write_audit_event
from auth.jwt import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from auth.middleware import AuthenticatedUser, get_current_user
from auth.totp import (
    decrypt_totp_secret,
    encrypt_totp_secret,
    generate_qr_png,
    generate_totp_secret,
    get_totp_uri,
    verify_totp,
)
from database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    requires_totp: bool
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    username: Optional[str] = None
    role: Optional[str] = None


class TOTPVerifyRequest(BaseModel):
    username: str
    code: str
    # Temporary session token issued after password-only auth
    session_token: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TOTPSetupResponse(BaseModel):
    secret: str
    uri: str
    qr_png_b64: str


class TOTPEnableRequest(BaseModel):
    code: str


def _ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, request: Request) -> LoginResponse:
    ip = _ip(request)
    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT u.id, u.username, u.password_hash, u.totp_enabled,
                   u.totp_secret, u.is_active, r.name as role_name, u.role_id
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            WHERE u.username = ?
            """,
            (body.username,),
        )
        user = await cursor.fetchone()

    if user is None or not user["is_active"]:
        await write_audit_event(
            action="auth.login",
            outcome="denied",
            actor_username=body.username,
            ip_address=ip,
            metadata={"reason": "user_not_found_or_inactive"},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_password(body.password, user["password_hash"]):
        await write_audit_event(
            action="auth.login",
            outcome="denied",
            actor_id=user["id"],
            actor_username=user["username"],
            ip_address=ip,
            metadata={"reason": "wrong_password"},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Update last_login
    async with get_db() as db:
        await db.execute(
            "UPDATE users SET last_login = ? WHERE id = ?",
            (int(time.time()), user["id"]),
        )
        await db.commit()

    if user["totp_enabled"] and user["totp_secret"]:
        # Issue a short-lived session token for the TOTP step
        # Re-use access token with a "totp_pending" type — not a full access token
        from config import get_settings
        from jose import jwt as jose_jwt
        now = int(time.time())
        session_token = jose_jwt.encode(
            {
                "sub": user["id"],
                "username": user["username"],
                "role": user["role_name"] or "readonly",
                "type": "totp_pending",
                "iat": now,
                "exp": now + 300,  # 5 minutes to complete TOTP
            },
            get_settings().jwt_secret,
            algorithm="HS256",
        )
        await write_audit_event(
            action="auth.login",
            outcome="success",
            actor_id=user["id"],
            actor_username=user["username"],
            ip_address=ip,
            metadata={"totp_required": True},
        )
        return LoginResponse(requires_totp=True, access_token=session_token)

    # No TOTP — issue full tokens
    access_token = create_access_token(user["id"], user["username"], user["role_name"] or "readonly")
    raw_refresh, refresh_hash, expires_at = create_refresh_token(user["id"])

    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO refresh_tokens (id, user_id, token_hash, issued_at, expires_at, revoked)
            VALUES (?,?,?,?,?,FALSE)
            """,
            (str(uuid.uuid4()), user["id"], refresh_hash, int(time.time()), expires_at),
        )
        await db.commit()

    await write_audit_event(
        action="auth.login",
        outcome="success",
        actor_id=user["id"],
        actor_username=user["username"],
        ip_address=ip,
        metadata={"totp_required": False},
    )
    return LoginResponse(
        requires_totp=False,
        access_token=access_token,
        refresh_token=raw_refresh,
        username=user["username"],
        role=user["role_name"],
    )


@router.post("/totp/verify", response_model=LoginResponse)
async def totp_verify(body: TOTPVerifyRequest, request: Request) -> LoginResponse:
    ip = _ip(request)
    from config import get_settings
    from jose import jwt as jose_jwt, JWTError

    try:
        claims = jose_jwt.decode(
            body.session_token, get_settings().jwt_secret, algorithms=["HS256"]
        )
        if claims.get("type") != "totp_pending":
            raise JWTError("Wrong token type")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session token")

    user_id: str = claims["sub"]
    username: str = claims["username"]
    role_name: str = claims["role"]

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT totp_secret, totp_enabled, role_id FROM users WHERE id = ? AND is_active = TRUE",
            (user_id,),
        )
        user = await cursor.fetchone()

    if not user or not user["totp_enabled"] or not user["totp_secret"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TOTP not enabled")

    # totp_secret stored as "ct_b64:nonce_b64"
    parts = user["totp_secret"].split(":")
    if len(parts) != 2:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="TOTP config error")

    secret = decrypt_totp_secret(parts[0], parts[1])

    if not verify_totp(secret, body.code.strip()):
        await write_audit_event(
            action="auth.totp",
            outcome="denied",
            actor_id=user_id,
            actor_username=username,
            ip_address=ip,
            metadata={"reason": "wrong_code"},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid TOTP code")

    access_token = create_access_token(user_id, username, role_name)
    raw_refresh, refresh_hash, expires_at = create_refresh_token(user_id)

    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO refresh_tokens (id, user_id, token_hash, issued_at, expires_at, revoked)
            VALUES (?,?,?,?,?,FALSE)
            """,
            (str(uuid.uuid4()), user_id, refresh_hash, int(time.time()), expires_at),
        )
        await db.commit()

    await write_audit_event(
        action="auth.totp",
        outcome="success",
        actor_id=user_id,
        actor_username=username,
        ip_address=ip,
    )
    return LoginResponse(
        requires_totp=False,
        access_token=access_token,
        refresh_token=raw_refresh,
        username=username,
        role=role_name,
    )


@router.post("/refresh", response_model=LoginResponse)
async def refresh_tokens(body: RefreshRequest, request: Request) -> LoginResponse:
    token_hash = hash_refresh_token(body.refresh_token)
    now = int(time.time())

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked,
                   u.username, u.is_active, r.name as role_name
            FROM refresh_tokens rt
            JOIN users u ON rt.user_id = u.id
            LEFT JOIN roles r ON u.role_id = r.id
            WHERE rt.token_hash = ?
            """,
            (token_hash,),
        )
        tok = await cursor.fetchone()

        if tok is None or tok["revoked"] or tok["expires_at"] < now or not tok["is_active"]:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

        # Rotate: revoke old, issue new
        await db.execute(
            "UPDATE refresh_tokens SET revoked = TRUE WHERE id = ?", (tok["id"],)
        )

        raw_refresh, refresh_hash, expires_at = create_refresh_token(tok["user_id"])
        await db.execute(
            """
            INSERT INTO refresh_tokens (id, user_id, token_hash, issued_at, expires_at, revoked)
            VALUES (?,?,?,?,?,FALSE)
            """,
            (str(uuid.uuid4()), tok["user_id"], refresh_hash, now, expires_at),
        )
        await db.commit()

    access_token = create_access_token(tok["user_id"], tok["username"], tok["role_name"] or "readonly")

    return LoginResponse(
        requires_totp=False,
        access_token=access_token,
        refresh_token=raw_refresh,
        username=tok["username"],
        role=tok["role_name"],
    )


@router.post("/logout")
async def logout(
    body: RefreshRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    token_hash = hash_refresh_token(body.refresh_token)
    async with get_db() as db:
        await db.execute(
            "UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = ? AND user_id = ?",
            (token_hash, current_user.user_id),
        )
        await db.commit()
    await write_audit_event(
        action="auth.logout",
        outcome="success",
        actor_id=current_user.user_id,
        actor_username=current_user.username,
    )
    return {"ok": True}


@router.get("/totp/setup", response_model=TOTPSetupResponse)
async def totp_setup(current_user: AuthenticatedUser = Depends(get_current_user)) -> TOTPSetupResponse:
    """Return a new TOTP secret and QR code for the current user to enroll."""
    secret = generate_totp_secret()
    uri = get_totp_uri(secret, current_user.username)
    import base64
    qr_bytes = generate_qr_png(uri)
    return TOTPSetupResponse(
        secret=secret,
        uri=uri,
        qr_png_b64=base64.b64encode(qr_bytes).decode(),
    )


@router.post("/totp/enable")
async def totp_enable(
    body: TOTPEnableRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    """Enable TOTP for the current user after verifying a code from the new secret."""
    # The secret must have been stored temporarily — here we re-derive from DB
    # For the enable flow, the secret is passed in the request body alongside the code.
    # We validate and then encrypt + store.
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Call POST /auth/totp/enable with {secret, code} to activate TOTP",
    )


@router.post("/totp/enable/confirm")
async def totp_enable_confirm(
    body: dict,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    """
    Confirm TOTP enrollment: verify the code against the provided secret,
    then encrypt + store the secret and enable TOTP for the user.
    """
    secret: str = body.get("secret", "")
    code: str = body.get("code", "")

    if not secret or not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="secret and code required")

    if not verify_totp(secret, code.strip()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TOTP code invalid")

    ct_b64, nonce_b64 = encrypt_totp_secret(secret)
    stored = f"{ct_b64}:{nonce_b64}"

    async with get_db() as db:
        await db.execute(
            "UPDATE users SET totp_secret = ?, totp_enabled = TRUE WHERE id = ?",
            (stored, current_user.user_id),
        )
        await db.commit()

    await write_audit_event(
        action="auth.totp_enabled",
        outcome="success",
        actor_id=current_user.user_id,
        actor_username=current_user.username,
    )
    return {"ok": True, "totp_enabled": True}
