# tests/test_router.py — unit tests for router.py
#
# What this file does: verifies routing logic (cascade, failover, key rotation)
# without making any real HTTP calls. All network is replaced with mocks.
#
# What it must never do: import models.py, touch the DB, or need real provider keys.

import os

# Set MASTER_SECRET before importing crypto (which router imports).
# This is a throwaway test value — never use this in production.
os.environ.setdefault("MASTER_SECRET", "test-secret-for-unit-tests-only")

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from router import (
    NoModelsAvailable,
    AllProvidersFailed,
    route_chat_completion,
    _rotate_keys,
    build_payload,          # note: no underscore — that's the actual name in router.py
    _candidate_models,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# crypto.decrypt is called on every key inside route_chat_completion.
# We patch it so we don't need a real encrypted key or a real MASTER_SECRET.
# "patch" is explained below in the first test that uses it.
PATCHED_DECRYPT = "router.decrypt"


def _make_fake_200_response(content: str = "hello") -> MagicMock:
    """Build a mock httpx Response that looks like a successful provider reply."""
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = {
        "id": "chatcmpl-test",
        "choices": [
            {
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
    }
    return resp


def _make_fake_error_response(status: int = 429, text: str = "rate limited") -> MagicMock:
    resp = MagicMock()
    resp.status_code = status
    resp.text = text
    return resp


def _make_mock_client(side_effects) -> AsyncMock:
    """
    Build an async context-manager mock for httpx.AsyncClient.
    `side_effects` is a list of responses that .post() will return in order.
    """
    mock_client = AsyncMock()
    # __aenter__ makes `async with httpx.AsyncClient() as client` work
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=side_effects)
    return mock_client


# ---------------------------------------------------------------------------
# Pure unit tests (no async, no HTTP)
# ---------------------------------------------------------------------------

class TestRotateKeys:
    def test_single_key_returns_same(self):
        keys = [("label-a", "enc-a")]
        assert _rotate_keys(keys, "groq:test") == keys

    def test_multiple_keys_rotates_on_next_call(self):
        keys = [("label-a", "enc-a"), ("label-b", "enc-b"), ("label-c", "enc-c")]
        first  = _rotate_keys(keys, "groq:rotate-test")
        second = _rotate_keys(keys, "groq:rotate-test")
        # After rotation, the first element changes (cursor advanced)
        assert first[0] != second[0]

    def test_rotation_wraps_around(self):
        keys = [("a", "ea"), ("b", "eb")]
        # Call 3 times with 2 keys → should wrap back to start on 3rd call
        calls = [_rotate_keys(keys, "groq:wrap") for _ in range(3)]
        # calls[0] starts at idx 0; calls[2] should also start at idx 0
        assert calls[0] == calls[2]


class TestBuildPayload:
    def test_strips_effort_field(self):
        body = {"model": "onekey-high", "effort": "high", "messages": []}
        result = build_payload(body, upstream_model="gemini-2.5-pro")
        assert "effort" not in result

    def test_strips_model_field_and_sets_upstream(self):
        body = {"model": "onekey-high", "messages": []}
        result = build_payload(body, upstream_model="gemini-2.5-pro")
        assert result["model"] == "gemini-2.5-pro"

    def test_preserves_other_fields(self):
        body = {"model": "onekey-high", "messages": [{"role": "user", "content": "hi"}], "temperature": 0.7}
        result = build_payload(body, upstream_model="gemini-2.5-pro")
        assert result["temperature"] == 0.7
        assert result["messages"] == body["messages"]

    def test_does_not_mutate_original_body(self):
        body = {"model": "onekey-high", "effort": "high", "messages": []}
        build_payload(body, upstream_model="gemini-2.5-pro")
        # Original must be untouched
        assert "effort" in body
        assert body["model"] == "onekey-high"


class TestCandidateModels:
    def test_empty_models_returns_empty(self):
        assert _candidate_models([], available_providers={"groq"}) == []

    def test_filters_providers_with_no_key(self):
        # groq model but user has no groq key
        result = _candidate_models(
            ["groq/llama-3.1-8b"],
            available_providers={"cerebras"},   # no groq
        )
        assert result == []

    def test_deprioritized_providers_go_to_end(self):
        models = ["groq/llama-3.1-8b", "cerebras/llama-3.1-8b"]
        result = _candidate_models(
            models,
            available_providers={"groq", "cerebras"},
            deprioritized_providers={"groq"},
        )
        # cerebras should come first since groq is deprioritized
        assert result[0][1] == "cerebras"
        assert result[1][1] == "groq"

    def test_deprioritized_providers_are_not_dropped(self):
        # Deprioritized ≠ removed — they still appear at the end
        models = ["groq/llama-3.1-8b"]
        result = _candidate_models(
            models,
            available_providers={"groq"},
            deprioritized_providers={"groq"},
        )
        assert len(result) == 1


# ---------------------------------------------------------------------------
# Async tests — route_chat_completion
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_no_models_raises_no_models_available():
    # Empty model list → no candidates → immediate exception
    with pytest.raises(NoModelsAvailable):
        await route_chat_completion(
            models=[],
            body={},
            provider_keys={},
            deprioritized_providers=None,   # ← required arg, even though it's Optional
        )

@pytest.mark.asyncio
async def test_no_key_for_provider_raises():
    # Has a model candidate but provider_keys is empty → no candidates survive _candidate_models
    with pytest.raises(NoModelsAvailable):
        await route_chat_completion(
            models=["groq/llama-3.1-8b"],
            body={"messages": []},
            provider_keys={},               # no groq key
            deprioritized_providers=None,
        )

@pytest.mark.asyncio
async def test_successful_route_returns_result():
    """
    patch("router.decrypt") replaces the real decrypt() *inside router.py's namespace*
    with a function that just returns a plaintext string. This way we never need
    a real encrypted key or MASTER_SECRET to be correct.
    """
    fake_resp = _make_fake_200_response("test response")
    mock_client = _make_mock_client([fake_resp])

    with patch("router.httpx.AsyncClient", return_value=mock_client), \
         patch(PATCHED_DECRYPT, return_value="sk-plaintext-fake-key"):
        result = await route_chat_completion(
            models=["groq/llama-3.1-8b"],
            body={"messages": [{"role": "user", "content": "hi"}]},
            provider_keys={"groq": [("my-label", "enc-fake")]},
            deprioritized_providers=None,
        )

    assert result.provider == "groq"
    assert result.data["id"] == "chatcmpl-test"
    assert result.usage["total_tokens"] == 8


@pytest.mark.asyncio
async def test_failover_on_429():
    """
    First candidate (groq) returns 429.
    Second candidate (cerebras) returns 200.
    Confirms: ANY status >= 400 triggers failover to next candidate.
    """
    resp_429 = _make_fake_error_response(429, "rate limited")
    resp_200 = _make_fake_200_response("fallback response")

    call_count = 0
    async def fake_post(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return resp_429 if call_count == 1 else resp_200

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = fake_post

    with patch("router.httpx.AsyncClient", return_value=mock_client), \
         patch(PATCHED_DECRYPT, return_value="sk-plaintext-fake-key"):
        result = await route_chat_completion(
            models=["groq/llama-3.1-8b", "cerebras/llama-3.1-8b"],
            body={"messages": []},
            provider_keys={
                "groq": [("label-g", "enc-g")],
                "cerebras": [("label-c", "enc-c")],
            },
            deprioritized_providers=None,
        )

    assert call_count == 2, f"Expected 2 HTTP calls (1 fail + 1 success), got {call_count}"
    assert result.provider == "cerebras"
    # The first attempt (groq 429) should be in the attempts list
    assert any(a.status == 429 for a in result.attempts)


@pytest.mark.asyncio
async def test_all_providers_fail_raises():
    """
    All candidates return errors → AllProvidersFailed, not a silent empty result.
    """
    resp_500 = _make_fake_error_response(500, "server error")

    mock_client = _make_mock_client([resp_500, resp_500])

    with patch("router.httpx.AsyncClient", return_value=mock_client), \
         patch(PATCHED_DECRYPT, return_value="sk-plaintext-fake-key"):
        with pytest.raises(AllProvidersFailed) as exc_info:
            await route_chat_completion(
                models=["groq/llama-3.1-8b", "cerebras/llama-3.1-8b"],
                body={"messages": []},
                provider_keys={
                    "groq": [("label-g", "enc-g")],
                    "cerebras": [("label-c", "enc-c")],
                },
                deprioritized_providers=None,
            )

    # The exception should carry the attempt records
    assert len(exc_info.value.attempts) == 2
    assert all(a.status == 500 for a in exc_info.value.attempts)


@pytest.mark.asyncio
async def test_attempt_log_is_complete():
    """RouteResult.attempts should contain one entry per HTTP call made."""
    resp_429 = _make_fake_error_response(429)
    resp_200 = _make_fake_200_response()

    call_count = 0
    async def fake_post(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return resp_429 if call_count == 1 else resp_200

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = fake_post

    with patch("router.httpx.AsyncClient", return_value=mock_client), \
         patch(PATCHED_DECRYPT, return_value="sk-plaintext-fake-key"):
        result = await route_chat_completion(
            models=["groq/llama-3.1-8b", "cerebras/llama-3.1-8b"],
            body={"messages": []},
            provider_keys={
                "groq": [("label-g", "enc-g")],
                "cerebras": [("label-c", "enc-c")],
            },
            deprioritized_providers=None,
        )

    # Should have recorded both attempts: the 429 and the 200
    assert len(result.attempts) == 2
    statuses = [a.status for a in result.attempts]
    assert 429 in statuses
    assert 200 in statuses
