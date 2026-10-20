import base64
from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from typing import Any, Optional

import bcrypt
from cryptography.fernet import Fernet
import jwt

from app.core.config import get_settings


def get_fernet(key: Optional[str] = None) -> Fernet:
    """
    Returns a configured Fernet instance.
    If the provided key is already a valid 32-byte urlsafe-base64 key, uses it directly.
    Otherwise, derives a deterministic 32-byte key using SHA-256 and urlsafe base64.
    """
    if not key:
        key = get_settings().TOKEN_ENCRYPTION_KEY

    key_bytes = key.encode("utf-8") if isinstance(key, str) else key
    try:
        return Fernet(key_bytes)
    except Exception:
        derived = base64.urlsafe_b64encode(hashlib.sha256(key_bytes).digest())
        return Fernet(derived)


def encrypt_token(token: str, key: Optional[str] = None) -> str:
    """
    Encrypts a plaintext OAuth token (e.g. refresh token or access token) for storage at rest.
    """
    if not token:
        return ""
    fernet = get_fernet(key)
    return fernet.encrypt(token.encode("utf-8")).decode("utf-8")


def decrypt_token(encrypted_token: str, key: Optional[str] = None) -> str:
    """
    Decrypts an encrypted OAuth token from storage.
    """
    if not encrypted_token:
        return ""
    fernet = get_fernet(key)
    return fernet.decrypt(encrypted_token.encode("utf-8")).decode("utf-8")


def hash_password(password: str) -> str:
    """
    Hashes a password with bcrypt using a random salt.
    """
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plain password against a bcrypt hash.
    """
    if not plain_password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


def create_access_token(data: dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Creates a signed JWT application access token for user authentication.
    """
    settings = get_settings()
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"iat": now, "exp": expire})
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    return encoded_jwt


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decodes and verifies a signed JWT application access token.
    Raises jwt.PyJWTError on invalid signature, expiration, or malformed token.
    """
    settings = get_settings()
    payload = jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
    )
    return payload


def generate_pkce_pair() -> tuple[str, str]:
    """
    Generates a cryptographically secure PKCE code verifier and code challenge (S256)
    in compliance with RFC 7636.
    """
    code_verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return code_verifier, code_challenge


def generate_oauth_state() -> str:
    """
    Generates a cryptographically random OAuth state token for CSRF defense.
    """
    return secrets.token_urlsafe(32)
