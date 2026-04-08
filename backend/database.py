from __future__ import annotations

import json
import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

import aiosqlite
import structlog

from config import get_settings

log = structlog.get_logger(__name__)

_DB_PATH: str = ""


def _db_path() -> str:
    global _DB_PATH
    if not _DB_PATH:
        _DB_PATH = get_settings().db_path
    return _DB_PATH


@asynccontextmanager
async def get_db() -> AsyncIterator[aiosqlite.Connection]:
    db = await aiosqlite.connect(_db_path())
    db.row_factory = aiosqlite.Row
    try:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA foreign_keys=ON")
        await db.execute("PRAGMA synchronous=NORMAL")
        yield db
    finally:
        await db.close()


# ── Schema ─────────────────────────────────────────────────────────────────────

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    totp_secret TEXT,
    totp_enabled BOOLEAN DEFAULT FALSE,
    role_id TEXT REFERENCES roles(id),
    created_at INTEGER NOT NULL,
    last_login INTEGER,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    parent_role_id TEXT REFERENCES roles(id),
    permissions TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL UNIQUE,
    issued_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS secrets (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    version INTEGER NOT NULL,
    value_enc TEXT NOT NULL,
    nonce TEXT NOT NULL,
    dek_enc TEXT NOT NULL,
    dek_nonce TEXT NOT NULL,
    metadata TEXT,
    created_by TEXT REFERENCES users(id),
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    deleted BOOLEAN DEFAULT FALSE,
    UNIQUE(path, version)
);

CREATE INDEX IF NOT EXISTS idx_secrets_path ON secrets(path);
CREATE INDEX IF NOT EXISTS idx_secrets_path_version ON secrets(path, version);

CREATE TABLE IF NOT EXISTS ssh_certificates (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    public_key_fingerprint TEXT NOT NULL,
    signed_cert TEXT NOT NULL,
    principals TEXT NOT NULL,
    valid_from INTEGER NOT NULL,
    valid_to INTEGER NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at INTEGER,
    issued_at INTEGER NOT NULL,
    serial INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ssh_certs_user ON ssh_certificates(user_id);

CREATE TABLE IF NOT EXISTS ssh_ca_keys (
    id TEXT PRIMARY KEY,
    public_key TEXT NOT NULL,
    private_key_enc TEXT NOT NULL,
    private_key_nonce TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    retired BOOLEAN DEFAULT FALSE,
    fingerprint TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ssh_cert_serial (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    next_serial INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS rotation_configs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    db_type TEXT NOT NULL,
    connection_string_enc TEXT NOT NULL,
    nonce TEXT NOT NULL,
    secret_path TEXT NOT NULL,
    rotation_interval_hours INTEGER DEFAULT 24,
    last_rotated_at INTEGER,
    next_rotation_at INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    webhook_url TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    actor_id TEXT,
    actor_username TEXT,
    action TEXT NOT NULL,
    resource TEXT,
    outcome TEXT NOT NULL,
    ip_address TEXT,
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);

CREATE TABLE IF NOT EXISTS vault_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

# ── Built-in roles ──────────────────────────────────────────────────────────────

_BUILTIN_ROLES = [
    {
        "id": "role-superadmin",
        "name": "superadmin",
        "parent_role_id": None,
        "permissions": json.dumps(["admin:*"]),
    },
    {
        "id": "role-admin",
        "name": "admin",
        "parent_role_id": "role-superadmin",
        "permissions": json.dumps([
            "secrets:read:*",
            "secrets:write:*",
            "secrets:delete:*",
            "ssh:sign",
            "ssh:revoke",
            "ssh:rotate_ca",
            "rotation:read",
            "rotation:write",
            "rotation:trigger",
            "users:read",
            "users:write",
            "audit:read",
        ]),
    },
    {
        "id": "role-developer",
        "name": "developer",
        "parent_role_id": None,
        "permissions": json.dumps([
            "secrets:read:dev/*",
            "secrets:write:dev/*",
            "ssh:sign",
            "audit:read",
        ]),
    },
    {
        "id": "role-readonly",
        "name": "readonly",
        "parent_role_id": None,
        "permissions": json.dumps([
            "secrets:read:*",
        ]),
    },
]


async def run_migrations() -> None:
    async with get_db() as db:
        await db.executescript(_SCHEMA)
        # Seed serial counter
        await db.execute(
            "INSERT OR IGNORE INTO ssh_cert_serial (id, next_serial) VALUES (1, 1)"
        )
        # Seed built-in roles
        for role in _BUILTIN_ROLES:
            await db.execute(
                """
                INSERT OR IGNORE INTO roles (id, name, parent_role_id, permissions)
                VALUES (:id, :name, :parent_role_id, :permissions)
                """,
                role,
            )
        await db.commit()
    log.info("database.migrations_complete", path=_db_path())


async def get_next_ssh_serial(db: aiosqlite.Connection) -> int:
    await db.execute(
        "UPDATE ssh_cert_serial SET next_serial = next_serial + 1 WHERE id = 1"
    )
    cursor = await db.execute("SELECT next_serial FROM ssh_cert_serial WHERE id = 1")
    row = await cursor.fetchone()
    return int(row["next_serial"])
