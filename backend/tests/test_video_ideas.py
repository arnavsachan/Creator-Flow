import json
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_access_token
from app.models.user import User
from app.models.video_idea import VideoIdea


def create_test_user(db: Session, email: str = "creator@test.com") -> tuple[User, str]:
    user = User(
        email=email,
        hashed_password="mock_hashed_password",
        full_name="Ideas Creator",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(data={"sub": user.id})
    return user, token


# --- 1. Authentication Requirements ---

def test_ideas_endpoints_require_authentication(client: TestClient):
    """All video ideas and SEO endpoints must reject unauthenticated requests with 401."""
    res_gen = client.post("/api/v1/ideas/generate", json={"topic": "PostgreSQL indexing"})
    assert res_gen.status_code == 401

    res_seo = client.post("/api/v1/ideas/generate-seo", json={"title": "Mastering PostgreSQL"})
    assert res_seo.status_code == 401

    res_save = client.post("/api/v1/ideas", json={"title": "Test", "topic": "Test"})
    assert res_save.status_code == 401

    res_list = client.get("/api/v1/ideas")
    assert res_list.status_code == 401

    res_get = client.get("/api/v1/ideas/nonexistent-id")
    assert res_get.status_code == 401

    res_update = client.patch("/api/v1/ideas/nonexistent-id", json={"title": "Updated"})
    assert res_update.status_code == 401

    res_delete = client.delete("/api/v1/ideas/nonexistent-id")
    assert res_delete.status_code == 401


# --- 2. Input Validation ---

def test_ideas_request_validation(client: TestClient, db_session: Session):
    """Verifies schema validation constraints (min lengths, field requirements)."""
    _, token = create_test_user(db_session, "validation_user@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Topic too short (<2 chars)
    res = client.post("/api/v1/ideas/generate", json={"topic": "x"}, headers=headers)
    assert res.status_code == 422

    # SEO Title too short (<2 chars)
    res_seo = client.post("/api/v1/ideas/generate-seo", json={"title": "a"}, headers=headers)
    assert res_seo.status_code == 422

    # Count out of bounds (>10)
    res_count = client.post("/api/v1/ideas/generate", json={"topic": "System Design", "count": 20}, headers=headers)
    assert res_count.status_code == 422


# --- 3. Missing Gemini Configuration ---

def test_missing_gemini_api_key(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch):
    """When GEMINI_API_KEY is unset or default, returns clean 503 error."""
    _, token = create_test_user(db_session, "nokey_user@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    settings = get_settings()
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")

    res = client.post("/api/v1/ideas/generate", json={"topic": "AI Agents Architecture"}, headers=headers)
    assert res.status_code == 503
    assert "Gemini API key is not configured" in res.json()["detail"]


# --- 4. Video Ideas Generation (AI) ---

@patch("app.services.video_ideas.get_gemini_client")
def test_generate_ideas_success(mock_get_client, client: TestClient, db_session: Session):
    """Generates distinct video concepts with angles, hooks, and keywords."""
    _, token = create_test_user(db_session, "ideas_success@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = json.dumps({
        "ideas": [
            {
                "title": "Why SQLite is the Real Architecture Future for AI Agents",
                "summary": "Explores how embedded databases outperform distributed vector stores for local AI workflows.",
                "target_audience": "Software Engineers & AI Developers",
                "hook": "Almost every AI agent built today has a silent architectural flaw.",
                "primary_keyword": "SQLite for AI",
                "related_keywords": ["local LLMs", "vector search", "agent memory"],
                "content_format": "long_form",
                "call_to_action": "Check out the benchmark repo linked below.",
                "angle": "Architectural paradigm shift",
                "estimated_score": 93.5,
                "score_explanation": "Strong counter-intuitive premise with high technical curiosity.",
            },
            {
                "title": "Build a Local LLM RAG Pipeline in 15 Minutes",
                "summary": "Step-by-step hands-on tutorial using Python and open weights.",
                "target_audience": "Fullstack Developers",
                "hook": "You don't need a cloud subscription to run enterprise RAG.",
                "primary_keyword": "Local RAG Python",
                "related_keywords": ["Ollama", "LangChain", "ChromaDB"],
                "content_format": "long_form",
                "call_to_action": "Download the starter template in the description.",
                "angle": "Hands-on tutorial",
                "estimated_score": 88.0,
                "score_explanation": "High utility and clear time-bound outcome.",
            },
        ]
    })
    mock_client.models.generate_content.return_value = mock_response
    mock_get_client.return_value = mock_client

    payload = {
        "topic": "Local AI Architectures",
        "niche": "Software Engineering",
        "targetAudience": "Backend Engineers",
        "contentFormat": "long_form",
        "count": 2,
    }
    res = client.post("/api/v1/ideas/generate", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["topic"] == "Local AI Architectures"
    assert len(data["ideas"]) == 2
    assert data["ideas"][0]["title"] == "Why SQLite is the Real Architecture Future for AI Agents"
    assert data["ideas"][0]["estimatedScore"] == 93.5
    assert "disclaimer" in data
    assert "not guarantee" in data["disclaimer"].lower()


@patch("app.services.video_ideas.get_gemini_client")
def test_generate_ideas_technology_audience(mock_get_client, client: TestClient, db_session: Session):
    """Verifies technology topic produces technology-relevant audience and includes adaptation instructions."""
    _, token = create_test_user(db_session, "tech_audience_user@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = json.dumps({
        "ideas": [
            {
                "title": "Kubernetes Autoscaling Under Extreme Traffic",
                "summary": "Deep dive into HPA, KEDA, and cluster autoscaling patterns.",
                "target_audience": "DevOps Engineers & Site Reliability Engineers",
                "hook": "Your cluster is autoscaling too late, and here is the mathematical proof.",
                "primary_keyword": "Kubernetes Autoscaling",
                "related_keywords": ["KEDA", "HPA", "Kubernetes SRE"],
                "content_format": "long_form",
                "call_to_action": "Download the production helm chart values below.",
                "angle": "Architectural breakdown",
                "estimated_score": 92.0,
                "score_explanation": "Strong niche appeal for infrastructure teams.",
            }
        ]
    })
    mock_client.models.generate_content.return_value = mock_response
    mock_get_client.return_value = mock_client

    payload = {"topic": "Kubernetes Autoscaling in Production"}
    res = client.post("/api/v1/ideas/generate", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data["ideas"]) == 1
    assert data["ideas"][0]["targetAudience"] == "DevOps Engineers & Site Reliability Engineers"

    call_args = mock_client.models.generate_content.call_args
    prompt_sent = call_args.kwargs.get("contents", "")
    sys_instruction = call_args.kwargs.get("config", {}).get("system_instruction", "")
    assert "TARGET AUDIENCE ADAPTATION" in sys_instruction
    assert "Auto-infer" in prompt_sent


@patch("app.services.video_ideas.get_gemini_client")
def test_generate_ideas_cooking_audience_adaptation(mock_get_client, client: TestClient, db_session: Session):
    """Verifies cooking topic produces cooking-relevant audience and forbids software engineer defaults."""
    _, token = create_test_user(db_session, "cooking_user@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = json.dumps({
        "ideas": [
            {
                "title": "No-Knead Sourdough Bread for Complete Beginners",
                "summary": "Master artisanal sourdough baking at home using standard kitchen equipment.",
                "target_audience": "Beginner Home Bakers & Artisan Bread Enthusiasts",
                "hook": "You do not need a Dutch oven or a stand mixer to bake bakery-quality sourdough at home.",
                "primary_keyword": "Sourdough Bread for Beginners",
                "related_keywords": ["sourdough starter", "no knead bread", "home baking"],
                "content_format": "long_form",
                "call_to_action": "Grab the free sourdough schedule PDF in the description.",
                "angle": "Step-by-step masterclass",
                "estimated_score": 94.0,
                "score_explanation": "Extremely approachable barrier to entry with high visual satisfaction.",
            }
        ]
    })
    mock_client.models.generate_content.return_value = mock_response
    mock_get_client.return_value = mock_client

    payload = {
        "topic": "Sourdough Bread for Beginners",
        "niche": "Culinary & Baking",
    }
    res = client.post("/api/v1/ideas/generate", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data["ideas"]) == 1
    audience = data["ideas"][0]["targetAudience"]
    assert audience == "Beginner Home Bakers & Artisan Bread Enthusiasts"
    # Verify explicitly that software engineering persona is not present
    assert "software engineer" not in audience.lower()
    assert "developer" not in audience.lower()
    assert "tech lead" not in audience.lower()

    # Verify Gemini prompt explicitly instructed against tech defaults
    call_args = mock_client.models.generate_content.call_args
    prompt_sent = call_args.kwargs.get("contents", "")
    sys_instruction = call_args.kwargs.get("config", {}).get("system_instruction", "")
    assert "Channel Niche: Culinary & Baking" in prompt_sent
    assert "NEVER use generic or unrelated defaults such as 'Software engineers and tech leads' for non-technical topics" in sys_instruction


@patch("app.services.video_ideas.get_gemini_client")
def test_generate_ideas_preserves_explicit_target_audience(mock_get_client, client: TestClient, db_session: Session):
    """Verifies that user-supplied target audience is strictly preserved as constraint and not replaced."""
    _, token = create_test_user(db_session, "explicit_user@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    mock_client = MagicMock()
    mock_response = MagicMock()
    explicit_audience = "College Students Living in Dorms on a Budget"
    mock_response.text = json.dumps({
        "ideas": [
            {
                "title": "5 Microwave-Only Dinners Under $3",
                "summary": "Affordable, healthy dorm dinners with zero stove required.",
                "target_audience": explicit_audience,
                "hook": "Stop spending $20 on delivery when this 4-minute dorm meal costs $2.40.",
                "primary_keyword": "Dorm Meals on a Budget",
                "related_keywords": ["college recipes", "cheap meals", "microwave cooking"],
                "content_format": "long_form",
                "call_to_action": "Check the grocery breakdown list in the comments.",
                "angle": "Budget survival guide",
                "estimated_score": 91.5,
                "score_explanation": "Immediate high financial utility for college demographic.",
            }
        ]
    })
    mock_client.models.generate_content.return_value = mock_response
    mock_get_client.return_value = mock_client

    payload = {
        "topic": "Cheap Dorm Meals",
        "niche": "Student Cooking",
        "targetAudience": explicit_audience,
    }
    res = client.post("/api/v1/ideas/generate", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["ideas"][0]["targetAudience"] == explicit_audience

    # Verify Gemini prompt contained strict preservation instructions
    call_args = mock_client.models.generate_content.call_args
    prompt_sent = call_args.kwargs.get("contents", "")
    assert f'Explicit Target Audience Constraint: "{explicit_audience}"' in prompt_sent
    assert "Adhere to this user-specified audience constraint across all generated concepts" in prompt_sent


@patch("app.services.video_ideas.get_gemini_client")
def test_generate_ideas_distinct_audiences_per_idea(mock_get_client, client: TestClient, db_session: Session):
    """Verifies different generated ideas can target different distinct audience segments."""
    _, token = create_test_user(db_session, "distinct_audience_user@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = json.dumps({
        "ideas": [
            {
                "title": "One-Light Portrait Setup on a $150 Budget",
                "summary": "Step-by-step studio lighting for complete novices using a speedlight and umbrella.",
                "target_audience": "Beginner Hobbyist Photographers & Solo Creators",
                "hook": "You do not need $3,000 in Profoto lights to get crisp magazine-quality portraits.",
                "primary_keyword": "Budget Portrait Lighting",
                "related_keywords": ["speedlight setup", "one light portraits", "DIY photography"],
                "content_format": "long_form",
                "call_to_action": "Gear links are in the description.",
                "angle": "Budget challenge",
                "estimated_score": 92.0,
                "score_explanation": "Low barrier to entry with high visual transformation.",
            },
            {
                "title": "Commercial Beauty Lighting: 4-Point High-Key Breakdown",
                "summary": "Advanced commercial lighting diagram using beauty dishes and strip boxes.",
                "target_audience": "Professional Commercial & Studio Headshot Photographers",
                "hook": "Here is why high-end fashion brands refuse to use softboxes for commercial beauty.",
                "primary_keyword": "Commercial Beauty Lighting",
                "related_keywords": ["beauty dish", "commercial photography", "studio lighting"],
                "content_format": "long_form",
                "call_to_action": "Download the lighting diagram vector pack below.",
                "angle": "Behind the scenes industry secrets",
                "estimated_score": 94.0,
                "score_explanation": "High technical authority targeting working pros.",
            },
        ]
    })
    mock_client.models.generate_content.return_value = mock_response
    mock_get_client.return_value = mock_client

    payload = {"topic": "Portrait Photography Lighting", "count": 2}
    res = client.post("/api/v1/ideas/generate", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data["ideas"]) == 2
    aud1 = data["ideas"][0]["targetAudience"]
    aud2 = data["ideas"][1]["targetAudience"]
    assert aud1 == "Beginner Hobbyist Photographers & Solo Creators"
    assert aud2 == "Professional Commercial & Studio Headshot Photographers"
    assert aud1 != aud2


@patch("app.services.video_ideas.get_gemini_client")
def test_generate_ideas_empty_or_malformed(mock_get_client, client: TestClient, db_session: Session):
    """Handles empty list or malformed JSON from provider with HTTP 502."""
    _, token = create_test_user(db_session, "empty_user@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = '{"ideas": []}'
    mock_client.models.generate_content.return_value = mock_response
    mock_get_client.return_value = mock_client

    res = client.post("/api/v1/ideas/generate", json={"topic": "Cloud computing"}, headers=headers)
    assert res.status_code == 502
    assert "empty ideas list" in res.json()["detail"].lower()

    # Malformed non-JSON output
    mock_response.text = "This is not valid json at all!"
    res_malformed = client.post("/api/v1/ideas/generate", json={"topic": "Cloud computing"}, headers=headers)
    assert res_malformed.status_code == 502


# --- 5. SEO Kit Generation (AI) ---

@patch("app.services.video_ideas.get_gemini_client")
def test_generate_seo_success(mock_get_client, client: TestClient, db_session: Session):
    """Generates comprehensive SEO metadata kit."""
    _, token = create_test_user(db_session, "seo_user@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = json.dumps({
        "title_variations": [
            {
                "title": "Why SQLite is Replacing Dedicated Vector DBs in 2026",
                "style": "contrarian",
                "rationale": "Challenges popular trends directly.",
            },
            {
                "title": "How to Build Fast AI Agent Memory with SQLite",
                "style": "how-to",
                "rationale": "Clear problem-solution orientation for search queries.",
            },
        ],
        "description": "Discover why SQLite is becoming the secret weapon for AI engineers.\n\nTimestamps:\n0:00 - Introduction\n1:00 - Benchmarks",
        "tags": ["sqlite", "ai agents", "python", "vector database"],
        "hashtags": ["#sqlite", "#ai", "#softwaredevelopment"],
        "primary_keyword": "SQLite AI Agents",
        "secondary_keywords": ["local embeddings", "agent memory", "rag architecture"],
        "thumbnail_text_suggestions": ["SQLITE FOR AI?", "VECTOR KILLER?", "REAL BENCHMARKS"],
        "estimated_seo_score": 91.0,
        "score_explanation": "High keyword alignment in title and first 100 characters of description.",
        "optimization_rationale": "Addresses both high-intent searchers and browse recommendations.",
    })
    mock_client.models.generate_content.return_value = mock_response
    mock_get_client.return_value = mock_client

    payload = {
        "title": "Why SQLite is Replacing Dedicated Vector DBs",
        "topic": "SQLite AI Agents",
        "summary": "Benchmark comparing SQLite to standalone vector DBs.",
        "contentFormat": "long_form",
    }
    res = client.post("/api/v1/ideas/generate-seo", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["title"] == payload["title"]
    assert len(data["titleVariations"]) == 2
    assert "sqlite" in data["tags"]
    assert data["estimatedSeoScore"] == 91.0
    assert len(data["thumbnailTextSuggestions"]) == 3
    assert "disclaimer" in data


# --- 6. CRUD & Tenant Isolation for Saved Ideas ---

def test_saved_ideas_crud_and_tenant_isolation(client: TestClient, db_session: Session):
    """Tests creating, listing, getting, updating, and deleting ideas with strict tenant isolation."""
    user_a, token_a = create_test_user(db_session, "user_a@test.com")
    user_b, token_b = create_test_user(db_session, "user_b@test.com")

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 1. User A creates an idea
    idea_payload = {
        "title": "10 System Design Mistakes Every Senior Engineer Makes",
        "summary": "Deep dive into real-world interview pitfalls.",
        "topic": "System Design Interviews",
        "niche": "Tech Careers",
        "targetAudience": "Staff Engineers",
        "contentFormat": "long_form",
        "primaryKeyword": "System Design Interview",
        "relatedKeywords": ["scalability", "microservices", "caching"],
        "estimatedScore": 92.0,
        "angle": "Counter-intuitive career breakdown",
        "isFavorite": True,
        "notes": "Plan to film this on Tuesday.",
    }
    create_res = client.post("/api/v1/ideas", json=idea_payload, headers=headers_a)
    assert create_res.status_code == 201
    created_data = create_res.json()
    idea_id = created_data["id"]

    assert created_data["title"] == idea_payload["title"]
    assert created_data["isFavorite"] is True
    assert created_data["relatedKeywords"] == ["scalability", "microservices", "caching"]

    # 2. User A can list their saved ideas
    list_res_a = client.get("/api/v1/ideas", headers=headers_a)
    assert list_res_a.status_code == 200
    assert len(list_res_a.json()) == 1
    assert list_res_a.json()[0]["id"] == idea_id

    # 3. User B lists saved ideas - should be empty (tenant isolation)
    list_res_b = client.get("/api/v1/ideas", headers=headers_b)
    assert list_res_b.status_code == 200
    assert len(list_res_b.json()) == 0

    # 4. User B attempts to access User A's idea by ID - returns 404
    get_res_b = client.get(f"/api/v1/ideas/{idea_id}", headers=headers_b)
    assert get_res_b.status_code == 404

    # 5. User A retrieves their own idea
    get_res_a = client.get(f"/api/v1/ideas/{idea_id}", headers=headers_a)
    assert get_res_a.status_code == 200
    assert get_res_a.json()["id"] == idea_id

    # 6. User B attempts to update User A's idea - returns 404
    update_res_b = client.patch(
        f"/api/v1/ideas/{idea_id}",
        json={"title": "Hacked Title"},
        headers=headers_b,
    )
    assert update_res_b.status_code == 404

    # 7. User A updates their idea
    update_res_a = client.patch(
        f"/api/v1/ideas/{idea_id}",
        json={
            "title": "Why 90% of Engineers Fail System Design",
            "isFavorite": False,
            "status": "in_progress",
        },
        headers=headers_a,
    )
    assert update_res_a.status_code == 200
    updated_data = update_res_a.json()
    assert updated_data["title"] == "Why 90% of Engineers Fail System Design"
    assert updated_data["isFavorite"] is False
    assert updated_data["status"] == "in_progress"

    # 8. User B attempts to delete User A's idea - returns 404
    del_res_b = client.delete(f"/api/v1/ideas/{idea_id}", headers=headers_b)
    assert del_res_b.status_code == 404

    # 9. User A deletes their idea
    del_res_a = client.delete(f"/api/v1/ideas/{idea_id}", headers=headers_a)
    assert del_res_a.status_code == 204

    # 10. Idea is now gone
    get_res_after = client.get(f"/api/v1/ideas/{idea_id}", headers=headers_a)
    assert get_res_after.status_code == 404
