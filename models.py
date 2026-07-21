from __future__ import annotations
from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    create_engine,
)
from sqlalchemy.engine import make_url
from sqlalchemy.orm import(
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
    sessionmaker,
)
import datetime as dt
import os
from typing import Optional

def _resolve_db_url():
    env = os.environ.get("DATABASE_URL")
    if not env:
        raise RuntimeError(
            "DATABASE_URL environment variable is not set. "
            "Set it to your Postgres connection string before starting the server."
        )
    return make_url(env)

_DB_URL = _resolve_db_url()
DATABASE_URL = _DB_URL.render_as_string(hide_password=False)

engine = create_engine(_DB_URL)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
sessionlocal = SessionLocal

class Base(DeclarativeBase):
    pass

def _utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)

class User(Base):
    __tablename__ = "users"

    id:Mapped[str] = mapped_column(String, primary_key=True)

    api_key: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_utcnow)

    provider_keys: Mapped[list["ProviderKey"]] = relationship(
        back_populates= "user",
        cascade= "all, delete-orphan"
    )

class ProviderKey(Base):
    __tablename__ = "provider_keys"

    __table_args__ = (UniqueConstraint(
        "user_id", "provider", "key_label", name="uq_user_provider_label"
    ))

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    provider: Mapped[str] = mapped_column(String, index=True, nullable=False)
    key_label: Mapped[str] = mapped_column(String, nullable=False, default="default")
    encrypted_key: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default= _utcnow,onupdate=_utcnow)
    user: Mapped["User"] = relationship(back_populates="provider_keys")

class RequestLog(Base):
    """one row per /v1/chat/completions request, for usage analytics"""

    __tablename__ = "request_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    timestamp:Mapped[dt.datetime] = mapped_column(DateTime, default=_utcnow, index=True)
    effort:Mapped[str] = mapped_column(String, nullable=False)
    models_attempted:Mapped[list] = mapped_column(JSON, default=list)
    succeed_models:Mapped[Optional[str]] = mapped_column(String, nullable=True)
    provider:Mapped[Optional[str]] = mapped_column(String, nullable=True)
    prompt_tokens:Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    completion_tokens:Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_tokens:Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, nullable=False) #sucess or error
    status_code: Mapped[int] = mapped_column(Integer, default=0)
    onekey_key_id: Mapped[Optional[int]] = mapped_column(Integer, index=True, nullable=True)


class OneKey(Base):
    """An Onekey bearer token (ok-...). Stored only as a SHA-256 hash."""

    __tablename__ = "onekey_keys"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    label: Mapped[str] = mapped_column(String, nullable=False, default="primary")
    key_hash: Mapped[str] = mapped_column(
        String, unique=True, index=True, nullable=False
    )
    masked: Mapped[str] = mapped_column(String, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    rate_limit_per_minute: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_utcnow)
    last_used_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime, nullable=True)


class ProviderHealth(Base):
    """Per (user, provider) health state used for routing decisions."""

    __tablename__ = "provider_health"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_health_user_provider"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    provider: Mapped[str] = mapped_column(String, nullable=False)
    last_success_at: Mapped[Optional[dt.datetime]] = mapped_column(
        DateTime, nullable=True
    )
    last_failure_at: Mapped[Optional[dt.datetime]] = mapped_column(
        DateTime, nullable=True
    )
    last_429_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime, nullable=True)


class UserModel(Base):
    """Per-user override of, or addition to, the global model registry."""

    __tablename__ = "user_models"
    __table_args__ = (
        UniqueConstraint("user_id", "model_entry", "tier", name="uq_user_model_tier"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    model_entry: Mapped[str] = mapped_column(String, nullable=False)
    tier: Mapped[str] = mapped_column(String, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)


class UserPreference(Base):
    """Per-user routing preferences (one row per user)."""

    __tablename__ = "user_preferences"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    preferred_providers: Mapped[list] = mapped_column(JSON, default=list)
    excluded_providers: Mapped[list] = mapped_column(JSON, default=list)
    excluded_models: Mapped[list] = mapped_column(JSON, default=list)


def init_db() -> None:
    backend = _DB_URL.get_backend_name()
    print(f"[Onekey] Database backend: {backend}", flush=True)
    Base.metadata.create_all(bind=engine)
    print("[Onekey] DB ready", flush=True)
