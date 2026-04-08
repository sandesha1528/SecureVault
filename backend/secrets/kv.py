from __future__ import annotations

from typing import Any, Dict, List, Optional

from secrets.engine import (
    create_secret,
    hard_delete_secret,
    list_secret_paths,
    list_secret_versions,
    read_secret,
    soft_delete_secret,
)

# Re-export engine functions with KV-flavoured names for the API layer


async def kv_put(
    path: str,
    value: str,
    metadata: Optional[Dict[str, Any]],
    created_by: str,
    expires_at: Optional[int] = None,
) -> Dict[str, Any]:
    return await create_secret(
        path=path,
        value=value,
        metadata=metadata,
        created_by=created_by,
        expires_at=expires_at,
    )


async def kv_get(path: str, version: Optional[int] = None) -> Dict[str, Any]:
    return await read_secret(path=path, version=version)


async def kv_list(prefix: str = "") -> List[str]:
    return await list_secret_paths(prefix=prefix)


async def kv_versions(path: str) -> List[Dict[str, Any]]:
    return await list_secret_versions(path=path)


async def kv_delete(path: str, hard: bool = False) -> None:
    if hard:
        await hard_delete_secret(path)
    else:
        await soft_delete_secret(path)
