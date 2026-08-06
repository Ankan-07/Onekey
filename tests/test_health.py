# tests/test_health.py — health check and auth error envelope tests for main.py
import os
os.environ.setdefault("MASTER_SECRET", "test-secret")
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health_ok():
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["database"] == "ok"
    assert data["version"] == "1.0.0"


def test_inference_no_auth_returns_401():
    r = client.post("/v1/chat/completions", json={})
    assert r.status_code == 401
    body = r.json()
    # Must be OpenAI error envelope, not a raw FastAPI 422 or generic error
    assert "error" in body
    assert "message" in body["error"]
    assert body["error"]["type"] == "authentication_error"
    assert body["error"]["message"] == "Missing or malformed Bearer token"
