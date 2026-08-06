# tests/test_analytics.py — Analytics & discovery endpoints unit tests
import os
os.environ.setdefault("MASTER_SECRET", "test-secret")
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_public_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["database"] == "ok"
    assert "version" in data


def test_public_models():
    response = client.get("/models")
    assert response.status_code == 200
    data = response.json()
    assert "tiers" in data
    assert "high" in data["tiers"]
    assert "medium" in data["tiers"]
    assert "low" in data["tiers"]


def test_public_providers():
    response = client.get("/providers")
    assert response.status_code == 200
    data = response.json()
    assert "providers" in data
    assert len(data["providers"]) > 0
    # Check structure of a provider entry
    p0 = data["providers"][0]
    assert "provider" in p0
    assert "base_url" in p0


def test_analytics_endpoints_require_jwt():
    endpoints = [
        ("GET", "/users/some-id/models"),
        ("PUT", "/users/some-id/models/some-model-id"),
        ("POST", "/users/some-id/models"),
        ("DELETE", "/users/some-id/models/some-model-id"),
        ("GET", "/users/some-id/preferences"),
        ("PUT", "/users/some-id/preferences"),
        ("GET", "/users/some-id/providers/health"),
        ("GET", "/users/some-id/usage"),
        ("GET", "/users/some-id/usage/recent"),
    ]
    for method, path in endpoints:
        if method == "GET":
            r = client.get(path)
        elif method == "PUT":
            r = client.put(path, json={})
        elif method == "POST":
            r = client.post(path, json={})
        elif method == "DELETE":
            r = client.delete(path)
        assert r.status_code == 401, f"Expected 401 for {method} {path}, got {r.status_code}"


def test_v1_models_requires_key():
    response = client.get("/v1/models")
    assert response.status_code == 401
