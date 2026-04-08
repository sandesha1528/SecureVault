from __future__ import annotations

import secrets
import structlog
import asyncpg

from crypto.vault import decrypt_with_master_key, encrypt_with_master_key
from secrets.engine import create_secret

log = structlog.get_logger(__name__)


async def rotate_postgres(config: dict) -> str:
    """
    Rotate a PostgreSQL user's password.

    Steps:
      1. Decrypt the DSN from the config.
      2. Connect with current credentials.
      3. Generate a new 32-char URL-safe password.
      4. ALTER USER to set new password.
      5. Verify connectivity with new creds.
      6. Write new creds to vault.

    Returns the new password (only used internally, never logged).
    """
    dsn = decrypt_with_master_key(
        config["connection_string_enc"], config["nonce"]
    ).decode()

    new_password = secrets.token_urlsafe(32)

    conn = await asyncpg.connect(dsn=dsn, timeout=10)
    try:
        # Extract username from connection info
        username = conn.get_settings().user
        # ALTER USER — parameterised identifier not supported by asyncpg for identifiers,
        # but we control the username from our own config, not from user input
        await conn.execute(
            f"ALTER USER \"{username}\" WITH PASSWORD $1", new_password
        )
        log.info("rotation.postgres.password_changed", username=username)
    finally:
        await conn.close()

    # Verify new password works
    import urllib.parse
    parsed = _replace_dsn_password(dsn, new_password)
    verify_conn = await asyncpg.connect(dsn=parsed, timeout=10)
    await verify_conn.close()
    log.info("rotation.postgres.verified")

    # Write new creds to vault
    await create_secret(
        path=config["secret_path"],
        value=new_password,
        metadata={"db_type": "postgres", "rotation_config_id": config["id"]},
        created_by="system",
    )

    return new_password


def _replace_dsn_password(dsn: str, new_password: str) -> str:
    """Replace the password in a postgresql DSN string."""
    import re
    return re.sub(r'(://[^:]+:)[^@]+(@)', rf'\g<1>{new_password}\2', dsn)
