from datetime import timedelta
import base64
import hashlib
import pytest
import jwt

from app.core.security import (
    create_access_token,
    decode_access_token,
    decrypt_token,
    encrypt_token,
    generate_oauth_state,
    generate_pkce_pair,
    hash_password,
    verify_password,
)


def test_token_encryption_decryption_roundtrip():
    plain_token = "ya29.a0AfH6SMDh_fake_refresh_token_xyz_123456789"
    encrypted = encrypt_token(plain_token)

    assert encrypted != plain_token
    assert len(encrypted) > len(plain_token)

    decrypted = decrypt_token(encrypted)
    assert decrypted == plain_token


def test_encryption_uses_unique_ciphertexts():
    token = "constant_refresh_token_string"
    c1 = encrypt_token(token)
    c2 = encrypt_token(token)

    # Fernet uses fresh IVs for each encryption call
    assert c1 != c2
    assert decrypt_token(c1) == token
    assert decrypt_token(c2) == token


def test_password_hashing_and_verification():
    password = "SuperSecretPassword123!"
    hashed = hash_password(password)

    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False
    assert verify_password("", hashed) is False


def test_jwt_access_token_creation_and_validation():
    payload = {"sub": "user_12345", "email": "creator@example.com"}
    token = create_access_token(data=payload, expires_delta=timedelta(minutes=15))

    decoded = decode_access_token(token)
    assert decoded["sub"] == "user_12345"
    assert decoded["email"] == "creator@example.com"
    assert "exp" in decoded
    assert "iat" in decoded


def test_jwt_expired_token():
    payload = {"sub": "user_12345"}
    token = create_access_token(data=payload, expires_delta=timedelta(seconds=-10))

    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(token)


def test_pkce_pair_generation_rfc7636():
    verifier, challenge = generate_pkce_pair()

    assert len(verifier) >= 43
    assert len(challenge) >= 43

    # Verify that challenge matches base64url(sha256(verifier))
    expected_digest = hashlib.sha256(verifier.encode("ascii")).digest()
    expected_challenge = base64.urlsafe_b64encode(expected_digest).decode("ascii").rstrip("=")
    assert challenge == expected_challenge


def test_oauth_state_generation():
    state1 = generate_oauth_state()
    state2 = generate_oauth_state()

    assert len(state1) >= 32
    assert state1 != state2
