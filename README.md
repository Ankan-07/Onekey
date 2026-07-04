# Onekey

> One API key for every free LLM.

Onekey is a self-hosted **LLM gateway** that fronts twelve free-tier inference
providers behind a single unified API key — with effort-based routing, automatic
failover, rate-limit cooldowns, encrypted key storage, and usage analytics.

If your code already calls OpenAI or Claude, the only change is the base URL and the key.

> 🚧 **Status: work in progress.**

## How it works

1. You send a request with your single `ak-` key and pick an effort tier —
   `keychain-low` (fast), `keychain-medium` (balanced), or `keychain-high` (best).
2. The gateway expands the tier into an ordered cascade of real upstream models.
3. It skips providers that are cooling down (recently rate-limited) or that you
   have no key for, and tries candidates in priority order.
4. On any error (429, 5xx, timeout) it fails over to the next key/model.
   The first success wins and is returned as a normalized OpenAI-shaped response.
5. Every request is logged: model, provider, tokens, latency, status.

## Features

- **Effort-based routing** — three tiers instead of hardcoded model names
- **Automatic failover** — cascades across models, providers, and multiple keys per provider
- **Rate-limit cooldowns** — a 429 parks the provider for 60s instead of hammering it
- **Encrypted key storage** — provider keys at rest with AES-256-GCM
- **One rotatable key** — `ak-` tokens stored only as SHA-256 hashes
- **Bring your own models** — pin any model into a tier, reorder priority
- **Usage analytics** — per-provider/model counts, tokens, success rate, latency
- **Three client protocols**:
  - OpenAI Chat Completions — `POST /v1/chat/completions` (+ `/v1/models`)
  - OpenAI Responses — `POST /v1/responses` (Codex CLI)
  - Anthropic Messages — `POST /v1/messages` (Claude Code)

## Stack

| Piece | Stack | Port |
| :-- | :-- | :-- |
| Gateway | FastAPI + httpx + SQLAlchemy (SQLite local / Postgres prod) | 8000 |
| Dashboard | Next.js 14, React 18, TypeScript, Tailwind, Supabase Auth | 3000 |

## Supported providers

Gemini · Groq · Cerebras · Mistral · DeepSeek · OpenRouter · Together · Cohere ·
NVIDIA NIM · SambaNova · Hugging Face · Cloudflare Workers AI

## Quickstart (once built)

```sh
# Gateway
python -m venv .venv && .venv\Scripts\activate    # Windows
pip install -r requirements.txt
set MASTER_SECRET=<strong random string>
uvicorn main:app --reload            # http://localhost:8000

# Dashboard
npm install
cp .env.example .env.local           # fill in Supabase + API URL
npm run dev                          # http://localhost:3000
```

Then:

```sh
curl http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer ak-YOUR-KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "keychain-medium", "messages": [{"role": "user", "content": "Hello"}]}'
```

Claude Code: `ANTHROPIC_BASE_URL=http://localhost:8000` + `ANTHROPIC_API_KEY=ak-YOUR-KEY`.

## License

MIT
