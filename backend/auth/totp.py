from __future__ import annotations

import io
from typing import Optional, Tuple

import pyotp
import qrcode
import structlog

from crypto.vault import decrypt_with_master_key, encrypt_with_master_key

log = structlog.get_logger(__name__)

_ISSUER = "SecureVault"


def generate_totp_secret() -> str:
    """Generate a random base32-encoded TOTP secret."""
    return pyotp.random_base32()


def get_totp_uri(secret: str, username: str) -> str:
    """Return an otpauth:// URI suitable for QR code generation."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=username, issuer_name=_ISSUER)


def generate_qr_png(totp_uri: str) -> bytes:
    """Generate a QR code PNG for the given TOTP URI."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(totp_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def verify_totp(secret: str, code: str) -> bool:
    """
    Verify a 6-digit TOTP code. Allows one time-step of drift (±30 seconds).
    """
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def encrypt_totp_secret(secret: str) -> Tuple[str, str]:
    """Encrypt the TOTP secret for database storage. Returns (ct_b64, nonce_b64)."""
    return encrypt_with_master_key(secret.encode())


def decrypt_totp_secret(ct_b64: str, nonce_b64: str) -> str:
    """Decrypt a stored TOTP secret."""
    return decrypt_with_master_key(ct_b64, nonce_b64).decode()
