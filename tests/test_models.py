# tests/test_models.py — unit tests for models.py
#
# What this file does: verifies ORM table structure and basic CRUD on an
# in-memory SQLite database. No real Postgres is needed.
# What it must never do: connect to any real DB or touch the filesystem.
#
# KEY CONCEPT — "in-memory SQLite":
# SQLAlchemy supports "sqlite:///:memory:" which creates a temporary DB that
# lives only in RAM for the duration of the process. Perfect for tests: fast,
# isolated, and auto-cleaned when the process exits.

import os
import datetime as dt
import pytest

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

# models.py reads DATABASE_URL at import time (module level), so conftest.py
# must have set DATABASE_URL=sqlite:///:memory: before we get here.
import models
from models import Base, User, ProviderKey, OneKey, ProviderHealth, UserModel, UserPreference, RequestLog


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def engine():
    """Create a fresh in-memory SQLite engine and build all tables."""
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=eng)
    yield eng
    eng.dispose()


@pytest.fixture
def session(engine):
    """Give each test a clean session that rolls back after the test."""
    Session = sessionmaker(bind=engine)
    sess = Session()
    yield sess
    sess.rollback()
    sess.close()


# ---------------------------------------------------------------------------
# Schema / table existence tests
# ---------------------------------------------------------------------------

class TestTableExists:
    EXPECTED_TABLES = [
        "users",
        "provider_keys",
        "onekey_keys",
        "provider_health",
        "user_models",
        "user_preferences",
        "request_logs",
    ]

    def test_all_tables_created(self, engine):
        insp = inspect(engine)
        created = set(insp.get_table_names())
        for table in self.EXPECTED_TABLES:
            assert table in created, f"Table '{table}' is missing from the DB"


# ---------------------------------------------------------------------------
# User CRUD
# ---------------------------------------------------------------------------

class TestUserModel:
    def test_create_and_read_user(self, session):
        user = User(id="user-001", api_key="ak-test-001")
        session.add(user)
        session.flush()

        fetched = session.get(User, "user-001")
        assert fetched is not None
        assert fetched.api_key == "ak-test-001"

    def test_user_created_at_defaults_to_now(self, session):
        user = User(id="user-002", api_key="ak-test-002")
        session.add(user)
        session.flush()
        assert user.created_at is not None

    def test_user_api_key_is_unique(self, session):
        from sqlalchemy.exc import IntegrityError
        session.add(User(id="user-dup-1", api_key="ak-dup"))
        session.flush()
        session.add(User(id="user-dup-2", api_key="ak-dup"))
        with pytest.raises(IntegrityError):
            session.flush()


# ---------------------------------------------------------------------------
# ProviderKey CRUD + cascade
# ---------------------------------------------------------------------------

class TestProviderKey:
    def _make_user(self, session, uid="pk-user-1", api_key="ak-pk-1"):
        u = User(id=uid, api_key=api_key)
        session.add(u)
        session.flush()
        return u

    def test_create_provider_key(self, session):
        user = self._make_user(session)
        pk = ProviderKey(
            user_id=user.id,
            provider="groq",
            key_label="primary",
            encrypted_key="enc-abc",
        )
        session.add(pk)
        session.flush()
        assert pk.id is not None

    def test_unique_constraint_user_provider_label(self, session):
        from sqlalchemy.exc import IntegrityError
        user = self._make_user(session, uid="pk-user-dup", api_key="ak-pk-dup")
        for _ in range(2):
            session.add(ProviderKey(
                user_id=user.id,
                provider="mistral",
                key_label="default",
                encrypted_key="enc-x",
            ))
        with pytest.raises(IntegrityError):
            session.flush()


# ---------------------------------------------------------------------------
# OneKey
# ---------------------------------------------------------------------------

class TestOneKeyModel:
    def test_create_onekey(self, session):
        user = User(id="ok-user-1", api_key="ak-ok-1")
        session.add(user)
        session.flush()

        ok = OneKey(
            user_id=user.id,
            label="primary",
            key_hash="a" * 64,
            masked="ok-abc...xyz",
        )
        session.add(ok)
        session.flush()
        assert ok.id is not None
        assert ok.revoked is False
        assert ok.is_primary is False


# ---------------------------------------------------------------------------
# ProviderHealth
# ---------------------------------------------------------------------------

class TestProviderHealth:
    def test_create_provider_health(self, session):
        user = User(id="ph-user-1", api_key="ak-ph-1")
        session.add(user)
        session.flush()

        ph = ProviderHealth(user_id=user.id, provider="gemini")
        session.add(ph)
        session.flush()
        assert ph.id is not None

    def test_unique_constraint_user_provider(self, session):
        from sqlalchemy.exc import IntegrityError
        user = User(id="ph-user-dup", api_key="ak-ph-dup")
        session.add(user)
        session.flush()
        for _ in range(2):
            session.add(ProviderHealth(user_id=user.id, provider="groq"))
        with pytest.raises(IntegrityError):
            session.flush()


# ---------------------------------------------------------------------------
# UserPreference
# ---------------------------------------------------------------------------

class TestUserPreference:
    def test_create_preference_with_defaults(self, session):
        user = User(id="pref-user-1", api_key="ak-pref-1")
        session.add(user)
        session.flush()

        pref = UserPreference(user_id=user.id)
        session.add(pref)
        session.flush()
        assert pref.preferred_providers == []
        assert pref.excluded_providers == []
        assert pref.excluded_models == []


# ---------------------------------------------------------------------------
# RequestLog
# ---------------------------------------------------------------------------

class TestRequestLog:
    def test_create_request_log(self, session):
        user = User(id="log-user-1", api_key="ak-log-1")
        session.add(user)
        session.flush()

        log = RequestLog(
            user_id=user.id,
            effort="medium",
            models_attempted=["gemini-2.0-flash"],
            status="success",
            status_code=200,
        )
        session.add(log)
        session.flush()
        assert log.id is not None


# ---------------------------------------------------------------------------
# init_db helper
# ---------------------------------------------------------------------------

class TestInitDb:
    def test_init_db_does_not_raise(self):
        """init_db() should run without error on a fresh in-memory DB."""
        eng = create_engine("sqlite:///:memory:")
        # Temporarily swap the module-level engine so init_db uses ours
        original = models.engine
        models.engine = eng
        try:
            models.init_db()
        finally:
            models.engine = original

    def test_utcnow_returns_utc(self):
        ts = models._utcnow()
        assert ts.tzinfo is not None
