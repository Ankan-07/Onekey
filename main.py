# main.py — FastAPI web application shell, error formatting, auth dependencies, and route dispatch.
# Responsible for request routing, authentication verification, and OpenAI error envelope formatting.
# Must NEVER bypass authentication on protected endpoints or emit non-OpenAI error schemas to clients.

import env_loader  # MUST be first import to ensure environment variables are loaded before model/crypto initialization

import base64
from contextlib import asynccontextmanager
import datetime
import os
import secrets
import time
from typing import Any, AsyncIterator, Callable, Dict, Generator, List, Literal, Optional, Tuple

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import jwt
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import anthropic_adapter
from crypto import decrypt, encrypt, hash_token, mask_token
from models import OneKey, ProviderHealth, ProviderKey, RequestLog, SessionLocal, User, UserModel, UserPreference, init_db
from registry import MODEL_TIERS, SUPPORTED_PROVIDERS, build_effective_table, effective_cascade, models_by_tier, parse_model
import responses_adapter
from router import (
    COOLDOWN_SECONDS,
    AllProvidersFailed,
    NoModelsAvailable,
    iter_stream,
    open_stream,
    route_chat_completion,
)



@asynccontextmanager
async def _lifespan(app: FastAPI):
    """Lifespan context manager to initialize the database schema on application startup."""
    init_db()
    yield


app = FastAPI(title="Onekey", version="1.0.0", lifespan=_lifespan)

# CORS configuration setup
_cors_origins_env = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:3000,https://www.apikeychain.dev,https://apikeychain.dev",
)
_cors_origins = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Helper Utilities ---

def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _as_aware(d: Optional[datetime.datetime]) -> Optional[datetime.datetime]:
    if d is None:
        return None
    if d.tzinfo is None:
        return d.replace(tzinfo=datetime.timezone.utc)
    return d


def get_db() -> Generator[Session, None, None]:
    """Database session dependency for FastAPI routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- Error Envelope Formatting ---

def _err_type_for_status(status_code: int) -> str:
    """Map HTTP status code to standard OpenAI error type string."""
    if status_code == 401:
        return "authentication_error"
    elif status_code == 403:
        return "permission_error"
    elif status_code == 429:
        return "rate_limit_error"
    elif status_code >= 500:
        return "api_error"
    else:
        return "invalid_request_error"


def _openai_error(
    status_code: int,
    message: str,
    err_type: Optional[str] = None,
    code: Optional[str] = None,
    extra: Optional[dict] = None,
) -> JSONResponse:
    """Wrap any exception or error in a strict OpenAI-compatible JSON error envelope."""
    error_payload = {
        "message": message,
        "type": err_type or _err_type_for_status(status_code),
        "param": None,
        "code": code,
    }
    if extra:
        error_payload.update(extra)
    return JSONResponse(status_code=status_code, content={"error": error_payload})


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Catch HTTP exceptions and format as OpenAI error JSON."""
    return _openai_error(exc.status_code, str(exc.detail))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Catch FastAPI request validation failures (422) and format as OpenAI error JSON."""
    return _openai_error(
        422,
        "Invalid request body or parameters.",
        err_type="invalid_request_error",
        extra={"validation": jsonable_encoder(exc.errors())},
    )


# --- Authentication Dependencies ---

def _new_token() -> str:
    """Generate a high-entropy secret bearer token with the `ok-` prefix."""
    return "ok-" + secrets.token_urlsafe(32)


def require_key(
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None, alias="x-api-key"),
    db: Session = Depends(get_db),
) -> OneKey:
    """FastAPI dependency verifying an `ok-` Bearer or `x-api-key` header against stored OneKey hashes."""
    token: Optional[str] = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    elif x_api_key:
        token = x_api_key.strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Bearer token",
        )

    token_hash = hash_token(token)
    key = db.query(OneKey).filter(OneKey.key_hash == token_hash, OneKey.revoked == False).first()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API key",
        )

    key.last_used_at = _utcnow()
    db.commit()
    return key


def _supabase_jwt_secret() -> str:
    secret = os.environ.get("SUPABASE_JWT_SECRET")
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_JWT_SECRET environment variable is not configured.",
        )
    return secret


def _supabase_url() -> Optional[str]:
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    return url.rstrip("/") if url else None


_jwk_client_instance: Optional[jwt.PyJWKClient] = None


def _jwk_client() -> jwt.PyJWKClient:
    global _jwk_client_instance
    url = _supabase_url()
    if not url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_URL environment variable is not configured.",
        )
    if _jwk_client_instance is None:
        jwks_url = f"{url}/auth/v1/.well-known/jwks.json"
        _jwk_client_instance = jwt.PyJWKClient(jwks_url)
    return _jwk_client_instance


def require_jwt(authorization: Optional[str] = Header(None)) -> str:
    """FastAPI dependency decoding and validating a Supabase user JWT, returning the subject (`sub`)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Bearer token",
        )
    token = authorization[7:].strip()

    try:
        unverified_header = jwt.get_unverified_header(token)
        alg = unverified_header.get("alg", "HS256")

        if alg == "HS256":
            secret = _supabase_jwt_secret()
            payload = jwt.decode(
                token, secret, algorithms=["HS256"], audience="authenticated"
            )
        else:
            client = _jwk_client()
            signing_key = client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256"],
                audience="authenticated",
            )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Supabase token has expired",
        )
    except jwt.PyJWKClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not resolve Supabase signing key: {exc}",
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Supabase token: {exc}",
        )

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is missing the 'sub' claim",
        )
    return sub


def require_jwt_user(
    user_id: str = Path(...), sub: str = Depends(require_jwt)
) -> str:
    """FastAPI dependency enforcing that the URL parameter `user_id` matches the authenticated JWT `sub`."""
    if sub != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="JWT subject does not match the user_id in the path.",
        )
    return sub


# --- Pydantic Schemas for Management APIs ---

class StoreKeyRequest(BaseModel):
    provider: str
    api_key: str
    key_label: str = "default"


class StoreKeyResponse(BaseModel):
    user_id: str
    provider: str
    key_label: str
    key_id: int
    status: str


class ProviderKeyInfo(BaseModel):
    id: int
    provider: str
    key_label: str
    created_at: Optional[str]


class ListKeysResponse(BaseModel):
    user_id: str
    providers: list[str]
    keys: list[ProviderKeyInfo]


class CreateOnekeyKeyRequest(BaseModel):
    label: str = "default"
    rate_limit_per_minute: Optional[int] = Field(None, ge=1)


class UpdateOnekeyKeyRequest(BaseModel):
    label: Optional[str] = None
    rate_limit_per_minute: Optional[int] = Field(None, ge=1)
    clear_rate_limit: bool = False
    revoked: Optional[bool] = None


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    messages: List[ChatMessage] = []
    effort: Literal["low", "medium", "high"] = "medium"
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    top_p: Optional[float] = None
    stream: Optional[bool] = False

    model_config = {"extra": "allow"}


# --- Inference Helpers ---

def _resolve_effort(body: ChatCompletionRequest) -> str:
    """Extract effort level from request body.

    If the requested model starts with 'onekey-' (case-insensitive) and specifies a valid tier
    (e.g., 'onekey-low'), that tier is used; otherwise the explicit effort field is used.
    """
    model = (body.model or "").lower()
    if model.startswith("onekey-"):
        tier = model.split("-", 1)[1]
        if tier in ("low", "medium", "high"):
            return tier
    return body.effort


def _no_models_error(exc: Exception) -> JSONResponse:
    """Format HTTP 409 error envelope when no enabled model matches user's configured keys/preferences."""
    return _openai_error(
        409,
        str(exc),
        err_type="invalid_request_error",
        code="no_models_available",
    )


def _all_failed_error(exc: AllProvidersFailed) -> JSONResponse:
    """Format HTTP 502 error envelope when all candidate upstream models in the cascade failed."""
    return _openai_error(
        502,
        "All candidate models were exhausted; see 'failed_attempts' for the per-model reason.",
        err_type="api_error",
        code="all_providers_failed",
        extra={"failed_attempts": [a.as_dict() for a in exc.attempts]},
    )


def _load_provider_keys(db: Session, user_id: str) -> Dict[str, List[Tuple[str, str]]]:
    """Load all configured provider keys for a user grouped by provider name."""
    keys = (
        db.query(ProviderKey)
        .filter(ProviderKey.user_id == user_id)
        .order_by(ProviderKey.id)
        .all()
    )
    result: Dict[str, List[Tuple[str, str]]] = {}
    for pk in keys:
        result.setdefault(pk.provider, []).append((pk.key_label, pk.encrypted_key))
    return result


def _key_requests_last_minute(db: Session, key_id: int) -> int:
    """Count request log entries for a given OneKey in the last 60 seconds (for rate limiting)."""
    cutoff = _utcnow() - datetime.timedelta(seconds=60)
    return (
        db.query(func.count(RequestLog.id))
        .filter(
            RequestLog.onekey_key_id == key_id,
            RequestLog.timestamp >= cutoff,
        )
        .scalar()
        or 0
    )


def _cooling_down_providers(db: Session, user_id: str) -> set[str]:
    """Identify providers currently in rate-limit cooldown (429 within the last COOLDOWN_SECONDS)."""
    cutoff = _utcnow() - datetime.timedelta(seconds=COOLDOWN_SECONDS)
    health_rows = (
        db.query(ProviderHealth)
        .filter(ProviderHealth.user_id == user_id, ProviderHealth.last_429_at >= cutoff)
        .all()
    )
    return {h.provider for h in health_rows}


def _update_provider_health(db: Session, user_id: str, attempts: List[Any]) -> None:
    """Record status outcome (success / failure / 429) for each provider attempt."""
    now = _utcnow()
    for attempt in attempts:
        try:
            health = (
                db.query(ProviderHealth)
                .filter(
                    ProviderHealth.user_id == user_id,
                    ProviderHealth.provider == attempt.provider,
                )
                .first()
            )
            if not health:
                health = ProviderHealth(user_id=user_id, provider=attempt.provider)
                db.add(health)

            if attempt.status is not None and attempt.status < 400:
                health.last_success_at = now
            else:
                health.last_failure_at = now
                if attempt.status == 429:
                    health.last_429_at = now

            db.commit()
        except Exception:
            db.rollback()


def _log_request(
    db: Session,
    user_id: str,
    effort: str,
    attempts: List[Any],
    result: Any,
    started: float,
    status_code: int,
    onekey_key_id: Optional[int] = None,
) -> None:
    """Insert a completed RequestLog entry for usage analytics (best-effort)."""
    latency_ms = int((time.perf_counter() - started) * 1000)
    attempts_dicts = [a.as_dict() for a in attempts]

    succeeded_model = getattr(result, "model_entry", None)
    provider = getattr(result, "provider", None)
    usage = getattr(result, "usage", {}) or {}

    status_str = "success" if status_code < 400 else "error"

    log_entry = RequestLog(
        user_id=user_id,
        effort=effort,
        models_attempted=attempts_dicts,
        succeed_models=succeeded_model,
        provider=provider,
        prompt_tokens=usage.get("prompt_tokens"),
        completion_tokens=usage.get("completion_tokens"),
        total_tokens=usage.get("total_tokens"),
        latency_ms=latency_ms,
        status=status_str,
        status_code=status_code,
        onekey_key_id=onekey_key_id,
    )
    try:
        db.add(log_entry)
        db.commit()
    except Exception:
        db.rollback()


# --- Management Helpers ---

def _load_user_or_404(db: Session, user_id: str) -> User:
    """Fetch user by ID or raise HTTP 404 Not Found."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _onekey_key_public(k: OneKey) -> dict:
    """Format OneKey DB row into public response dictionary."""
    return {
        "id": k.id,
        "label": k.label,
        "masked": k.masked,
        "is_primary": k.is_primary,
        "rate_limit_per_minute": k.rate_limit_per_minute,
        "revoked": k.revoked,
        "created_at": _as_aware(k.created_at).isoformat() if k.created_at else None,
        "last_used_at": _as_aware(k.last_used_at).isoformat() if k.last_used_at else None,
    }


# --- Management Endpoints ---

@app.post("/users/init")
def init_user(sub: str = Depends(require_jwt), db: Session = Depends(get_db)):
    """Initialize or fetch user profile keyed by JWT `sub` claim. Mint default primary API key if new."""
    user = db.query(User).filter(User.id == sub).first()
    is_new = False
    if not user:
        raw_token = _new_token()
        token_hash = hash_token(raw_token)
        user = User(id=sub, api_key=token_hash)
        db.add(user)

        primary_key = OneKey(
            user_id=sub,
            label="primary",
            key_hash=token_hash,
            masked=mask_token(raw_token),
            is_primary=True,
        )
        db.add(primary_key)
        db.commit()
        is_new = True

    return {"user_id": sub, "created": is_new}


@app.post("/users/{user_id}/onekey-keys")
def create_onekey_key(
    body: CreateOnekeyKeyRequest = CreateOnekeyKeyRequest(),
    user_id: str = Depends(require_jwt_user),
    db: Session = Depends(get_db),
):
    """Mint a new ok- API key for the authenticated user."""
    _load_user_or_404(db, user_id)
    raw_token = _new_token()
    token_hash = hash_token(raw_token)

    key = OneKey(
        user_id=user_id,
        label=body.label,
        key_hash=token_hash,
        masked=mask_token(raw_token),
        is_primary=False,
        rate_limit_per_minute=body.rate_limit_per_minute,
    )
    db.add(key)
    db.commit()
    db.refresh(key)

    res = {
        "user_id": user_id,
        "api_key": raw_token,
        "warning": "Save this now — it is shown only once.",
    }
    res.update(_onekey_key_public(key))
    return res


@app.get("/users/{user_id}/onekey-keys")
def list_onekey_keys(
    user_id: str = Depends(require_jwt_user),
    db: Session = Depends(get_db),
):
    """List all ok- API keys associated with the user."""
    _load_user_or_404(db, user_id)
    keys = db.query(OneKey).filter(OneKey.user_id == user_id).order_by(OneKey.id).all()
    return {"user_id": user_id, "keys": [_onekey_key_public(k) for k in keys]}


@app.post("/users/{user_id}/regenerate-key")
def regenerate_primary_key(
    user_id: str = Depends(require_jwt_user),
    db: Session = Depends(get_db),
):
    """Regenerate the user's primary API key token, revoking the old primary token."""
    user = _load_user_or_404(db, user_id)
    primary_key = (
        db.query(OneKey)
        .filter(OneKey.user_id == user_id, OneKey.is_primary == True)
        .first()
    )

    raw_token = _new_token()
    token_hash = hash_token(raw_token)

    if not primary_key:
        primary_key = OneKey(
            user_id=user_id,
            label="primary",
            key_hash=token_hash,
            masked=mask_token(raw_token),
            is_primary=True,
        )
        db.add(primary_key)
    else:
        primary_key.key_hash = token_hash
        primary_key.masked = mask_token(raw_token)
        primary_key.revoked = False
        primary_key.last_used_at = None

    user.api_key = token_hash
    db.commit()
    db.refresh(primary_key)

    res = {
        "user_id": user_id,
        "api_key": raw_token,
        "warning": "Save this now — it is shown only once. The old primary key no longer works.",
    }
    res.update(_onekey_key_public(primary_key))
    return res


@app.put("/onekey-keys/{key_id}")
def update_onekey_key(
    key_id: int,
    body: UpdateOnekeyKeyRequest,
    sub: str = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    """Update label, rate limits, or revoked state of an ok- key. Returns 404 if key does not exist or belong to sub."""
    key = db.query(OneKey).filter(OneKey.id == key_id).first()
    if not key or key.user_id != sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Onekey key not found")

    if body.label is not None:
        key.label = body.label
    if body.clear_rate_limit:
        key.rate_limit_per_minute = None
    elif body.rate_limit_per_minute is not None:
        key.rate_limit_per_minute = body.rate_limit_per_minute

    if body.revoked is not None:
        key.revoked = body.revoked

    db.commit()
    db.refresh(key)
    res = {"user_id": sub}
    res.update(_onekey_key_public(key))
    return res


@app.delete("/onekey-keys/{key_id}")
def delete_onekey_key(
    key_id: int,
    sub: str = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    """Soft-revoke an ok- API key. Returns 404 if key does not exist or belong to sub."""
    key = db.query(OneKey).filter(OneKey.id == key_id).first()
    if not key or key.user_id != sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Onekey key not found")

    key.revoked = True
    db.commit()
    db.refresh(key)
    res = {"revoked": True}
    res.update(_onekey_key_public(key))
    return res


@app.post("/users/{user_id}/keys", response_model=StoreKeyResponse)
def store_provider_key(
    body: StoreKeyRequest,
    user_id: str = Depends(require_jwt_user),
    db: Session = Depends(get_db),
):
    """Store an encrypted provider API key (e.g., Anthropic, Groq, Gemini) for the user."""
    _load_user_or_404(db, user_id)
    if body.provider not in SUPPORTED_PROVIDERS:
        supported = ", ".join(sorted(SUPPORTED_PROVIDERS))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider '{body.provider}'. Supported providers are: {supported}",
        )

    enc_key = encrypt(body.api_key)
    existing = (
        db.query(ProviderKey)
        .filter(
            ProviderKey.user_id == user_id,
            ProviderKey.provider == body.provider,
            ProviderKey.key_label == body.key_label,
        )
        .first()
    )

    if existing:
        existing.encrypted_key = enc_key
        existing.updated_at = _utcnow()
        status_str = "updated"
        key_row = existing
    else:
        key_row = ProviderKey(
            user_id=user_id,
            provider=body.provider,
            key_label=body.key_label,
            encrypted_key=enc_key,
        )
        db.add(key_row)
        status_str = "created"

    db.commit()
    db.refresh(key_row)

    return StoreKeyResponse(
        user_id=user_id,
        provider=body.provider,
        key_label=body.key_label,
        key_id=key_row.id,
        status=status_str,
    )


@app.get("/users/{user_id}/keys", response_model=ListKeysResponse)
def list_provider_keys(
    user_id: str = Depends(require_jwt_user),
    db: Session = Depends(get_db),
):
    """List provider API keys configured for the user (without revealing encrypted key secrets)."""
    _load_user_or_404(db, user_id)
    keys = (
        db.query(ProviderKey)
        .filter(ProviderKey.user_id == user_id)
        .order_by(ProviderKey.provider, ProviderKey.key_label)
        .all()
    )

    providers_list = sorted(list({pk.provider for pk in keys}))
    key_infos = [
        ProviderKeyInfo(
            id=pk.id,
            provider=pk.provider,
            key_label=pk.key_label,
            created_at=_as_aware(pk.created_at).isoformat() if pk.created_at else None,
        )
        for pk in keys
    ]

    return ListKeysResponse(user_id=user_id, providers=providers_list, keys=key_infos)


@app.delete("/users/{user_id}/keys/{key_id}")
def delete_provider_key(
    key_id: int,
    user_id: str = Depends(require_jwt_user),
    db: Session = Depends(get_db),
):
    """Hard-delete a stored provider API key entry."""
    _load_user_or_404(db, user_id)
    pk = (
        db.query(ProviderKey)
        .filter(ProviderKey.id == key_id, ProviderKey.user_id == user_id)
        .first()
    )
    if not pk:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider key not found")

    deleted_info = {"id": pk.id, "provider": pk.provider, "key_label": pk.key_label}
    db.delete(pk)
    db.commit()

    return {"user_id": user_id, "deleted": deleted_info}


# --- Basic Endpoints ---

@app.get("/health")
def health_check():
    """Health check endpoint confirming API status and DB connection capabilities."""
    return {"status": "ok", "database": "ok", "version": "1.0.0"}


# --- Streaming Helpers ---

def _log_stream(
    db: Session,
    user_id: str,
    effort: str,
    handle: Any,
    started: float,
    onekey_key_id: Optional[int] = None,
) -> Optional[int]:
    """Insert an initial success RequestLog entry immediately when a stream starts.

    Returns the log entry ID so it can be updated with final usage tokens when the stream completes.
    """
    attempts_dicts = [a.as_dict() for a in handle.attempts]
    log_entry = RequestLog(
        user_id=user_id,
        effort=effort,
        models_attempted=attempts_dicts,
        succeed_models=handle.model_entry,
        provider=handle.provider,
        latency_ms=int((time.perf_counter() - started) * 1000),
        status="success",
        status_code=200,
        onekey_key_id=onekey_key_id,
    )
    try:
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)
        return log_entry.id
    except Exception:
        db.rollback()
        return None


def _update_stream_log(log_id: Optional[int], usage: Dict[str, Any], started: float) -> None:
    """Update initial stream RequestLog entry with final usage tokens and total latency."""
    if not log_id:
        return
    db = SessionLocal()
    try:
        entry = db.query(RequestLog).filter(RequestLog.id == log_id).first()
        if entry:
            entry.latency_ms = int((time.perf_counter() - started) * 1000)
            if usage:
                entry.prompt_tokens = usage.get("prompt_tokens")
                entry.completion_tokens = usage.get("completion_tokens")
                entry.total_tokens = usage.get(
                    "total_tokens",
                    (entry.prompt_tokens or 0) + (entry.completion_tokens or 0),
                )
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


async def _stream_with_usage_log(
    handle: Any,
    *,
    tier: str = "",
    log_id: Optional[int] = None,
    started: float,
) -> AsyncIterator[bytes]:
    """Async generator wrapping iter_stream, collecting usage stats and updating RequestLog on completion."""
    usage: Dict[str, Any] = {}
    try:
        async for chunk in iter_stream(handle, tier=tier, usage_out=usage):
            yield chunk
    finally:
        _update_stream_log(log_id, usage, started)


async def _stream_chat(
    db: Session,
    user: User,
    key: OneKey,
    effort: str,
    forward_body: Dict[str, Any],
    provider_keys: Dict[str, List[Tuple[str, str]]],
    models: List[str],
    deprioritized: set[str],
    *,
    stream_transform: Optional[Callable[[AsyncIterator[bytes]], AsyncIterator[bytes]]] = None,
) -> Any:
    """Initiate and return an SSE StreamingResponse for chat completions."""
    started = time.perf_counter()
    try:
        handle = await open_stream(
            models=models,
            body=forward_body,
            provider_keys=provider_keys,
            deprioritized_providers=deprioritized,
            rotation_id=user.id,
        )
    except NoModelsAvailable as exc:
        _log_request(db, user.id, effort, [], None, started, 409, key.id)
        return _no_models_error(exc)
    except AllProvidersFailed as exc:
        _update_provider_health(db, user.id, exc.attempts)
        _log_request(db, user.id, effort, exc.attempts, None, started, 502, key.id)
        return _all_failed_error(exc)

    _update_provider_health(db, user.id, handle.attempts)
    log_id = _log_stream(db, user.id, effort, handle, started, key.id)
    byte_stream = _stream_with_usage_log(handle, tier=effort, log_id=log_id, started=started)

    if stream_transform is not None:
        byte_stream = stream_transform(byte_stream)

    headers = {
        "X-Onekey-Provider": handle.provider,
        "X-Onekey-Model": handle.model_entry,
        "X-Onekey-Key-Label": handle.key_label or "",
        "Cache-Control": "no-cache",
    }
    return StreamingResponse(byte_stream, media_type="text/event-stream", headers=headers)


def _load_overrides_customs(
    db: Session, user_id: str
) -> Tuple[Dict[Tuple[str, str], Dict[str, Any]], List[UserModel]]:
    """Load per-user UserModel overrides and custom models."""
    rows = db.query(UserModel).filter(UserModel.user_id == user_id).all()
    overrides: Dict[Tuple[str, str], Dict[str, Any]] = {}
    customs: List[UserModel] = []
    for r in rows:
        if r.is_custom:
            customs.append(r)
        else:
            overrides[(r.model_entry, r.tier)] = {
                "enabled": r.enabled,
                "priority": r.priority,
            }
    return overrides, customs


async def _execute_chat_completion(
    db: Session,
    user: User,
    key: OneKey,
    *,
    forward_body: Dict[str, Any],
    effort: str,
    stream_transform: Optional[Callable[[AsyncIterator[bytes]], AsyncIterator[bytes]]] = None,
) -> Any:
    """Core execution pipeline for chat completion & responses endpoints."""
    if key.rate_limit_per_minute:
        used = _key_requests_last_minute(db, key.id)
        if used >= key.rate_limit_per_minute:
            return _openai_error(
                429,
                f"Rate limit reached for this Onekey key: {used} requests/min.",
                err_type="rate_limit_error",
                code="rate_limit_exceeded",
            )

    provider_keys = _load_provider_keys(db, user.id)
    if not provider_keys:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No provider keys configured for user '{user.id}'. Add at least one provider key first.",
        )

    overrides, customs = _load_overrides_customs(db, user.id)
    eff_table = build_effective_table(overrides, customs)

    pref = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    pref_providers = pref.preferred_providers if pref else []
    excl_providers = set(pref.excluded_providers) if pref else set()
    excl_models = set(pref.excluded_models) if pref else set()

    models = effective_cascade(
        eff_table,
        effort,
        excluded_models=excl_models,
        excluded_providers=excl_providers,
        preferred_providers=pref_providers,
    )

    deprioritized = _cooling_down_providers(db, user.id)
    started = time.perf_counter()

    if forward_body.get("stream"):
        return await _stream_chat(
            db,
            user,
            key,
            effort,
            forward_body,
            provider_keys,
            models,
            deprioritized,
            stream_transform=stream_transform,
        )

    try:
        result = await route_chat_completion(
            models=models,
            body=forward_body,
            provider_keys=provider_keys,
            deprioritized_providers=deprioritized,
            rotation_id=user.id,
            effort=effort,
        )
    except NoModelsAvailable as exc:
        _log_request(db, user.id, effort, [], None, started, 409, key.id)
        return _no_models_error(exc)
    except AllProvidersFailed as exc:
        _update_provider_health(db, user.id, exc.attempts)
        _log_request(db, user.id, effort, exc.attempts, None, started, 502, key.id)
        return _all_failed_error(exc)

    _update_provider_health(db, user.id, result.attempts)
    _log_request(db, user.id, effort, result.attempts, result, started, 200, key.id)
    return result.data


# --- Basic Endpoints ---

@app.get("/health")
def health_check():
    """Health check endpoint confirming API status and DB connection capabilities."""
    return {"status": "ok", "database": "ok", "version": "1.0.0"}


# --- Inference Endpoints ---

@app.post("/v1/chat/completions")
async def create_chat_completion(
    body: ChatCompletionRequest,
    key: OneKey = Depends(require_key),
    db: Session = Depends(get_db),
):
    """OpenAI-compatible Chat Completions endpoint."""
    user = _load_user_or_404(db, key.user_id)
    forward_body = body.model_dump(exclude_none=True)
    effort = _resolve_effort(body)
    return await _execute_chat_completion(
        db, user, key, forward_body=forward_body, effort=effort
    )


@app.post("/v1/responses")
async def create_response(
    request: Request,
    key: OneKey = Depends(require_key),
    db: Session = Depends(get_db),
):
    """OpenAI Responses API endpoint (used by Codex CLI v0.136+)."""
    try:
        raw_body = await request.json()
    except Exception:
        return _openai_error(400, "Invalid JSON body.")

    if not isinstance(raw_body, dict):
        return _openai_error(400, "Request body must be a JSON object.")

    user = _load_user_or_404(db, key.user_id)
    forward_body = responses_adapter.responses_to_openai_body(raw_body)
    effort = responses_adapter.resolve_responses_effort(raw_body)

    stream_transform = None
    if raw_body.get("stream"):
        stream_transform = lambda s: responses_adapter.convert_openai_stream_to_responses(s, raw_body)

    result = await _execute_chat_completion(
        db,
        user,
        key,
        forward_body=forward_body,
        effort=effort,
        stream_transform=stream_transform,
    )

    if isinstance(result, (JSONResponse, StreamingResponse)):
        return result

    return responses_adapter.openai_to_responses_response(result, raw_body)


@app.post("/v1/messages")
async def create_anthropic_message(
    request: Request,
    key: OneKey = Depends(require_key),
    db: Session = Depends(get_db),
):
    """Anthropic Messages API endpoint (used by Claude Code)."""
    try:
        raw_body = await request.json()
    except Exception:
        return JSONResponse(
            status_code=400,
            content=anthropic_adapter.anthropic_error(400, "Invalid JSON body."),
        )

    if not isinstance(raw_body, dict):
        return JSONResponse(
            status_code=400,
            content=anthropic_adapter.anthropic_error(400, "Request body must be a JSON object."),
        )

    user = _load_user_or_404(db, key.user_id)

    # 1. Rate limit check
    if key.rate_limit_per_minute:
        used = _key_requests_last_minute(db, key.id)
        if used >= key.rate_limit_per_minute:
            return JSONResponse(
                status_code=429,
                content=anthropic_adapter.anthropic_error(
                    429,
                    f"Rate limit reached for this Onekey key: {used} requests/min.",
                    error_type="rate_limit_error",
                ),
            )

    # 2. Provider keys check
    provider_keys = _load_provider_keys(db, user.id)
    if not provider_keys:
        return JSONResponse(
            status_code=400,
            content=anthropic_adapter.anthropic_error(
                400,
                f"No provider keys configured for user '{user.id}'. Add at least one via the dashboard.",
                error_type="invalid_request_error",
            ),
        )

    request_model = raw_body.get("model") or "claude-sonnet-4-6"
    effort = anthropic_adapter.resolve_effort(raw_body)
    forward_body = anthropic_adapter.anthropic_to_openai_body(raw_body)

    overrides, customs = _load_overrides_customs(db, user.id)
    eff_table = build_effective_table(overrides, customs)

    pref = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    pref_providers = pref.preferred_providers if pref else []
    excl_providers = set(pref.excluded_providers) if pref else set()
    excl_models = set(pref.excluded_models) if pref else set()

    models = effective_cascade(
        eff_table,
        effort,
        excluded_models=excl_models,
        excluded_providers=excl_providers,
        preferred_providers=pref_providers,
    )

    deprioritized = _cooling_down_providers(db, user.id)
    started = time.perf_counter()

    # Streaming path
    if raw_body.get("stream"):
        try:
            handle = await open_stream(
                models=models,
                body=forward_body,
                provider_keys=provider_keys,
                deprioritized_providers=deprioritized,
                rotation_id=user.id,
            )
        except NoModelsAvailable as exc:
            _log_request(db, user.id, effort, [], None, started, 409, key.id)
            return JSONResponse(
                status_code=409,
                content=anthropic_adapter.anthropic_error(409, str(exc), error_type="invalid_request_error"),
            )
        except AllProvidersFailed as exc:
            _update_provider_health(db, user.id, exc.attempts)
            _log_request(db, user.id, effort, exc.attempts, None, started, 502, key.id)
            return JSONResponse(
                status_code=502,
                content=anthropic_adapter.anthropic_error(502, "All candidate models were exhausted."),
            )

        _update_provider_health(db, user.id, handle.attempts)
        log_id = _log_stream(db, user.id, effort, handle, started, key.id)

        usage: Dict[str, Any] = {}
        async def _iter_stream_bytes():
            try:
                async for chunk in anthropic_adapter.convert_openai_stream_to_anthropic(
                    iter_stream(handle, usage_out=usage), request_model
                ):
                    yield chunk
            finally:
                _update_stream_log(log_id, usage, started)

        headers = {
            "X-Onekey-Provider": handle.provider,
            "X-Onekey-Model": handle.model_entry,
            "Cache-Control": "no-cache",
        }
        return StreamingResponse(_iter_stream_bytes(), media_type="text/event-stream", headers=headers)

    # Non-streaming path
    try:
        result = await route_chat_completion(
            models=models,
            body=forward_body,
            provider_keys=provider_keys,
            deprioritized_providers=deprioritized,
            rotation_id=user.id,
            effort=effort,
        )
    except NoModelsAvailable as exc:
        _log_request(db, user.id, effort, [], None, started, 409, key.id)
        return JSONResponse(
            status_code=409,
            content=anthropic_adapter.anthropic_error(409, str(exc), error_type="invalid_request_error"),
        )
    except AllProvidersFailed as exc:
        _update_provider_health(db, user.id, exc.attempts)
        _log_request(db, user.id, effort, exc.attempts, None, started, 502, key.id)
        return JSONResponse(
            status_code=502,
            content=anthropic_adapter.anthropic_error(502, "All candidate models were exhausted."),
        )

    _update_provider_health(db, user.id, result.attempts)
    _log_request(db, user.id, effort, result.attempts, result, started, 200, key.id)

    anthropic_resp = anthropic_adapter.openai_to_anthropic_message(result.data, model=request_model)
    return anthropic_resp


@app.post("/v1/messages/count_tokens")
async def count_anthropic_tokens(
    request: Request,
    key: OneKey = Depends(require_key),
):
    """Estimate token count for an Anthropic Messages API request body."""
    try:
        raw_body = await request.json()
    except Exception:
        return JSONResponse(
            status_code=400,
            content=anthropic_adapter.anthropic_error(400, "Invalid JSON body."),
        )

    tokens = anthropic_adapter.estimate_input_tokens(raw_body)
    return {"input_tokens": tokens}



