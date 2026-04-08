from __future__ import annotations

import asyncio
import time
from typing import Optional

import structlog

from audit.log import write_audit_event
from config import get_settings
from database import get_db
from rotation.mongo import rotate_mongo
from rotation.mysql import rotate_mysql
from rotation.postgres import rotate_postgres
from rotation.redis import rotate_redis

log = structlog.get_logger(__name__)

_shutdown_event: Optional[asyncio.Event] = None


async def start_rotation_scheduler() -> None:
    """
    Start the async background rotation scheduler.
    Runs forever until shutdown_rotation_scheduler() is called.
    """
    global _shutdown_event
    _shutdown_event = asyncio.Event()
    settings = get_settings()

    log.info("rotation.scheduler_started", interval=settings.rotation_poll_interval)

    while not _shutdown_event.is_set():
        try:
            await _run_due_rotations()
        except Exception as exc:
            log.error("rotation.scheduler_unexpected_error", error=str(exc), exc_info=True)

        try:
            await asyncio.wait_for(
                _shutdown_event.wait(),
                timeout=float(settings.rotation_poll_interval),
            )
        except asyncio.TimeoutError:
            pass  # Expected — just means the interval has elapsed


async def shutdown_rotation_scheduler() -> None:
    if _shutdown_event:
        _shutdown_event.set()
    log.info("rotation.scheduler_stopped")


async def _run_due_rotations() -> None:
    now = int(time.time())
    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT * FROM rotation_configs
            WHERE is_active = TRUE
              AND (next_rotation_at IS NULL OR next_rotation_at <= ?)
            """,
            (now,),
        )
        configs = [dict(row) for row in await cursor.fetchall()]

    for config in configs:
        await _rotate_one(config)


async def _rotate_one(config: dict) -> None:
    db_type = config["db_type"]
    config_id = config["id"]
    name = config["name"]

    log.info("rotation.starting", config_id=config_id, name=name, db_type=db_type)

    try:
        rotator = {
            "postgres": rotate_postgres,
            "mysql": rotate_mysql,
            "redis": rotate_redis,
            "mongo": rotate_mongo,
        }.get(db_type)

        if rotator is None:
            raise ValueError(f"Unknown db_type: {db_type}")

        new_password = await rotator(config)

        now = int(time.time())
        next_time = now + config["rotation_interval_hours"] * 3600

        async with get_db() as db:
            await db.execute(
                """
                UPDATE rotation_configs
                SET last_rotated_at = ?, next_rotation_at = ?
                WHERE id = ?
                """,
                (now, next_time, config_id),
            )
            await db.commit()

        await write_audit_event(
            actor_id="system",
            actor_username="system",
            action="rotation.trigger",
            resource=config["secret_path"],
            outcome="success",
            metadata={"config_id": config_id, "db_type": db_type},
        )

        if config.get("webhook_url"):
            await _fire_webhook(config["webhook_url"], {
                "event": "rotation.success",
                "config_id": config_id,
                "name": name,
                "db_type": db_type,
                "secret_path": config["secret_path"],
                "rotated_at": now,
                "next_rotation_at": next_time,
            })

        log.info("rotation.success", config_id=config_id, next_at=next_time)

    except Exception as exc:
        log.error(
            "rotation.failed",
            config_id=config_id,
            name=name,
            db_type=db_type,
            error=str(exc),
            exc_info=True,
        )
        await write_audit_event(
            actor_id="system",
            actor_username="system",
            action="rotation.trigger",
            resource=config.get("secret_path", "unknown"),
            outcome="error",
            metadata={"config_id": config_id, "db_type": db_type, "error": str(exc)},
        )
        if config.get("webhook_url"):
            await _fire_webhook(config["webhook_url"], {
                "event": "rotation.failed",
                "config_id": config_id,
                "name": name,
                "db_type": db_type,
                "error": str(exc),
            })


async def _fire_webhook(url: str, payload: dict) -> None:
    """POST rotation metadata (NOT passwords) to the configured webhook URL."""
    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                log.info("rotation.webhook_fired", url=url, status=resp.status)
    except Exception as exc:
        log.warning("rotation.webhook_failed", url=url, error=str(exc))
