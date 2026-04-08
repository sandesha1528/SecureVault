from __future__ import annotations

import base64
import hashlib
import os
from typing import Optional

import structlog

from crypto.aes import CryptoError, decrypt_b64, encrypt_b64

log = structlog.get_logger(__name__)

_MASTER_KEY: Optional[bytes] = None
_KDF_SALT: Optional[bytes] = None


def _pbkdf2(token: bytes, salt: bytes, iterations: int) -> bytes:
    """Derive a 256-bit key from token using PBKDF2-HMAC-SHA256."""
    return hashlib.pbkdf2_hmac(
        hash_name="sha256",
        password=token,
        salt=salt,
        iterations=iterations,
        dklen=32,
    )


def init_master_key(root_token: str, salt_b64: str, kdf_iterations: int) -> None:
    """
    Derive the master key in memory from the root token + stored salt.
    Called once during application startup. The derived key is held only in
    the module-level _MASTER_KEY variable — never written to disk.
    """
    global _MASTER_KEY, _KDF_SALT
    salt = base64.b64decode(salt_b64)
    _KDF_SALT = salt
    _MASTER_KEY = _pbkdf2(root_token.encode(), salt, kdf_iterations)
    log.info("vault.master_key_derived")


def generate_salt() -> str:
    """Generate a random 32-byte salt and return as base64. Call once on first boot."""
    return base64.b64encode(os.urandom(32)).decode()


def _get_master_key() -> bytes:
    if _MASTER_KEY is None:
        raise RuntimeError("Master key not initialised — call init_master_key() first")
    return _MASTER_KEY


def encrypt_with_master_key(plaintext: bytes) -> tuple[str, str]:
    """Encrypt plaintext directly with the master key. Returns (ct_b64, nonce_b64)."""
    return encrypt_b64(plaintext, _get_master_key())


def decrypt_with_master_key(ciphertext_b64: str, nonce_b64: str) -> bytes:
    """Decrypt ciphertext that was encrypted with the master key."""
    return decrypt_b64(ciphertext_b64, nonce_b64, _get_master_key())


def envelope_encrypt(plaintext: bytes) -> dict[str, str]:
    """
    Envelope encryption:
      1. Generate a random 256-bit Data Encryption Key (DEK).
      2. Encrypt the plaintext with the DEK using AES-256-GCM.
      3. Encrypt the DEK with the master key using AES-256-GCM.

    Returns a dict with four base64 fields suitable for storing in the DB:
      value_enc, nonce, dek_enc, dek_nonce
    """
    master_key = _get_master_key()
    dek = os.urandom(32)

    value_enc_b64, value_nonce_b64 = encrypt_b64(plaintext, dek)
    dek_enc_b64, dek_nonce_b64 = encrypt_b64(dek, master_key)

    return {
        "value_enc": value_enc_b64,
        "nonce": value_nonce_b64,
        "dek_enc": dek_enc_b64,
        "dek_nonce": dek_nonce_b64,
    }


def envelope_decrypt(value_enc: str, nonce: str, dek_enc: str, dek_nonce: str) -> bytes:
    """
    Reverse of envelope_encrypt:
      1. Decrypt DEK using master key.
      2. Decrypt value using DEK.

    Raises CryptoError on any authentication failure.
    """
    master_key = _get_master_key()
    dek = decrypt_b64(dek_enc, dek_nonce, master_key)
    return decrypt_b64(value_enc, nonce, dek)
