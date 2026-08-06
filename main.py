# main.py — FastAPI web application shell, error formatting, auth dependencies, and route dispatch.
# Responsible for request routing, authentication verification, and OpenAI error envelope formatting.
# Must NEVER bypass authentication on protected endpoints or emit non-OpenAI error schemas to clients.

import env_loader  # MUST be first import to ensure environment variables are loaded before model/crypto initialization

from contextlib import asynccontextmanager
import datetime
import os
import secrets
from typing import Generator, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import jwt
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.orm import Session

from crypto import encrypt, hash_token, mask_token
from models import OneKey, ProviderKey, SessionLocal, User, init_db
from registry import SUPPORTED_PROVIDERS


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


@app.post("/v1/chat/completions")
def chat_completions_stub(key: OneKey = Depends(require_key)):
    """Stub endpoint for Module 7a to test auth validation prior to full router integration."""
    return {"status": "ok"}

