from __future__ import annotations

import hashlib
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from jose import JWTError, jwt
from passlib.context import CryptContext

from config import get_settings

log = structlog.get_logger(__name__)

_ALGORITHM = "HS256"
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(plaintext: str) -> str:
    return _pwd_context.hash(plaintext)


def verify_password(plaintext: str, hashed: str) -> bool:
    return _pwd_context.verify(plaintext, hashed)


def _now_ts() -> int:
    return int(time.time())


def create_access_token(user_id: str, username: str, role: str) -> str:
    settings = get_settings()
    now = _now_ts()
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "iat": now,
        "exp": now + settings.access_token_ttl * 60,
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=_ALGORITHM)


def create_refresh_token(user_id: str) -> tuple[str, str, int]:
    """
    Create a refresh token.

    Returns:
        (raw_token, token_hash, expires_at_unix)

    The raw_token is returned to the client. Only the hash is stored in the DB.
    """
    settings = get_settings()
    now = _now_ts()
    expires_at = now + settings.refresh_token_ttl * 86400
    raw = str(uuid.uuid4()) + str(uuid.uuid4())
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    return raw, token_hash, expires_at


def decode_access_token(token: str) -> dict:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[_ALGORITHM])
        if payload.get("type") != "access":
            raise JWTError("Not an access token")
        return payload
    except JWTError as exc:
        raise ValueError(f"Invalid token: {exc}") from exc


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()
