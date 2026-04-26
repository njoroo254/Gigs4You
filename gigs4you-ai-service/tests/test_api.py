"""
FastAPI endpoint tests for the Gigs4You AI service.

Runs without a live database, Redis, or Anthropic API key.
All I/O is patched so these are fast, deterministic unit tests.
"""
import time
from unittest.mock import AsyncMock, MagicMock, patch

import jwt
import pytest
from httpx import ASGITransport, AsyncClient

# ── Patch heavy dependencies before importing app ──────────────────────────────

# Prevent real Redis connection at import time
with patch("redis.Redis") as _mock_redis_cls:
    _mock_redis_instance = MagicMock()
    _mock_redis_instance.ping.side_effect = Exception("no redis in tests")
    _mock_redis_cls.return_value = _mock_redis_instance

import os
os.environ.setdefault("JWT_SECRET", "test-secret")

# Import after env is set
from src.main import app  # noqa: E402

# ── Helpers ────────────────────────────────────────────────────────────────────

SECRET = "test-secret"


def make_token(
    user_id: str = "user-123",
    role: str = "worker",
    exp_offset: int = 3600,
) -> str:
    """Return a valid HS256 JWT for the test secret."""
    return jwt.encode(
        {"sub": user_id, "role": role, "exp": int(time.time()) + exp_offset},
        SECRET,
        algorithm="HS256",
    )


def make_expired_token() -> str:
    return make_token(exp_offset=-1)


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


# ── GET / and /health ──────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_root_returns_service_info(client):
    resp = await client.get("/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["service"] == "Gigs4You AI Service"
    assert data["status"] == "running"
    assert "powered_by" in data


@pytest.mark.anyio
async def test_health_returns_healthy(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    # Redis unavailable in tests — that is fine
    assert data["redis"] in ("connected", "unavailable")


# ── /chat/assist — authentication ─────────────────────────────────────────────


@pytest.mark.anyio
async def test_chat_assist_rejects_missing_token(client):
    resp = await client.post(
        "/chat/assist",
        json={"conversation_id": "c1", "message": "Hello"},
    )
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_chat_assist_rejects_malformed_token(client):
    resp = await client.post(
        "/chat/assist",
        headers={"Authorization": "Bearer not-a-jwt"},
        json={"conversation_id": "c1", "message": "Hello"},
    )
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_chat_assist_rejects_expired_token(client):
    resp = await client.post(
        "/chat/assist",
        headers={"Authorization": f"Bearer {make_expired_token()}"},
        json={"conversation_id": "c1", "message": "Hello"},
    )
    assert resp.status_code == 401


@pytest.mark.anyio
@patch("src.main.get_redis", return_value=None)
@patch(
    "src.main.chat_with_tools",
    new_callable=AsyncMock,
    return_value={"response": "Hi there!", "tools_used": []},
)
@patch(
    "src.main.get_user_context",
    new_callable=AsyncMock,
    return_value={"id": "user-123", "role": "worker"},
)
async def test_chat_assist_succeeds_with_valid_token(
    _mock_ctx, _mock_chat, _mock_redis, client
):
    resp = await client.post(
        "/chat/assist",
        headers={"Authorization": f"Bearer {make_token()}"},
        json={"conversation_id": "conv-1", "message": "What jobs are available?"},
    )
    assert resp.status_code == 200
    data = resp.json()
    # Response is wrapped: { reply: {...}, conversation_id: ..., timestamp: ... }
    assert "reply" in data or "response" in data


# ── /chat/assist — Pydantic validation ────────────────────────────────────────


@pytest.mark.anyio
async def test_chat_assist_rejects_message_exceeding_max_length(client):
    """message field has max_length=4000; exceeding it should return 422."""
    long_message = "x" * 4001
    resp = await client.post(
        "/chat/assist",
        headers={"Authorization": f"Bearer {make_token()}"},
        json={"conversation_id": "c1", "message": long_message},
    )
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_chat_assist_rejects_missing_conversation_id(client):
    resp = await client.post(
        "/chat/assist",
        headers={"Authorization": f"Bearer {make_token()}"},
        json={"message": "Hello"},
    )
    assert resp.status_code == 422


# ── /matching/job-worker ───────────────────────────────────────────────────────


@pytest.mark.anyio
@patch(
    "src.main.match_workers",
    new_callable=AsyncMock,
    return_value=[{"worker_id": "w1", "score": 0.95}],
)
async def test_matching_returns_ranked_workers(_mock_match, client):
    resp = await client.post(
        "/matching/job-worker",
        headers={"Authorization": f"Bearer {make_token(role='manager')}"},
        json={
            "job_id": "job-42",
            "worker_pool": [{"id": "w1", "skills": ["driving"]}],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    # Response shape: { matches: [...], method: ..., timestamp: ... }
    matches = data if isinstance(data, list) else data.get("matches", [])
    assert len(matches) > 0
    assert matches[0]["worker_id"] == "w1"


@pytest.mark.anyio
async def test_matching_rejects_missing_job_id(client):
    resp = await client.post(
        "/matching/job-worker",
        headers={"Authorization": f"Bearer {make_token(role='manager')}"},
        json={"worker_pool": [{"id": "w1"}]},
    )
    assert resp.status_code == 422


# ── /recommendations/personalize ──────────────────────────────────────────────


@pytest.mark.anyio
async def test_recommendations_rejects_invalid_user_type(client):
    """user_type must match the enum pattern; 'hacker' should return 422."""
    resp = await client.post(
        "/recommendations/personalize",
        headers={"Authorization": f"Bearer {make_token()}"},
        json={"user_id": "u1", "user_type": "hacker"},
    )
    assert resp.status_code == 422


@pytest.mark.anyio
@patch(
    "src.main.generate_insights",
    new_callable=AsyncMock,
    return_value=["Apply to these jobs"],
)
@patch(
    "src.main.get_user_context",
    new_callable=AsyncMock,
    return_value={"id": "u1", "role": "worker"},
)
async def test_recommendations_succeeds_for_valid_user_type(
    _mock_ctx, _mock_gen, client
):
    resp = await client.post(
        "/recommendations/personalize",
        headers={"Authorization": f"Bearer {make_token()}"},
        json={"user_id": "u1", "user_type": "worker"},
    )
    assert resp.status_code == 200
