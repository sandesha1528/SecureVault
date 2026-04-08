from __future__ import annotations

import re
import secrets

import redis.asyncio as aioredis
import structlog

from crypto.vault import decrypt_with_master_key
from secrets.engine import create_secret

log = structlog.get_logger(__name__)


async def rotate_redis(config: dict) -> str:
    """
    Rotate a Redis requirepass password.

    Steps:
      1. Decrypt connection string.
      2. Connect with current password.
      3. Generate new 32-char password.
      4. CONFIG SET requirepass <new>.
      5. Reconnect with new password to verify.
      6. Write to vault.
    """
    dsn = decrypt_with_master_key(
        config["connection_string_enc"], config["nonce"]
    ).decode()

    new_password = secrets.token_urlsafe(32)

    client = aioredis.from_url(dsn, socket_timeout=10)
    try:
        await client.config_set("requirepass", new_password)
        log.info("rotation.redis.password_changed")
    finally:
        await client.aclose()

    # Verify with new password
    new_dsn = _replace_redis_password(dsn, new_password)
    verify_client = aioredis.from_url(new_dsn, socket_timeout=10)
    try:
        await verify_client.ping()
        log.info("rotation.redis.verified")
    finally:
        await verify_client.aclose()

    await create_secret(
        path=config["secret_path"],
        value=new_password,
        metadata={"db_type": "redis", "rotation_config_id": config["id"]},
        created_by="system",
    )

    return new_password


def _replace_redis_password(dsn: str, new_password: str) -> str:
    """Replace the password in a redis://[:pass@]host:port/db DSN."""
    return re.sub(r'(://:?)[^@]+(@)', rf'\g<1>{new_password}\2', dsn)
