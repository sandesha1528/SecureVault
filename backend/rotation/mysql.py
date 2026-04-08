from __future__ import annotations

import re
import secrets

import aiomysql
import structlog

from crypto.vault import decrypt_with_master_key
from secrets.engine import create_secret

log = structlog.get_logger(__name__)


async def rotate_mysql(config: dict) -> str:
    """
    Rotate a MySQL user's password.

    Steps:
      1. Decrypt DSN.
      2. Connect with current credentials.
      3. Generate new 32-char password.
      4. ALTER USER to set new password.
      5. Verify with new password.
      6. Write to vault.
    """
    dsn = decrypt_with_master_key(
        config["connection_string_enc"], config["nonce"]
    ).decode()

    host, port, user, password, db_name = _parse_mysql_dsn(dsn)
    new_password = secrets.token_urlsafe(32)

    conn = await aiomysql.connect(
        host=host, port=port, user=user, password=password, db=db_name
    )
    try:
        async with conn.cursor() as cursor:
            # MySQL requires this exact syntax; user is our internal value
            await cursor.execute(
                f"ALTER USER '{user}'@'%' IDENTIFIED BY %s", (new_password,)
            )
            await cursor.execute("FLUSH PRIVILEGES")
        conn.commit()
        log.info("rotation.mysql.password_changed", user=user)
    finally:
        conn.close()

    # Verify
    verify_conn = await aiomysql.connect(
        host=host, port=port, user=user, password=new_password, db=db_name
    )
    verify_conn.close()
    log.info("rotation.mysql.verified")

    await create_secret(
        path=config["secret_path"],
        value=new_password,
        metadata={"db_type": "mysql", "rotation_config_id": config["id"]},
        created_by="system",
    )

    return new_password


def _parse_mysql_dsn(dsn: str) -> tuple[str, int, str, str, str]:
    """Parse mysql://user:pass@host:port/dbname into components."""
    match = re.match(
        r"mysql(?:\+aiomysql)?://([^:]+):([^@]+)@([^:/]+):?(\d+)?/(.+)", dsn
    )
    if not match:
        raise ValueError(f"Cannot parse MySQL DSN: {dsn}")
    user, password, host, port_str, db_name = match.groups()
    port = int(port_str) if port_str else 3306
    return host, port, user, password, db_name
