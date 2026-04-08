from __future__ import annotations

import base64
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class CryptoError(Exception):
    """Raised on decryption failure — indicates tampered ciphertext or wrong key."""


_NONCE_BYTES = 12   # 96-bit nonce — the only safe nonce length for GCM
_KEY_BYTES = 32     # 256-bit key


def _validate_key(key: bytes) -> None:
    if len(key) != _KEY_BYTES:
        raise CryptoError(f"AES key must be exactly {_KEY_BYTES} bytes, got {len(key)}")


def encrypt(plaintext: bytes, key: bytes) -> tuple[bytes, bytes]:
    """
    Encrypt plaintext with AES-256-GCM.

    A fresh random 96-bit nonce is generated for every call — never reused.
    The GCM authentication tag (16 bytes) is appended to the ciphertext by
    the cryptography library automatically.

    Returns:
        (ciphertext_with_tag, nonce) — both as raw bytes.
    """
    _validate_key(key)
    nonce = os.urandom(_NONCE_BYTES)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    return ciphertext, nonce


def decrypt(ciphertext: bytes, nonce: bytes, key: bytes) -> bytes:
    """
    Decrypt AES-256-GCM ciphertext.

    Raises CryptoError if the authentication tag doesn't match — meaning the
    ciphertext has been tampered with, the key is wrong, or the nonce is wrong.
    """
    _validate_key(key)
    aesgcm = AESGCM(key)
    try:
        return aesgcm.decrypt(nonce, ciphertext, None)
    except InvalidTag as exc:
        raise CryptoError("AES-GCM authentication tag mismatch — decryption failed") from exc


def encrypt_b64(plaintext: bytes, key: bytes) -> tuple[str, str]:
    """Encrypt and return (ciphertext_b64, nonce_b64) for database storage."""
    ct, nonce = encrypt(plaintext, key)
    return base64.b64encode(ct).decode(), base64.b64encode(nonce).decode()


def decrypt_b64(ciphertext_b64: str, nonce_b64: str, key: bytes) -> bytes:
    """Decode base64 inputs and decrypt."""
    ct = base64.b64decode(ciphertext_b64)
    nonce = base64.b64decode(nonce_b64)
    return decrypt(ct, nonce, key)
