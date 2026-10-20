import pytest
from fastapi.testclient import TestClient


def test_user_registration_success(client: TestClient):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "creator@test.com",
            "password": "ValidPassword123!",
            "full_name": "Test Creator",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "creator@test.com"
    assert data["user"]["full_name"] == "Test Creator"
    assert "id" in data["user"]


def test_user_registration_duplicate_email(client: TestClient):
    payload = {
        "email": "duplicate@test.com",
        "password": "ValidPassword123!",
        "full_name": "First User",
    }
    client.post("/api/v1/auth/register", json=payload)

    # Second registration with same email
    res = client.post(
        "/api/v1/auth/register",
        json={
            "email": "duplicate@test.com",
            "password": "AnotherPassword456!",
            "full_name": "Second User",
        },
    )
    assert res.status_code == 409
    assert "already exists" in res.json()["detail"].lower()


def test_user_login_success(client: TestClient):
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "login_user@test.com",
            "password": "SecretPassword123!",
            "full_name": "Login Tester",
        },
    )

    login_res = client.post(
        "/api/v1/auth/login",
        json={
            "email": "login_user@test.com",
            "password": "SecretPassword123!",
        },
    )
    assert login_res.status_code == 200
    data = login_res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "login_user@test.com"


def test_user_login_invalid_password(client: TestClient):
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "wrong_pass@test.com",
            "password": "SecretPassword123!",
        },
    )

    login_res = client.post(
        "/api/v1/auth/login",
        json={
            "email": "wrong_pass@test.com",
            "password": "WrongPassword!",
        },
    )
    assert login_res.status_code == 401
    assert "invalid email or password" in login_res.json()["detail"].lower()


def test_get_me_protected_endpoint(client: TestClient):
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "email": "me_test@test.com",
            "password": "SecretPassword123!",
            "full_name": "Me Tester",
        },
    )
    token = reg_res.json()["access_token"]

    # 1. Unauthenticated request without header
    unauth_res = client.get("/api/v1/auth/me")
    assert unauth_res.status_code == 401

    # 2. Authenticated request with Bearer header
    auth_res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert auth_res.status_code == 200
    assert auth_res.json()["email"] == "me_test@test.com"
    assert auth_res.json()["full_name"] == "Me Tester"


def test_demo_session_endpoint(client: TestClient):
    res = client.post("/api/v1/auth/demo-session")
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "demo@creatorflow.io"
