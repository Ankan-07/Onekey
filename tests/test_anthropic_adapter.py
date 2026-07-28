# tests/test_anthropic_adapter.py — pure-function tests for anthropic_adapter.py
# Zero network, zero DB, zero env vars.
import pytest
from anthropic_adapter import (
    resolve_effort, extract_system,
    anthropic_to_openai_body, openai_to_anthropic_message, anthropic_error,
)

# --- resolve_effort ---

def test_effort_onekey_prefix():
    assert resolve_effort({"model": "onekey-high"}) == "high"
    assert resolve_effort({"model": "onekey-medium"}) == "medium"
    assert resolve_effort({"model": "onekey-low"}) == "low"

def test_effort_from_output_config():
    assert resolve_effort({"model": "claude-x", "output_config": {"effort": "low"}}) == "low"

def test_effort_inferred_haiku():
    assert resolve_effort({"model": "claude-haiku-4-5"}) == "low"

def test_effort_inferred_opus():
    assert resolve_effort({"model": "claude-opus-3"}) == "high"

def test_effort_inferred_sonnet():
    assert resolve_effort({"model": "claude-sonnet-4-6"}) == "medium"

def test_effort_default_medium():
    assert resolve_effort({"model": "claude-unknown"}) == "medium"

# --- extract_system ---

def test_extract_system_string():
    assert extract_system({"system": "be terse"}) == "be terse"

def test_extract_system_list_of_blocks():
    body = {"system": [{"type": "text", "text": "hello "}, {"type": "text", "text": "world"}]}
    assert extract_system(body) == "hello world"

def test_extract_system_missing_returns_none():
    assert extract_system({}) is None

# --- anthropic_to_openai_body ---

def test_body_system_becomes_first_message():
    body = anthropic_to_openai_body({
        "model": "claude-sonnet-4-6",
        "system": "be terse",
        "messages": [{"role": "user", "content": "hi"}],
    })
    assert body["messages"][0] == {"role": "system", "content": "be terse"}
    assert body["messages"][1]["role"] == "user"

def test_body_no_system():
    body = anthropic_to_openai_body({
        "model": "claude-sonnet-4-6",
        "messages": [{"role": "user", "content": "hi"}],
    })
    assert body["messages"][0]["role"] == "user"

def test_body_passthrough_max_tokens():
    body = anthropic_to_openai_body({
        "model": "claude-sonnet-4-6",
        "messages": [],
        "max_tokens": 512,
    })
    assert body.get("max_tokens") == 512

# --- openai_to_anthropic_message ---

def test_response_id_remap():
    openai_resp = {
        "id": "chatcmpl-abc123",
        "choices": [{"message": {"role": "assistant", "content": "hi"}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
    }
    result = openai_to_anthropic_message(openai_resp, model="claude-sonnet-4-6")
    assert result["id"].startswith("msg_")

def test_response_usage_rename():
    openai_resp = {
        "id": "chatcmpl-xyz",
        "choices": [{"message": {"role": "assistant", "content": "hi"}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    }
    result = openai_to_anthropic_message(openai_resp, model="claude-sonnet-4-6")
    assert result["usage"]["input_tokens"] == 10
    assert result["usage"]["output_tokens"] == 5

# --- anthropic_error ---

def test_error_shape():
    err = anthropic_error(404, "not found")
    assert err["error"]["type"] == "api_error"
    assert "not found" in err["error"]["message"]