# tests/test_responses_adapter.py — pure-function unit tests for responses_adapter.py
# Zero network, zero DB, zero env vars.
import json
import pytest
from responses_adapter import (
    resolve_responses_effort,
    responses_to_openai_body,
    openai_to_responses_response,
    convert_openai_stream_to_responses,
    _blocks_to_text,
)


# --- resolve_responses_effort ---

def test_resolve_effort_onekey_prefix():
    assert resolve_responses_effort({"model": "onekey-high"}) == "high"
    assert resolve_responses_effort({"model": "onekey-medium"}) == "medium"
    assert resolve_responses_effort({"model": "onekey-low"}) == "low"


def test_resolve_effort_from_reasoning():
    assert resolve_responses_effort({"model": "gpt-4o", "reasoning": {"effort": "low"}}) == "low"


def test_resolve_effort_fallback():
    assert resolve_responses_effort({"model": "gpt-4o"}) == "medium"


# --- _blocks_to_text ---

def test_blocks_to_text_string():
    assert _blocks_to_text("simple string") == "simple string"


def test_blocks_to_text_list():
    blocks = [
        {"type": "input_text", "text": "hello"},
        "middle text",
        {"type": "output_text", "text": "world"},
        {"type": "summary_text", "text": "summary"},
    ]
    assert _blocks_to_text(blocks) == "hello\nmiddle text\nworld\nsummary"


# --- responses_to_openai_body ---

def test_body_instructions_becomes_system():
    body = responses_to_openai_body({
        "model": "gpt-4o",
        "instructions": "You are a helpful assistant.",
        "input": "hello",
    })
    assert body["messages"][0] == {"role": "system", "content": "You are a helpful assistant."}
    assert body["messages"][1] == {"role": "user", "content": "hello"}


def test_body_string_input():
    body = responses_to_openai_body({
        "model": "gpt-4o",
        "input": "hello",
    })
    assert len(body["messages"]) == 1
    assert body["messages"][0] == {"role": "user", "content": "hello"}


def test_body_list_input_structured():
    raw_input = [
        {"type": "message", "role": "user", "content": "hello"},
        {
            "type": "function_call",
            "call_id": "call_123",
            "name": "get_weather",
            "arguments": '{"city": "Paris"}',
        },
        {
            "type": "function_call_output",
            "call_id": "call_123",
            "output": '{"temp": "20C"}',
        },
        {"type": "reasoning", "summary": [{"type": "summary_text", "text": "Thinking..."}]},
    ]
    body = responses_to_openai_body({"model": "gpt-4o", "input": raw_input})
    msgs = body["messages"]
    assert msgs[0] == {"role": "user", "content": "hello"}
    assert msgs[1]["role"] == "assistant"
    assert msgs[1]["tool_calls"][0]["function"]["name"] == "get_weather"
    assert msgs[2] == {"role": "tool", "tool_call_id": "call_123", "content": '{"temp": "20C"}'}
    assert msgs[3] == {"role": "assistant", "content": "Thinking..."}


def test_body_empty_input_fallback():
    body = responses_to_openai_body({"model": "gpt-4o"})
    assert body["messages"] == [{"role": "user", "content": ""}]


def test_body_text_format_and_tools():
    body = responses_to_openai_body({
        "model": "gpt-4o",
        "text": {"format": {"type": "json_schema", "name": "my_schema", "schema": {"type": "object"}}},
        "tools": [
            {
                "type": "function",
                "name": "calc",
                "description": "Calculate expression",
                "parameters": {"type": "object"},
            }
        ],
        "max_output_tokens": 100,
        "temperature": 0.7,
        "top_p": 0.9,
    })
    assert body["max_tokens"] == 100
    assert body["temperature"] == 0.7
    assert body["top_p"] == 0.9
    assert body["response_format"]["type"] == "json_schema"
    assert body["tools"][0]["function"]["name"] == "calc"


# --- openai_to_responses_response ---

def test_response_translation_message_output():
    openai_resp = {
        "id": "chatcmpl-abc123",
        "choices": [{"message": {"role": "assistant", "content": "Hello world!"}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    }
    request = {"model": "gpt-4o", "instructions": "Be brief"}
    res = openai_to_responses_response(openai_resp, request)

    assert res["object"] == "response"
    assert res["status"] == "completed"
    assert res["instructions"] == "Be brief"
    assert len(res["output"]) == 1
    assert res["output"][0]["type"] == "message"
    assert res["output"][0]["content"][0]["text"] == "Hello world!"
    assert res["usage"]["input_tokens"] == 10
    assert res["usage"]["output_tokens"] == 5
    assert res["usage"]["total_tokens"] == 15


def test_response_translation_tool_calls():
    openai_resp = {
        "id": "chatcmpl-tool1",
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "call_999",
                            "type": "function",
                            "function": {"name": "search", "arguments": '{"query": "news"}'},
                        }
                    ],
                },
                "finish_reason": "tool_calls",
            }
        ],
    }
    res = openai_to_responses_response(openai_resp, request={"model": "gpt-4o"})
    assert len(res["output"]) == 1
    assert res["output"][0]["type"] == "function_call"
    assert res["output"][0]["name"] == "search"
    assert res["output"][0]["call_id"] == "call_999"


# --- convert_openai_stream_to_responses ---

@pytest.mark.asyncio
async def test_convert_openai_stream_to_responses_async():
    async def fake_stream():
        events = [
            'event: routing\ndata: {"provider":"groq"}\n\n',
            'data: {"choices":[{"delta":{"content":"Hi "}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"there!"},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\n',
            'data: [DONE]\n\n',
        ]
        for ev in events:
            yield ev.encode()

    request = {"model": "gpt-4o"}
    output_chunks = []
    async for chunk in convert_openai_stream_to_responses(fake_stream(), request):
        output_chunks.append(chunk.decode())

    full_output = "".join(output_chunks)
    assert "event: response.created" in full_output
    assert "event: response.in_progress" in full_output
    assert "event: response.output_text.delta" in full_output
    assert "event: response.completed" in full_output
    assert "Hi " in full_output
    assert "there!" in full_output
