from __future__ import annotations
from dataclasses import dataclass
from typing import Any, AsyncIterator, Dict, List, Optional
from crypto import decrypt
from registry import PROVIDER_BASE_URLS, parse_model

import json
import time
import httpx

_REQUEST_TIMEOUT = httpx.Timeout(60.0, connect=10.0)
_STREAM_TIMEOUT = httpx.Timeout(None, connect=10.0)
COOLDOWN_SECONDS = 60

# In-process round-robin cursors, keyed by "<rotation_id>:<provider>". Advancing
# per call spreads load across a provider's multiple keys on successive requests.
_rr_cursor: Dict[str, int]= {}

def _rotate_keys(keys:List[tuple[str,str]],rotation_key:str) ->List[tuple[str,str]]:
    if len(keys) <=1:
        return list(keys)
    idx = _rr_cursor.get(rotation_key,0)%len(keys)
    _rr_cursor[rotation_key] = idx+1
    return keys[idx:] +keys[:idx]

@dataclass
class Attempt:
    model_entry:str
    provider:str
    status:str
    error:str
    key_label:str

    def as_dict(self) ->Dict[str,Any]:
        return {
            "model": self.model_entry,
            "provider": self.provider,
            "status": self.status,
            "error": self.error,
            "key_label": self.key_label,
        }

@dataclass
class RouteResult:
    data:Dict[str,Any]
    model_entry:str
    provider:str
    upstream_model:str
    attempts:List[Attempt]

    @property
    def usage(self) -> Dict[str,Any]:
        return self.data.get("usage") or {}

class NoModelsAvailable(Exception):
    """User has no key for any model in the requested tier."""

class AllProvidersFailed(Exception):
    def __init__(self, attempts: List[Attempt]):
        self.attempts = attempts
        summary = "; ".join(
            f"{a.model_entry} -> {a.status or 'ERR'}"
            f"{(' ' + a.error) if a.error else ''}"
            for a in attempts
        )
        super().__init__(f"All providers failed: {summary}")

def _candidate_models(
        models:List[str],
        available_providers:set[str],
        deprioritized_providers:Optional[set[str]]=None
) -> list[tuple[str,str,str]]:

    deprioritized = deprioritized_providers or set()
    preferred: List[tuple[str,str,str]] = []
    deffered: List[tuple[str,str,str]] = []
    for entry in models:
        provider,upstream_model = parse_model(entry)
        if provider not in available_providers:
            continue
        triple = (entry,provider, upstream_model)
        if provider in deprioritized:
            deffered.append(triple)
        else:
            preferred.append(triple)

    return preferred + deffered

def build_payload(body:Dict[str,Any], upstream_model:str) -> Dict[str,Any]:
    """Forward an OpenAI-style body, swapping in the upstream model name.

    The custom ``effort`` field is stripped — it's ours, not the provider's.
    A client-supplied ``model`` is ignored in favor of the routed model.
    """
    payload = {k:v for k,v in body.items() if k not in ("effort", "model")}
    payload["model"] = upstream_model
    return payload

async def route_chat_completion(
        *,
        models: List[str],
        body: Dict[str,Any],
        provider_keys: Dict[str,List[tuple[str,str]]],
        deprioritized_providers: Optional[set[str]],
        rotation_id:str = "",
        effort:str = "",
) -> RouteResult:
    candidates = _candidate_models(models,set(provider_keys.keys()), deprioritized_providers)
    if not candidates:
        raise NoModelsAvailable(
            "No enabled model matches your configured providers and preferences"
            "Add a provider key, enable a model, or relax your exclusions"
        )
    attempts: List[Attempt] = []
