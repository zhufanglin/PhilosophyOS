"""Model profile secret handling.

This module intentionally keeps the local beta dependency-light: API keys are
stored as versioned encrypted envelopes in SQLite, while runtime settings still
receive Pydantic SecretStr values for provider calls.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import platform
from pathlib import Path


ENCRYPTED_SECRET_PREFIX = "enc:v1:"
SECRET_KEY_ENV = "PHILOSOPHYOS_LOCAL_SECRET"
_SALT_SIZE = 16
_NONCE_SIZE = 16
_TAG_SIZE = 32


class SecretEnvelopeError(RuntimeError):
    """Raised when a stored secret envelope cannot be decoded safely."""


def encrypt_api_key(api_key: str | None) -> str | None:
    """Return a versioned encrypted envelope for an API key."""

    if api_key is None or not api_key.strip():
        return None
    if is_encrypted_secret(api_key):
        return api_key

    salt = os.urandom(_SALT_SIZE)
    nonce = os.urandom(_NONCE_SIZE)
    plaintext = api_key.encode("utf-8")
    key = _derive_secret_key(salt)
    ciphertext = _xor_bytes(plaintext, _keystream(key, nonce, len(plaintext)))
    tag = hmac.new(key, nonce + ciphertext, hashlib.sha256).digest()
    payload = base64.urlsafe_b64encode(salt + nonce + tag + ciphertext).decode("ascii")
    return f"{ENCRYPTED_SECRET_PREFIX}{payload}"


def decrypt_api_key(stored_value: str | None) -> str | None:
    """Return a plaintext API key from an encrypted envelope or legacy value."""

    if stored_value is None or not stored_value.strip():
        return None
    if not is_encrypted_secret(stored_value):
        return stored_value

    try:
        raw = base64.urlsafe_b64decode(stored_value.removeprefix(ENCRYPTED_SECRET_PREFIX))
    except ValueError as exc:
        raise SecretEnvelopeError("Stored API key envelope is not valid base64.") from exc

    minimum_size = _SALT_SIZE + _NONCE_SIZE + _TAG_SIZE
    if len(raw) < minimum_size:
        raise SecretEnvelopeError("Stored API key envelope is truncated.")

    salt = raw[:_SALT_SIZE]
    nonce = raw[_SALT_SIZE : _SALT_SIZE + _NONCE_SIZE]
    tag = raw[_SALT_SIZE + _NONCE_SIZE : minimum_size]
    ciphertext = raw[minimum_size:]
    key = _derive_secret_key(salt)
    expected_tag = hmac.new(key, nonce + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected_tag):
        raise SecretEnvelopeError("Stored API key envelope failed integrity verification.")

    plaintext = _xor_bytes(ciphertext, _keystream(key, nonce, len(ciphertext)))
    return plaintext.decode("utf-8")


def is_encrypted_secret(value: str | None) -> bool:
    """Return whether a stored value is a versioned encrypted envelope."""

    return bool(value and value.startswith(ENCRYPTED_SECRET_PREFIX))


def mask_api_key(api_key: str | None) -> str | None:
    """Return a display-safe key mask."""

    if not api_key:
        return None
    if len(api_key) <= 8:
        return "••••"
    return f"{api_key[:4]}…{api_key[-4:]}"


def _derive_secret_key(salt: bytes) -> bytes:
    secret_material = os.getenv(SECRET_KEY_ENV) or _default_local_secret_material()
    return hashlib.pbkdf2_hmac(
        "sha256",
        secret_material.encode("utf-8"),
        salt,
        120_000,
        dklen=32,
    )


def _default_local_secret_material() -> str:
    return "|".join(
        [
            "philosophyos-local-beta",
            platform.node(),
            os.getenv("USERNAME") or os.getenv("USER") or "local-user",
            str(Path.home()),
        ]
    )


def _keystream(key: bytes, nonce: bytes, size: int) -> bytes:
    blocks: list[bytes] = []
    counter = 0
    while sum(len(block) for block in blocks) < size:
        counter_bytes = counter.to_bytes(8, "big")
        blocks.append(hmac.new(key, nonce + counter_bytes, hashlib.sha256).digest())
        counter += 1
    return b"".join(blocks)[:size]


def _xor_bytes(left: bytes, right: bytes) -> bytes:
    return bytes(left_byte ^ right_byte for left_byte, right_byte in zip(left, right, strict=True))

