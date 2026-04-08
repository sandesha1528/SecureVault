from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Optional

import structlog

from database import get_db

log = structlog.get_logger(__name__)


async def write_audit_event(
    action: str,
    outcome: str,
    actor_id: Optional[str] = None,
    actor_username: Optional[str] = None,
    resource: Optional[str] = None,
    ip_address: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Append an audit event to the immutable audit_log table.
    This function never raises — audit failures are logged but don't crash callers.
    """
    ts = int(time.time() * 1000)
    meta_json = json.dumps(metadata) if metadata else None

    try:
        async with get_db() as db:
            await db.execute(
                """
                INSERT INTO audit_log
                  (ts, actor_id, actor_username, action, resource, outcome, ip_address, metadata)
                VALUES (?,?,?,?,?,?,?,?)
                """,
                (
                    ts,
                    actor_id,
                    actor_username,
                    action,
                    resource,
                    outcome,
                    ip_address,
                    meta_json,
                ),
            )
            await db.commit()
    except Exception as exc:
        # Audit write failure is logged but must never propagate to callers
        log.error("audit.write_failed", action=action, error=str(exc), exc_info=True)


async def query_audit_log(
    limit: int = 100,
    offset: int = 0,
    action_filter: Optional[str] = None,
    actor_filter: Optional[str] = None,
    outcome_filter: Optional[str] = None,
    since_ts: Optional[int] = None,
    until_ts: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Query the audit log with optional filters.
    Results are ordered newest-first. No DELETE or UPDATE routes are provided.
    """
    conditions = []
    params: list = []

    if action_filter:
        conditions.append("action LIKE ?")
        params.append(f"%{action_filter}%")
    if actor_filter:
        conditions.append("(actor_id = ? OR actor_username LIKE ?)")
        params.extend([actor_filter, f"%{actor_filter}%"])
    if outcome_filter:
        conditions.append("outcome = ?")
        params.append(outcome_filter)
    if since_ts is not None:
        conditions.append("ts >= ?")
        params.append(since_ts)
    if until_ts is not None:
        conditions.append("ts <= ?")
        params.append(until_ts)

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.extend([limit, offset])

    async with get_db() as db:
        cursor = await db.execute(
            f"""
            SELECT id, ts, actor_id, actor_username, action, resource,
                   outcome, ip_address, metadata
            FROM audit_log
            {where_clause}
            ORDER BY ts DESC
            LIMIT ? OFFSET ?
            """,
            params,
        )
        rows = await cursor.fetchall()

    return [
        {
            "id": r["id"],
            "ts": r["ts"],
            "actor_id": r["actor_id"],
            "actor_username": r["actor_username"],
            "action": r["action"],
            "resource": r["resource"],
            "outcome": r["outcome"],
            "ip_address": r["ip_address"],
            "metadata": json.loads(r["metadata"]) if r["metadata"] else None,
        }
        for r in rows
    ]


async def count_audit_events(action_filter: Optional[str] = None) -> int:
    """Return the total count of audit events, optionally filtered by action."""
    async with get_db() as db:
        if action_filter:
            cursor = await db.execute(
                "SELECT COUNT(*) as cnt FROM audit_log WHERE action LIKE ?",
                (f"%{action_filter}%",),
            )
        else:
            cursor = await db.execute("SELECT COUNT(*) as cnt FROM audit_log")
        row = await cursor.fetchone()
    return int(row["cnt"])
