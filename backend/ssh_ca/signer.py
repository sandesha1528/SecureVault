from __future__ import annotations

import os
import subprocess
import tempfile


async def sign_certificate_subprocess(
    private_key_bytes: bytes,
    user_pubkey: str,
    identity: str,
    principals: list[str],
    ttl_hours: int,
    serial: int,
) -> str:
    """
    Sign a user public key using ssh-keygen subprocess.

    The CA private key is written to a temp file (mode 600) that is deleted
    immediately after signing. The signed certificate is read back and returned
    as a string.

    Args:
        private_key_bytes: Raw bytes of the decrypted CA private key (PEM/OpenSSH).
        user_pubkey:        OpenSSH-format public key string from the user.
        identity:           Certificate identity string, e.g. "alice@securevault-1234".
        principals:         List of SSH usernames this cert allows access as.
        ttl_hours:          Certificate validity in hours.
        serial:             Monotonically incrementing serial number.

    Returns:
        The signed certificate string (ssh-ed25519-cert-v01@openssh.com or similar).
    """
    principals_str = ",".join(principals)
    validity = f"+{ttl_hours}h"

    with tempfile.TemporaryDirectory() as tmpdir:
        ca_key_path = os.path.join(tmpdir, "ca_key")
        user_pub_path = os.path.join(tmpdir, "user_key.pub")
        cert_path = os.path.join(tmpdir, "user_key-cert.pub")

        # Write CA private key with strict permissions
        with open(ca_key_path, "wb") as f:
            f.write(private_key_bytes)
        os.chmod(ca_key_path, 0o600)

        # Write user public key
        with open(user_pub_path, "w") as f:
            f.write(user_pubkey.strip() + "\n")

        result = subprocess.run(
            [
                "ssh-keygen",
                "-s", ca_key_path,              # CA signing key
                "-I", identity,                 # Certificate identity
                "-n", principals_str,           # Allowed principals
                "-V", validity,                 # Validity period
                "-z", str(serial),              # Serial number
                "-O", "permit-pty",             # Extensions
                "-O", "permit-user-rc",
                "-O", "permit-port-forwarding",
                user_pub_path,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode != 0:
            raise RuntimeError(
                f"Certificate signing failed: {result.stderr.strip()}"
            )

        with open(cert_path, "r") as f:
            cert_str = f.read().strip()

    return cert_str
