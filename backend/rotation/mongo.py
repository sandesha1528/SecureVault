from __future__ import annotations

import re
import secrets

import motor.motor_asyncio
import structlog

from crypto.vault import decrypt_with_master_key
from secrets.engine import create_secret

log = structlog.get_logger(__name__)


async def rotate_mongo(config: dict) -> str:
    """
    Rotate a MongoDB user's password.

    Steps:
      1. Decrypt connection string.
      2. Connect with current credentials.
      3. Generate a new 32-char password.
      4. db.command(updateUser ...) with new password.
      5. Verify connectivity with new password.
      6. Write to vault.
    """
    dsn = decrypt_with_master_key(
        config["connection_string_enc"], config["nonce"]
    ).decode()

    username, db_name = _extract_mongo_user_db(dsn)
    new_password = secrets.token_urlsafe(32)

    client = motor.motor_asyncio.AsyncIOMotorClient(dsn, serverSelectionTimeoutMS=10000)
    try:
        db = client[db_name]
        await db.command(
            "updateUser",
            username,
            pwd=new_password,
        )
        log.info("rotation.mongo.password_changed", username=username, db=db_name)
    finally:
        client.close()

    # Verify new password
    new_dsn = _replace_mongo_password(dsn, new_password)
    verify_client = motor.motor_asyncio.AsyncIOMotorClient(
        new_dsn, serverSelectionTimeoutMS=10000
    )
    try:
        await verify_client.admin.command("ping")
        log.info("rotation.mongo.verified")
    finally:
        verify_client.close()

    await create_secret(
        path=config["secret_path"],
        value=new_password,
        metadata={"db_type": "mongo", "rotation_config_id": config["id"]},
        created_by="system",
    )

    return new_password


def _extract_mongo_user_db(dsn: str) -> tuple[str, str]:
    """Extract username and auth database from a MongoDB DSN."""
    match = re.match(r"mongodb(?:\+srv)?://([^:]+):[^@]+@[^/]+/([^?]+)", dsn)
    if not match:
        raise ValueError(f"Cannot parse MongoDB DSN: {dsn}")
    return match.group(1), match.group(2)


def _replace_mongo_password(dsn: str, new_password: str) -> str:
    """Replace the password in a MongoDB DSN."""
    return re.sub(r'(://[^:]+:)[^@]+(@)', rf'\g<1>{new_password}\2', dsn)
