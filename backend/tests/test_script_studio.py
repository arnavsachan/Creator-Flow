from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_access_token
from app.models.script import Script
from app.models.user import User


def create_test_user(db: Session, email: str = "creator@test.com") -> tuple[User, str]:
    user = User(
        email=email,
        hashed_password="mock_hashed_password",
        full_name="Script Creator",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(data={"sub": user.id})
    return user, token


def test_scripts_endpoints_require_authentication(client: TestClient):
    """All Script Studio endpoints must require authentication and return 401."""
    res_hooks = client.post("/api/v1/scripts/generate-hooks", json={"topic": "PostgreSQL indexing"})
    assert res_hooks.status_code == 401

    res_gen = client.post("/api/v1/scripts/generate", json={"topic": "PostgreSQL indexing"})
    assert res_gen.status_code == 401

    res_audit = client.post("/api/v1/scripts/audit-retention", json={"script_text": "Sample text for video"})
    assert res_audit.status_code == 401

    res_save = client.post("/api/v1/scripts", json={"title": "Test", "topic": "Test", "full_script": "Text"})
    assert res_save.status_code == 401

    res_list = client.get("/api/v1/scripts")
    assert res_list.status_code == 401

    res_get = client.get("/api/v1/scripts/nonexistent-id")
    assert res_get.status_code == 401


def test_request_validation(client: TestClient, db_session: Session):
    """Validates request schema constraints (min_length, required fields)."""
    user, token = create_test_user(db_session, "val_user@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    # topic too short
    res = client.post("/api/v1/scripts/generate-hooks", json={"topic": "A"}, headers=headers)
    assert res.status_code == 422

    # script_text too short for audit
    res_audit = client.post("/api/v1/scripts/audit-retention", json={"script_text": "short"}, headers=headers)
    assert res_audit.status_code == 422


def test_missing_gemini_api_key(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch):
    """When GEMINI_API_KEY is not set or default, returns clean 503 error."""
    user, token = create_test_user(db_session, "nokey_user@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Ensure empty key
    settings = get_settings()
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")

    res = client.post("/api/v1/scripts/generate-hooks", json={"topic": "Building RAG with SQLite"}, headers=headers)
    assert res.status_code == 503
    assert "Gemini API key is not configured" in res.json()["detail"]


@patch("app.services.script_studio.get_gemini_client")
def test_generate_hooks_success(mock_get_client, client: TestClient, db_session: Session):
    """Generates 3 hook variations with estimated retention and rationale."""
    user, token = create_test_user(db_session, "hooks_user@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = (
        '{\n'
        '  "hooks": [\n'
        '    {\n'
        '      "archetype": "negative",\n'
        '      "hook_text": "Almost every engineer who failed system design made the same mistake at minute 12.",\n'
        '      "estimated_retention_score": 84.5,\n'
        '      "rationale": "High-urgency mistake framing"\n'
        '    },\n'
        '    {\n'
        '      "archetype": "curiosity",\n'
        '      "hook_text": "Here is why SQLite is quietly replacing dedicated vector databases in 2026.",\n'
        '      "estimated_retention_score": 88.0,\n'
        '      "rationale": "Unintuitive architectural truth"\n'
        '    },\n'
        '    {\n'
        '      "archetype": "story",\n'
        '      "hook_text": "When our production cluster dropped 40% of queries, I discovered a hidden connection pool bug.",\n'
        '      "estimated_retention_score": 79.0,\n'
        '      "rationale": "Relatable incident narrative"\n'
        '    }\n'
        '  ]\n'
        '}'
    )
    mock_client.models.generate_content.return_value = mock_response
    mock_get_client.return_value = mock_client

    payload = {
        "topic": "Scaling SQLite for AI Agents",
        "audiencePersona": "Software Engineers",
        "tone": "Authoritative",
    }
    res = client.post("/api/v1/scripts/generate-hooks", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["topic"] == "Scaling SQLite for AI Agents"
    assert len(data["hooks"]) == 3
    assert data["hooks"][0]["archetype"] == "negative"
    assert data["hooks"][0]["estimatedRetentionScore"] == 84.5
    assert "disclaimer" in data


@patch("app.services.script_studio.get_gemini_client")
def test_generate_full_script_success(mock_get_client, client: TestClient, db_session: Session):
    """Generates structured full script with timecodes and pacing cues."""
    user, token = create_test_user(db_session, "gen_user@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = (
        '{\n'
        '  "title": "Why SQLite is the Future of Local AI",\n'
        '  "hook_text": "Almost every local RAG tutorial is teaching you an obsolete stack.",\n'
        '  "estimated_retention_score": 81.2,\n'
        '  "sections": [\n'
        '    {\n'
        '      "timecode": "[0:00 - 0:05]",\n'
        '      "section_type": "HOOK",\n'
        '      "content": "Almost every local RAG tutorial is teaching you an obsolete stack.",\n'
        '      "visual_cue": "Terminal benchmark screen"\n'
        '    },\n'
        '    {\n'
        '      "timecode": "[0:05 - 0:25]",\n'
        '      "section_type": "RETENTION_LOCK",\n'
        '      "content": "In this video, I will show you why in-process vector extensions beat external servers.",\n'
        '      "visual_cue": "Architecture comparison slide"\n'
        '    }\n'
        '  ],\n'
        '  "full_script": "[0:00 - 0:05] HOOK:\\nAlmost every local RAG tutorial is teaching you an obsolete stack."\n'
        '}'
    )
    mock_client.models.generate_content.return_value = mock_response
    mock_get_client.return_value = mock_client

    payload = {
        "topic": "SQLite for Local RAG",
        "targetDuration": "8m 00s",
        "tone": "Conversational",
        "hookType": "curiosity",
    }
    res = client.post("/api/v1/scripts/generate", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["title"] == "Why SQLite is the Future of Local AI"
    assert data["estimatedRetentionScore"] == 81.2
    assert len(data["sections"]) == 2
    assert "disclaimer" in data


def test_audit_retention_heuristic(client: TestClient, db_session: Session):
    """Audit endpoint calculates words, duration, drop-off risks, and score."""
    user, token = create_test_user(db_session, "audit_user@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    sample_script = (
        "[0:00 - 0:05] HOOK:\n"
        "Why do 90% of engineers fail their system design interview on the very first question? "
        "The reason is simple: they jump straight into Redis before clarifying constraints.\n\n"
        "[0:05 - 0:25] RETENTION LOCK:\n"
        "In this video, we break down the 4-step framework used by staff engineers at FAANG.\n\n"
        "[0:25 - 2:00] CORE POINT 1:\n"
        "Always define read-to-write ratios and latency SLAs before drawing boxes."
    )

    res = client.post("/api/v1/scripts/audit-retention", json={"scriptText": sample_script}, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["wordCount"] > 30
    assert data["hookDetected"] is True
    assert data["estimatedRetentionScore"] >= 70.0
    assert len(data["strengths"]) > 0
    assert "disclaimer" in data


def test_script_crud_and_tenant_isolation(client: TestClient, db_session: Session):
    """Saving, listing, and retrieving scripts with strict cross-user isolation."""
    user_a, token_a = create_test_user(db_session, "user_a@test.com")
    user_b, token_b = create_test_user(db_session, "user_b@test.com")

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User A creates a script
    save_payload = {
        "title": "User A Script: Microservices Architecture",
        "topic": "Microservices",
        "targetDuration": "10m 00s",
        "tone": "Authoritative",
        "hookType": "negative",
        "hookText": "Stop building microservices if you have fewer than 20 developers.",
        "fullScript": "Stop building microservices if you have fewer than 20 developers. Here is why...",
        "estimatedRetentionScore": 77.5,
        "channelId": "UC_CHANNEL_A",
    }
    res_create = client.post("/api/v1/scripts", json=save_payload, headers=headers_a)
    assert res_create.status_code == 201
    created_a = res_create.json()
    script_id = created_a["id"]
    assert created_a["title"] == save_payload["title"]
    assert created_a["userId"] == user_a.id

    # User A lists scripts -> contains created script
    res_list_a = client.get("/api/v1/scripts", headers=headers_a)
    assert res_list_a.status_code == 200
    items_a = res_list_a.json()
    assert len(items_a) == 1
    assert items_a[0]["id"] == script_id

    # User A retrieves own script by ID -> 200
    res_get_a = client.get(f"/api/v1/scripts/{script_id}", headers=headers_a)
    assert res_get_a.status_code == 200
    assert res_get_a.json()["id"] == script_id

    # User B lists scripts -> empty (tenant isolation)
    res_list_b = client.get("/api/v1/scripts", headers=headers_b)
    assert res_list_b.status_code == 200
    assert len(res_list_b.json()) == 0

    # User B attempts to access User A's script by ID -> 404 (isolated)
    res_get_b = client.get(f"/api/v1/scripts/{script_id}", headers=headers_b)
    assert res_get_b.status_code == 404


@patch("app.services.script_studio.get_gemini_client")
def test_malformed_provider_output_handling(mock_get_client, client: TestClient, db_session: Session):
    """When Gemini returns non-JSON text, service returns clean 502 error."""
    user, token = create_test_user(db_session, "malformed_user@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "Sorry, I cannot generate this response."
    mock_client.models.generate_content.return_value = mock_response
    mock_get_client.return_value = mock_client

    res = client.post("/api/v1/scripts/generate-hooks", json={"topic": "Rust vs Go"}, headers=headers)
    assert res.status_code == 502
    assert "malformed" in res.json()["detail"].lower()
