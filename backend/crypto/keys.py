from __future__ import annotations

import os

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.asymmetric.rsa import generate_private_key
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PublicFormat,
    PrivateFormat,
)


def generate_ed25519_keypair() -> tuple[bytes, bytes]:
    """
    Generate an Ed25519 keypair.

    Returns:
        (private_key_bytes, public_key_bytes) in OpenSSH format.
    """
    private_key = Ed25519PrivateKey.generate()
    private_bytes = private_key.private_bytes(
        encoding=Encoding.PEM,
        format=PrivateFormat.OpenSSH,
        encryption_algorithm=NoEncryption(),
    )
    public_bytes = private_key.public_key().public_bytes(
        encoding=Encoding.OpenSSH,
        format=PublicFormat.OpenSSH,
    )
    return private_bytes, public_bytes


def generate_rsa_keypair(key_size: int = 4096) -> tuple[bytes, bytes]:
    """
    Generate an RSA keypair.

    Returns:
        (private_key_pem, public_key_openssh) as bytes.
    """
    private_key = generate_private_key(public_exponent=65537, key_size=key_size)
    private_bytes = private_key.private_bytes(
        encoding=Encoding.PEM,
        format=PrivateFormat.OpenSSH,
        encryption_algorithm=NoEncryption(),
    )
    public_bytes = private_key.public_key().public_bytes(
        encoding=Encoding.OpenSSH,
        format=PublicFormat.OpenSSH,
    )
    return private_bytes, public_bytes


def generate_aes256_key() -> bytes:
    """Generate a random 256-bit AES key."""
    return os.urandom(32)


def generate_random_password(length: int = 32) -> str:
    """Generate a URL-safe random password string."""
    import secrets
    return secrets.token_urlsafe(length)
