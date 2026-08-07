# tests/test_router_failover.py — dedicated failover and stream resilience tests for router.py
#
# What this file does:
# 1. Tests failover when HTTP 429 rate limit or 5xx server errors occur.
# 2. Tests streaming retry when stream_options is rejected with 400.
# 3. Tests real key encryption/decryption integration via crypto.py without patching decrypt.
# 4. Verifies AllProvidersFailed exception containing complete attempt history.

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import httpx

from crypto import encrypt
from router import (
    route_chat_completion,
    open_stream,
    AllProvidersFailed,
)


def _make_mock_response(status_code: int = 200, json_data: dict = None, text: str = "ok") -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.text = text
    resp.json.return_value = json_data or {
        "id": "chatcmpl-failover-test",
        "choices": [{"message": {"role": "assistant", "content": "hello response"}}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    }
    return resp


@pytest.mark.asyncio
async def test_route_chat_completion_fails_over_to_second_provider():
    """
    Candidate 1 (groq) returns 429 rate limit error.
    Candidate 2 (cerebras) returns 200 success.
    Verifies that route_chat_completion seamlessly fails over to candidate 2.
    """
    enc_groq_key = encrypt("sk-groq-fake-key")
    enc_cerebras_key = encrypt("sk-cerebras-fake-key")

    resp_429 = _make_mock_response(429, text="Rate limit exceeded")
    resp_200 = _make_mock_response(200, json_data={"id": "chatcmpl-cerebras", "choices": [], "usage": {}})

    call_count = 0

    async def fake_post(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return resp_429
        return resp_200

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = fake_post

    with patch("router.httpx.AsyncClient", return_value=mock_client):
        result = await route_chat_completion(
            models=["groq/llama-3.1-8b", "cerebras/llama-3.1-8b"],
            body={"messages": [{"role": "user", "content": "hi"}]},
            provider_keys={
                "groq": [("groq-primary", enc_groq_key)],
                "cerebras": [("cerebras-primary", enc_cerebras_key)],
            },
            deprioritized_providers=None,
        )

    assert call_count == 2
    assert result.provider == "cerebras"
    assert len(result.attempts) == 2
    assert result.attempts[0].status == 429
    assert result.attempts[0].provider == "groq"
    assert result.attempts[1].status == 200
    assert result.attempts[1].provider == "cerebras"


@pytest.mark.asyncio
async def test_route_chat_completion_502_only_after_all_providers_fail():
    """
    Both candidate providers fail with status 503.
    Verifies that AllProvidersFailed is raised carrying all attempt records.
    """
    enc_groq_key = encrypt("sk-groq-fake-key")
    enc_cerebras_key = encrypt("sk-cerebras-fake-key")

    resp_503 = _make_mock_response(503, text="Service Unavailable")

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=resp_503)

    with patch("router.httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(AllProvidersFailed) as exc_info:
            await route_chat_completion(
                models=["groq/llama-3.1-8b", "cerebras/llama-3.1-8b"],
                body={"messages": [{"role": "user", "content": "hi"}]},
                provider_keys={
                    "groq": [("groq-primary", enc_groq_key)],
                    "cerebras": [("cerebras-primary", enc_cerebras_key)],
                },
                deprioritized_providers=None,
            )

    attempts = exc_info.value.attempts
    assert len(attempts) == 2
    assert attempts[0].provider == "groq"
    assert attempts[0].status == 503
    assert attempts[1].provider == "cerebras"
    assert attempts[1].status == 503


@pytest.mark.asyncio
async def test_open_stream_retries_without_stream_options_before_failover():
    """
    When streaming, the first payload variant includes stream_options.
    If the server returns 400 (e.g. unsupported parameter stream_options),
    open_stream retries the same provider without stream_options before moving to next provider.
    """
    enc_groq_key = encrypt("sk-groq-fake-key")

    resp_400 = MagicMock()
    resp_400.status_code = 400
    resp_400.aread = AsyncMock(return_value=b"stream_options is not supported")
    resp_400.aclose = AsyncMock()

    resp_200 = MagicMock()
    resp_200.status_code = 200

    requests_sent = []

    mock_client = AsyncMock(spec=httpx.AsyncClient)

    def fake_build_request(method, url, headers=None, json=None):
        requests_sent.append(json)
        req = MagicMock(spec=httpx.Request)
        req.url = url
        req.headers = headers or {}
        return req

    mock_client.build_request = fake_build_request

    async def fake_send(req, stream=True):
        if len(requests_sent) == 1:
            return resp_400
        return resp_200

    mock_client.send = fake_send
    mock_client.aclose = AsyncMock()

    with patch("router.httpx.AsyncClient", return_value=mock_client):
        handle = await open_stream(
            models=["groq/llama-3.1-8b"],
            body={"messages": [{"role": "user", "content": "hi"}]},
            provider_keys={"groq": [("groq-primary", enc_groq_key)]},
        )

    assert len(requests_sent) == 2
    # First attempt had stream_options
    assert "stream_options" in requests_sent[0]
    # Second attempt stripped stream_options
    assert "stream_options" not in requests_sent[1]
    assert handle.provider == "groq"
    assert handle.response.status_code == 200


@pytest.mark.asyncio
async def test_open_stream_fails_over_to_second_provider():
    """
    Candidate 1 (groq) returns 429 on both stream variants.
    open_stream fails over to candidate 2 (cerebras) which returns 200.
    """
    enc_groq_key = encrypt("sk-groq-fake-key")
    enc_cerebras_key = encrypt("sk-cerebras-fake-key")

    resp_429 = MagicMock()
    resp_429.status_code = 429
    resp_429.aread = AsyncMock(return_value=b"Rate limit reached")
    resp_429.aclose = AsyncMock()

    resp_200 = MagicMock()
    resp_200.status_code = 200

    send_call_count = 0

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.build_request = MagicMock()

    async def fake_send(req, stream=True):
        nonlocal send_call_count
        send_call_count += 1
        # groq gets 2 variant attempts, both fail with 429; 3rd call is cerebras which returns 200
        if send_call_count <= 2:
            return resp_429
        return resp_200

    mock_client.send = fake_send
    mock_client.aclose = AsyncMock()

    with patch("router.httpx.AsyncClient", return_value=mock_client):
        handle = await open_stream(
            models=["groq/llama-3.1-8b", "cerebras/llama-3.1-8b"],
            body={"messages": [{"role": "user", "content": "hi"}]},
            provider_keys={
                "groq": [("groq-primary", enc_groq_key)],
                "cerebras": [("cerebras-primary", enc_cerebras_key)],
            },
        )

    assert send_call_count == 3  # 2 for groq (variant 1 & 2), 1 for cerebras
    assert handle.provider == "cerebras"
    assert handle.response.status_code == 200
