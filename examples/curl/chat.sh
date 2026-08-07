#!/usr/bin/env bash
# Chat completion via curl
#
# Usage:
#   export ONEKEY_KEY="ok-your-key"
#   export GATEWAY_URL="http://localhost:8000"
#   ./chat.sh

set -euo pipefail

ONEKEY_KEY="${ONEKEY_KEY:?Set ONEKEY_KEY to your ok- key}"
GATEWAY_URL="${GATEWAY_URL:-http://localhost:8000}"

curl -sS "${GATEWAY_URL}/v1/chat/completions" \
  -H "Authorization: Bearer ${ONEKEY_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "onekey-medium",
    "messages": [{"role": "user", "content": "Say hello in one sentence."}]
  }' | jq .
