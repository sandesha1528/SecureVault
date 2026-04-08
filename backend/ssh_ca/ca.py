from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Dict, List, Optional

import structlog

from config import get_settings
from crypto.vault import decrypt_with_master_key, encrypt_with_master_key
from database import get_db, get_next_ssh_serial
from ssh_ca.signer import sign_certificate_subprocess

import os
import subprocess
import tempfile

log = structlog.get_logger(__name__)


def _ca_dir() -> Path:
    return Path(get_settings().ca_dir)


async def generate_ca_keypair() -> Dict[str, object]:
    """
    Generate an Ed25519 CA keypair using ssh-keygen.
    The private key is encrypted with the vault master key before storage.
    Returns the DB row dict.
    """
    ca_dir = _ca_dir()
    ca_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmpdir:
        key_path = os.path.join(tmpdir, "ca_key")
        result = subprocess.run(
            [
                "ssh-keygen",
                "-t", "ed25519",
                "-f", key_path,
                "-N", "",
                "-C", "securevault-ca",
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ssh-keygen CA generation failed: {result.stderr}")

        with open(key_path, "rb") as f:
            private_key_bytes = f.read()
        with open(key_path + ".pub") as f:
            public_key_str = f.read().strip()

    private_enc_b64, private_nonce_b64 = encrypt_with_master_key(private_key_bytes)
    fingerprint = _compute_pubkey_fingerprint(public_key_str)

    row: Dict[str, object] = {
        "id": str(uuid.uuid4()),
        "public_key": public_key_str,
        "private_key_enc": private_enc_b64,
        "private_key_nonce": private_nonce_b64,
        "created_at": int(time.time()),
        "retired": False,
        "fingerprint": fingerprint,
    }

    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO ssh_ca_keys
              (id, public_key, private_key_enc, private_key_nonce, created_at, retired, fingerprint)
            VALUES (:id,:public_key,:private_key_enc,:private_key_nonce,:created_at,:retired,:fingerprint)
            """,
            row,
        )
        await db.commit()

    log.info("ssh_ca.keypair_generated", fingerprint=fingerprint)
    return row


async def get_active_ca() -> Optional[Dict[str, object]]:
    """Return the active (non-retired) CA keypair row, or None."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM ssh_ca_keys WHERE retired = FALSE ORDER BY created_at DESC LIMIT 1"
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return dict(row)


async def get_ca_public_key() -> str:
    """Return the plaintext CA public key string."""
    ca = await get_active_ca()
    if ca is None:
        raise RuntimeError("No CA keypair found — run first boot sequence")
    return str(ca["public_key"])


async def _get_ca_private_key_bytes() -> bytes:
    """Decrypt and return the CA private key bytes."""
    ca = await get_active_ca()
    if ca is None:
        raise RuntimeError("No CA keypair found — run first boot sequence")
    return decrypt_with_master_key(str(ca["private_key_enc"]), str(ca["private_key_nonce"]))


async def sign_certificate(
    user_pubkey: str,
    username: str,
    principals: List[str],
    ttl_hours: int,
    user_id: str,
) -> Dict[str, object]:
    """
    Sign a user public key and issue an SSH certificate.
    Returns a dict with cert string and metadata.
    """
    if not principals:
        raise ValueError("At least one principal is required")

    private_key_bytes = await _get_ca_private_key_bytes()
    fingerprint = _compute_pubkey_fingerprint(user_pubkey)

    now = int(time.time())
    valid_to = now + ttl_hours * 3600
    identity = f"{username}@securevault-{now}"

    async with get_db() as db:
        serial = await get_next_ssh_serial(db)
        cert_str = await sign_certificate_subprocess(
            private_key_bytes=private_key_bytes,
            user_pubkey=user_pubkey,
            identity=identity,
            principals=principals,
            ttl_hours=ttl_hours,
            serial=serial,
        )

        cert_id = str(uuid.uuid4())
        await db.execute(
            """
            INSERT INTO ssh_certificates
              (id, user_id, public_key_fingerprint, signed_cert, principals,
               valid_from, valid_to, revoked, issued_at, serial)
            VALUES (?,?,?,?,?,?,?,FALSE,?,?)
            """,
            (
                cert_id, user_id, fingerprint, cert_str,
                json.dumps(principals), now, valid_to, now, serial,
            ),
        )
        await db.commit()

    log.info(
        "ssh_ca.cert_issued",
        cert_id=cert_id,
        username=username,
        principals=principals,
        ttl_hours=ttl_hours,
        fingerprint=fingerprint,
    )

    return {
        "cert_id": cert_id,
        "cert": cert_str,
        "fingerprint": fingerprint,
        "principals": principals,
        "valid_from": now,
        "valid_to": valid_to,
        "serial": serial,
    }


async def revoke_certificate(cert_id: str) -> bytes:
    """Mark a certificate as revoked and regenerate the KRL."""
    now = int(time.time())
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT id, signed_cert, revoked FROM ssh_certificates WHERE id = ?",
            (cert_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            raise ValueError(f"Certificate {cert_id} not found")
        if row["revoked"]:
            raise ValueError(f"Certificate {cert_id} is already revoked")
        await db.execute(
            "UPDATE ssh_certificates SET revoked = TRUE, revoked_at = ? WHERE id = ?",
            (now, cert_id),
        )
        await db.commit()

    log.info("ssh_ca.cert_revoked", cert_id=cert_id)
    return await _rebuild_krl()


async def get_krl() -> bytes:
    """Return the current KRL bytes, rebuilding if the file doesn't exist."""
    krl_path = _ca_dir() / "krl"
    if krl_path.exists():
        return krl_path.read_bytes()
    return await _rebuild_krl()


async def _rebuild_krl() -> bytes:
    """Rebuild the Key Revocation List from all revoked certificates."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT signed_cert FROM ssh_certificates WHERE revoked = TRUE"
        )
        rows = await cursor.fetchall()

    ca_dir = _ca_dir()
    krl_path = ca_dir / "krl"

    if not rows:
        krl_path.write_bytes(b"")
        return b""

    with tempfile.TemporaryDirectory() as tmpdir:
        cert_paths = []
        for i, row in enumerate(rows):
            cert_file = os.path.join(tmpdir, f"cert_{i}.pub")
            with open(cert_file, "w") as f:
                f.write(row["signed_cert"])
            cert_paths.append(cert_file)

        krl_file = os.path.join(tmpdir, "krl")
        ca_pub = await get_ca_public_key()
        ca_pub_path = os.path.join(tmpdir, "ca.pub")
        with open(ca_pub_path, "w") as f:
            f.write(ca_pub)

        result = subprocess.run(
            ["ssh-keygen", "-k", "-f", krl_file, "-z", str(len(rows)), ca_pub_path]
            + cert_paths,
            capture_output=True,
            timeout=30,
        )
        if result.returncode != 0:
            raise RuntimeError(f"KRL rebuild failed: {result.stderr.decode()}")

        krl_bytes = open(krl_file, "rb").read()
        krl_path.write_bytes(krl_bytes)
        return krl_bytes


async def rotate_ca() -> Dict[str, object]:
    """Generate a new CA keypair and retire the old one."""
    async with get_db() as db:
        await db.execute(
            "UPDATE ssh_ca_keys SET retired = TRUE WHERE retired = FALSE"
        )
        await db.commit()

    new_ca = await generate_ca_keypair()
    log.info("ssh_ca.rotated", new_fingerprint=new_ca["fingerprint"])
    return new_ca


def _compute_pubkey_fingerprint(pubkey_str: str) -> str:
    """Compute SHA256 fingerprint of a public key."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".pub", delete=False) as f:
        f.write(pubkey_str)
        fname = f.name
    try:
        result = subprocess.run(
            ["ssh-keygen", "-l", "-E", "sha256", "-f", fname],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            parts = result.stdout.strip().split()
            return parts[1] if len(parts) >= 2 else "unknown"
        return "unknown"
    finally:
        os.unlink(fname)
