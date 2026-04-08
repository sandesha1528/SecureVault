from __future__ import annotations

import fnmatch
import json
from functools import lru_cache
from typing import Dict, List, Optional, Set

import structlog

log = structlog.get_logger(__name__)

# ── Permission constants ────────────────────────────────────────────────────────

ALL_PERMISSIONS = [
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
    "admin:*",
]

# In-memory role cache: role_id → resolved permission set
_role_permission_cache: Dict[str, Set[str]] = {}


def invalidate_role_cache(role_id: Optional[str] = None) -> None:
    """Invalidate the permission cache for a role or all roles."""
    global _role_permission_cache
    if role_id:
        _role_permission_cache.pop(role_id, None)
    else:
        _role_permission_cache.clear()
    log.debug("rbac.cache_invalidated", role_id=role_id)


async def resolve_permissions(role_id: str, db) -> Set[str]:
    """
    Recursively resolve all permissions for a role, following parent_role_id chains.
    Results are cached in memory and invalidated when roles change.
    """
    if role_id in _role_permission_cache:
        return _role_permission_cache[role_id]

    visited: Set[str] = set()
    permissions: Set[str] = set()

    async def _collect(rid: str) -> None:
        if rid in visited:
            return
        visited.add(rid)
        cursor = await db.execute(
            "SELECT permissions, parent_role_id FROM roles WHERE id = ?", (rid,)
        )
        row = await cursor.fetchone()
        if row is None:
            return
        perms = json.loads(row["permissions"])
        permissions.update(perms)
        if row["parent_role_id"]:
            await _collect(row["parent_role_id"])

    await _collect(role_id)
    _role_permission_cache[role_id] = permissions
    return permissions


def check_permission(permissions: Set[str], required: str) -> bool:
    """
    Check whether required permission is satisfied by the permission set.

    Supports:
      - Exact match: "ssh:sign"
      - Wildcard admin: "admin:*" grants everything
      - Glob on path: "secrets:read:prod/*" matches "secrets:read:prod/db"
    """
    if "admin:*" in permissions:
        return True

    for perm in permissions:
        if perm == required:
            return True
        # Glob match for path-based permissions
        if fnmatch.fnmatch(required, perm):
            return True

    return False


def require_permission(permissions: Set[str], required: str) -> None:
    """Raise PermissionError if required permission is not satisfied."""
    if not check_permission(permissions, required):
        raise PermissionError(f"Missing permission: {required}")


def get_ssh_principals_for_role(role_name: str) -> List[str]:
    """
    Return the SSH principals a role is allowed to use.
    These are the usernames the cert will allow SSH access as.
    """
    _defaults: Dict[str, List[str]] = {
        "superadmin": ["ubuntu", "ec2-user", "root", "admin", "deploy"],
        "admin":       ["ubuntu", "ec2-user", "admin", "deploy"],
        "developer":   ["ubuntu", "deploy"],
        "readonly":    [],
    }
    return _defaults.get(role_name, ["ubuntu"])
