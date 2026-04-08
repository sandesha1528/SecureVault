from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, List, Optional

import structlog

from crypto.vault import envelope_decrypt, envelope_encrypt
from database import get_db

log = structlog.get_logger(__name__)


async def create_secret(
    path: str,
    value: str,
    metadata: Optional[Dict[str, Any]],
    created_by: str,
    expires_at: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Create a new version of a secret at `path`.
    Each call increments the version number. Old versions are preserved.
    """
    encrypted = envelope_encrypt(value.encode())
    now = int(time.time())

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT COALESCE(MAX(version), 0) as max_ver FROM secrets WHERE path = ?",
            (path,),
        )
        row = await cursor.fetchone()
        next_version = int(row["max_ver"]) + 1

        secret_id = str(uuid.uuid4())
        await db.execute(
            """
            INSERT INTO secrets
              (id, path, version, value_enc, nonce, dek_enc, dek_nonce,
               metadata, created_by, created_at, expires_at, deleted)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,FALSE)
            """,
            (
                secret_id,
                path,
                next_version,
                encrypted["value_enc"],
                encrypted["nonce"],
                encrypted["dek_enc"],
                encrypted["dek_nonce"],
                json.dumps(metadata) if metadata else None,
                created_by,
                now,
                expires_at,
            ),
        )
        await db.commit()

    log.info("secrets.created", path=path, version=next_version, created_by=created_by)
    return {
        "id": secret_id,
        "path": path,
        "version": next_version,
        "created_at": now,
        "expires_at": expires_at,
        "metadata": metadata,
    }


async def read_secret(path: str, version: Optional[int] = None) -> Dict[str, Any]:
    """
    Read a secret by path. If version is None, returns the latest non-deleted version.
    Decrypts the value using envelope decryption.
    """
    async with get_db() as db:
        if version is not None:
            cursor = await db.execute(
                """
                SELECT * FROM secrets
                WHERE path = ? AND version = ? AND deleted = FALSE
                """,
                (path, version),
            )
        else:
            cursor = await db.execute(
                """
                SELECT * FROM secrets
                WHERE path = ? AND deleted = FALSE
                ORDER BY version DESC LIMIT 1
                """,
                (path,),
            )

        row = await cursor.fetchone()
        if row is None:
            raise KeyError(f"Secret not found: {path}" + (f" v{version}" if version else ""))

        # Check TTL
        if row["expires_at"] and int(time.time()) > row["expires_at"]:
            raise KeyError(f"Secret expired: {path}")

        value_bytes = envelope_decrypt(
            row["value_enc"], row["nonce"], row["dek_enc"], row["dek_nonce"]
        )

    return {
        "id": row["id"],
        "path": row["path"],
        "version": row["version"],
        "value": value_bytes.decode(),
        "metadata": json.loads(row["metadata"]) if row["metadata"] else None,
        "created_by": row["created_by"],
        "created_at": row["created_at"],
        "expires_at": row["expires_at"],
    }


async def list_secret_versions(path: str) -> List[Dict[str, Any]]:
    """Return all non-deleted versions of a secret path (no values)."""
    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT id, path, version, metadata, created_by, created_at, expires_at
            FROM secrets
            WHERE path = ? AND deleted = FALSE
            ORDER BY version DESC
            """,
            (path,),
        )
        rows = await cursor.fetchall()

    return [
        {
            "id": r["id"],
            "path": r["path"],
            "version": r["version"],
            "metadata": json.loads(r["metadata"]) if r["metadata"] else None,
            "created_by": r["created_by"],
            "created_at": r["created_at"],
            "expires_at": r["expires_at"],
        }
        for r in rows
    ]


async def soft_delete_secret(path: str) -> None:
    """Soft-delete all versions of a secret path."""
    async with get_db() as db:
        result = await db.execute(
            "UPDATE secrets SET deleted = TRUE WHERE path = ? AND deleted = FALSE",
            (path,),
        )
        if result.rowcount == 0:
            raise KeyError(f"Secret not found: {path}")
        await db.commit()
    log.info("secrets.soft_deleted", path=path)


async def hard_delete_secret(path: str) -> None:
    """Permanently delete all versions of a secret path from the database."""
    async with get_db() as db:
        await db.execute("DELETE FROM secrets WHERE path = ?", (path,))
        await db.commit()
    log.info("secrets.hard_deleted", path=path)


async def list_secret_paths(prefix: str = "") -> List[str]:
    """List all unique non-deleted secret paths, optionally filtered by prefix."""
    async with get_db() as db:
        if prefix:
            cursor = await db.execute(
                "SELECT DISTINCT path FROM secrets WHERE deleted = FALSE AND path LIKE ?",
                (f"{prefix}%",),
            )
        else:
            cursor = await db.execute(
                "SELECT DISTINCT path FROM secrets WHERE deleted = FALSE ORDER BY path"
            )
        rows = await cursor.fetchall()
    return [r["path"] for r in rows]
