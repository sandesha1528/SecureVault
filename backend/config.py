from __future__ import annotations

import os
from functools import lru_cache
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SECUREVAULT_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Core
    env: str = "production"
    version: str = "1.0.0"

    # Admin bootstrap
    admin_password: str

    # JWT
    jwt_secret: str
    access_token_ttl: int = 15          # minutes
    refresh_token_ttl: int = 7           # days

    # Vault / Crypto
    root_token: str
    kdf_iterations: int = 600_000

    # Database
    db_path: str = "/app/data/securevault.db"

    # SSH CA
    ca_dir: str = "/app/ca"
    ssh_cert_ttl_hours: int = 8

    # CORS — stored as a comma-separated string in env
    cors_origins: str = "http://localhost:3000"

    # Logging
    log_level: str = "INFO"

    # Rotation scheduler
    rotation_poll_interval: int = 60    # seconds

    @field_validator("jwt_secret")
    @classmethod
    def jwt_secret_length(cls, v: str) -> str:
        if len(v) < 64:
            raise ValueError(
                "SECUREVAULT_JWT_SECRET must be at least 64 characters. "
                "Generate with: python3 -c \"import secrets; print(secrets.token_hex(64))\""
            )
        return v

    @field_validator("root_token")
    @classmethod
    def root_token_length(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError(
                "SECUREVAULT_ROOT_TOKEN must be at least 32 characters. "
                "Generate with: python3 -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return v

    @field_validator("kdf_iterations")
    @classmethod
    def kdf_iterations_minimum(cls, v: int) -> int:
        if v < 600_000:
            raise ValueError("SECUREVAULT_KDF_ITERATIONS must be >= 600000")
        return v

    def parsed_cors_origins(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
