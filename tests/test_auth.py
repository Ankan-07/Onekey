# tests/test_auth.py — auth and management endpoint tests for main.py
import os
os.environ.setdefault("MASTER_SECRET", "test-secret")
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from fastapi.testclient import TestClient
from main import app, require_jwt
from models import init_db

# Ensure tables exist in SQLite memory DB for testing
init_db()

client = TestClient(app)


def test_user_init_requires_jwt():
    r = client.post("/users/init")
    assert r.status_code == 401
    assert r.json()["error"]["type"] == "authentication_error"


def test_list_keys_requires_auth():
    r = client.get("/users/some-user-id/onekey-keys")
    assert r.status_code == 401
    assert r.json()["error"]["type"] == "authentication_error"


def test_provider_key_requires_auth():
    r = client.get("/users/some-user-id/keys")
    assert r.status_code == 401
    assert r.json()["error"]["type"] == "authentication_error"


def test_jwt_user_mismatch_returns_403():
    app.dependency_overrides[require_jwt] = lambda: "user-B"
    try:
        r = client.get("/users/user-A/onekey-keys")
        assert r.status_code == 403
        assert r.json()["error"]["type"] == "permission_error"
    finally:
        app.dependency_overrides.clear()


def test_key_not_found_returns_404():
    app.dependency_overrides[require_jwt] = lambda: "user-A"
    try:
        r = client.put(
            "/onekey-keys/99999",
            json={"label": "new-label"},
        )
        assert r.status_code == 404
        assert r.json()["error"]["type"] == "invalid_request_error"
    finally:
        app.dependency_overrides.clear()


def test_full_user_and_key_management_flow():
    """Test full CRUD flow: init user, mint key, list keys, store provider key, delete key."""
    app.dependency_overrides[require_jwt] = lambda: "user-test-123"
    try:
        # 1. Init user
        r = client.post("/users/init")
        assert r.status_code == 200
        assert r.json()["user_id"] == "user-test-123"
        assert r.json()["created"] is True

        # 2. Mint new onekey key
        r = client.post("/users/user-test-123/onekey-keys", json={"label": "test-key"})
        assert r.status_code == 200
        key_data = r.json()
        assert key_data["api_key"].startswith("ok-")
        assert key_data["label"] == "test-key"
        key_id = key_data["id"]

        # 3. List onekey keys
        r = client.get("/users/user-test-123/onekey-keys")
        assert r.status_code == 200
        assert len(r.json()["keys"]) >= 2  # primary + test-key

        # 4. Store provider key
        r = client.post(
            "/users/user-test-123/keys",
            json={"provider": "groq", "api_key": "gsk_test123", "key_label": "default"},
        )
        assert r.status_code == 200
        pk_id = r.json()["key_id"]
        assert r.json()["status"] == "created"

        # 5. List provider keys
        r = client.get("/users/user-test-123/keys")
        assert r.status_code == 200
        assert "groq" in r.json()["providers"]

        # 6. Delete provider key
        r = client.delete(f"/users/user-test-123/keys/{pk_id}")
        assert r.status_code == 200
        assert r.json()["deleted"]["id"] == pk_id

        # 7. Soft revoke onekey key
        r = client.delete(f"/onekey-keys/{key_id}")
        assert r.status_code == 200
        assert r.json()["revoked"] is True
    finally:
        app.dependency_overrides.clear()
