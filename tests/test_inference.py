# tests/test_inference.py — unit and integration tests for Module 7c inference endpoints.
# Responsible for verifying authentication, provider key enforcement, rate limiting, and request payload routing across /v1/ endpoints.
# Must NEVER issue actual network requests to live LLM providers (uses mock router calls).

import os
from unittest.mock import AsyncMock, patch
import pytest

os.environ.setdefault("MASTER_SECRET", "test-master-secret-key-1234567890")
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from fastapi.testclient import TestClient
from main import app
from models import Base, OneKey, ProviderKey, User, engine
from router import RouteResult, Attempt
from crypto import encrypt, hash_token


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


client = TestClient(app)


def _create_user_and_key():
    from models import SessionLocal
    db = SessionLocal()
    user = User(id="user_test_1", api_key="hash_legacy_1")
    db.add(user)

    raw_token = "ok-test-token-12345"
    key_hash = hash_token(raw_token)
    ok_key = OneKey(
        user_id="user_test_1",
        label="primary",
        key_hash=key_hash,
        masked="ok-tes...2345",
        is_primary=True,
    )
    db.add(ok_key)
    db.commit()
    db.close()
    return raw_token, "user_test_1"


def _add_provider_key(user_id: str, provider: str = "groq"):
    from models import SessionLocal
    db = SessionLocal()
    enc = encrypt("groq-secret-key-123")
    pk = ProviderKey(user_id=user_id, provider=provider, key_label="default", encrypted_key=enc)
    db.add(pk)
    db.commit()
    db.close()


def test_inference_no_auth_returns_401():
    r1 = client.post("/v1/chat/completions", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r1.status_code == 401
    assert r1.json()["error"]["type"] == "authentication_error"

    r2 = client.post("/v1/responses", json={"input": "hi"})
    assert r2.status_code == 401
    assert r2.json()["error"]["type"] == "authentication_error"

    r3 = client.post("/v1/messages", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r3.status_code == 401


def test_inference_no_provider_keys_returns_400():
    token, _ = _create_user_and_key()
    headers = {"Authorization": f"Bearer {token}"}

    r = client.post(
        "/v1/chat/completions",
        json={"messages": [{"role": "user", "content": "hi"}]},
        headers=headers,
    )
    assert r.status_code == 400
    assert "No provider keys configured" in r.json()["error"]["message"]


def test_chat_completions_non_streaming_success():
    token, user_id = _create_user_and_key()
    _add_provider_key(user_id, "groq")

    fake_result = RouteResult(
        data={
            "id": "chatcmpl-123",
            "object": "chat.completion",
            "choices": [{"message": {"role": "assistant", "content": "Hello!"}}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
        },
        model_entry="groq/llama-3.1-8b-instant",
        provider="groq",
        upstream_model="llama-3.1-8b-instant",
        attempts=[Attempt("groq/llama-3.1-8b-instant", "groq", 200, None, "default")],
    )

    with patch("main.route_chat_completion", new_callable=AsyncMock) as mock_route:
        mock_route.return_value = fake_result
        r = client.post(
            "/v1/chat/completions",
            json={"messages": [{"role": "user", "content": "hi"}]},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert r.json()["choices"][0]["message"]["content"] == "Hello!"


def test_responses_endpoint_success():
    token, user_id = _create_user_and_key()
    _add_provider_key(user_id, "groq")

    fake_result = RouteResult(
        data={
            "id": "chatcmpl-456",
            "object": "chat.completion",
            "choices": [{"message": {"role": "assistant", "content": "Responses output"}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 4, "total_tokens": 14},
        },
        model_entry="groq/llama-3.1-8b-instant",
        provider="groq",
        upstream_model="llama-3.1-8b-instant",
        attempts=[Attempt("groq/llama-3.1-8b-instant", "groq", 200, None, "default")],
    )

    with patch("main.route_chat_completion", new_callable=AsyncMock) as mock_route:
        mock_route.return_value = fake_result
        r = client.post(
            "/v1/responses",
            json={"model": "gpt-4o", "input": "Hello Codex"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "output" in body


def test_messages_endpoint_success():
    token, user_id = _create_user_and_key()
    _add_provider_key(user_id, "groq")

    fake_result = RouteResult(
        data={
            "id": "chatcmpl-789",
            "object": "chat.completion",
            "choices": [{"message": {"role": "assistant", "content": "Anthropic response"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 8, "completion_tokens": 6, "total_tokens": 14},
        },
        model_entry="groq/llama-3.1-8b-instant",
        provider="groq",
        upstream_model="llama-3.1-8b-instant",
        attempts=[Attempt("groq/llama-3.1-8b-instant", "groq", 200, None, "default")],
    )

    with patch("main.route_chat_completion", new_callable=AsyncMock) as mock_route:
        mock_route.return_value = fake_result
        r = client.post(
            "/v1/messages",
            json={"model": "claude-sonnet-4-6", "messages": [{"role": "user", "content": "Hi Claude"}]},
            headers={"x-api-key": token},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["type"] == "message"
        assert body["id"].startswith("msg_")


def test_count_tokens_endpoint():
    token, _ = _create_user_and_key()
    r = client.post(
        "/v1/messages/count_tokens",
        json={"messages": [{"role": "user", "content": "Hello world token count test"}]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert "input_tokens" in r.json()
    assert r.json()["input_tokens"] >= 1
