# Examples

Runnable samples for calling Onekey with common tools and SDKs.

| Directory | Description |
| --- | --- |
| [curl/](curl/) | Shell scripts for chat, streaming, and model listing |
| [python/](python/) | OpenAI Python SDK |
| [typescript/](typescript/) | OpenAI SDK (TypeScript) |
| [node/](node/) | OpenAI SDK (Node ESM) |
| [nextjs/](nextjs/) | Next.js App Router server route |

## Prerequisites

1. Running gateway (`uvicorn main:app --reload`)
2. Keychain `ok-` key from the dashboard
3. At least one upstream provider key configured

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `ONEKEY_KEY` | — | Your `ok-...` bearer token |
| `GATEWAY_URL` | `http://localhost:8000` | Gateway base URL (no `/v1` suffix) |

## Effort tiers

Use these as the `model` parameter for OpenAI clients:

- `onekey-low` — **fast** (smallest free models)
- `onekey-medium` — **balanced**
- `onekey-high` — **best** free models in the cascade

For Claude Code, set `ANTHROPIC_BASE_URL` to your gateway host and use your
`ok-` key. Model names like `claude-sonnet-4-6` map to the medium tier.

See [docs/getting-started.md](../docs/getting-started.md) for the full walkthrough.
