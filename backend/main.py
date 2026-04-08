from __future__ import annotations

import asyncio
import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.audit import router as audit_router
from api.auth import router as auth_router
from api.rbac import router as rbac_router
from api.rotation import router as rotation_router
from api.secrets import router as secrets_router
from api.ssh import router as ssh_router
from audit.log import write_audit_event
from auth.jwt import hash_password
from config import get_settings
from crypto.vault import generate_salt, init_master_key
from database import get_db, run_migrations
from rotation.scheduler import shutdown_rotation_scheduler, start_rotation_scheduler
from ssh_ca.ca import generate_ca_keypair, get_active_ca

import logging
import structlog

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()

    # ── 1. Run database migrations ────────────────────────────────────────────
    await run_migrations()

    # ── 2. Initialise vault master key ────────────────────────────────────────
    async with get_db() as db:
        cursor = await db.execute("SELECT value FROM vault_meta WHERE key = 'kdf_salt'")
        row = await cursor.fetchone()
        if row is None:
            salt_b64 = generate_salt()
            await db.execute(
                "INSERT INTO vault_meta (key, value) VALUES ('kdf_salt', ?)", (salt_b64,)
            )
            await db.commit()
            log.info("vault.salt_generated")
        else:
            salt_b64 = row["value"]

    init_master_key(settings.root_token, salt_b64, settings.kdf_iterations)
    log.info("vault.master_key_ready")

    # ── 3. Bootstrap superadmin user ──────────────────────────────────────────
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT id FROM users WHERE role_id = 'role-superadmin' LIMIT 1"
        )
        if await cursor.fetchone() is None:
            admin_id = str(uuid.uuid4())
            pw_hash = hash_password(settings.admin_password)
            await db.execute(
                """
                INSERT INTO users (id, username, password_hash, role_id, created_at, is_active)
                VALUES (?,?,?,?,?,TRUE)
                """,
                (admin_id, "admin", pw_hash, "role-superadmin", int(time.time())),
            )
            await db.commit()
            log.info("bootstrap.superadmin_created", username="admin")

    # ── 4. Generate SSH CA keypair if none exists ─────────────────────────────
    ca = await get_active_ca()
    if ca is None:
        ca = await generate_ca_keypair()
        log.info("bootstrap.ca_generated", fingerprint=ca["fingerprint"])
    else:
        log.info("bootstrap.ca_exists", fingerprint=ca["fingerprint"])

    # ── 5. Start rotation scheduler ───────────────────────────────────────────
    scheduler_task = asyncio.create_task(start_rotation_scheduler())

    log.info(
        "securevault.started",
        version=settings.version,
        ca_fingerprint=ca["fingerprint"],
        admin_username="admin",
        env=settings.env,
    )

    await write_audit_event(
        action="system.startup",
        outcome="success",
        actor_id="system",
        actor_username="system",
        metadata={"version": settings.version, "ca_fingerprint": ca["fingerprint"]},
    )

    yield  # Application is running

    # ── Shutdown ──────────────────────────────────────────────────────────────
    await shutdown_rotation_scheduler()
    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass

    log.info("securevault.shutdown")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="SecureVault",
        description="Zero-trust secrets manager, SSH certificate authority, and credential rotation engine.",
        version=settings.version,
        docs_url="/docs" if settings.env != "production" else None,
        redoc_url=None,
        lifespan=lifespan,
    )

    # ── CORS ─────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.parsed_cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["Authorization", "Content-Type"],
    )

    # ── Request ID middleware ─────────────────────────────────────────────────
    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        structlog.contextvars.bind_contextvars(request_id=request_id)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        structlog.contextvars.clear_contextvars()
        return response

    # ── Global exception handler ──────────────────────────────────────────────
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled_exception", path=str(request.url), error=str(exc), exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(auth_router)
    app.include_router(secrets_router)
    app.include_router(ssh_router)
    app.include_router(rbac_router)
    app.include_router(rotation_router)
    app.include_router(audit_router)

    @app.get("/health", tags=["health"])
    async def health() -> dict:
        return {"status": "ok", "version": settings.version}

    return app


app = create_app()
