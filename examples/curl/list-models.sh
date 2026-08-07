#!/usr/bin/env bash
# List available models (including onekey-* effort tiers)
#
# Usage:
#   export ONEKEY_KEY="ok-your-key"
#   ./list-models.sh

set -euo pipefail

ONEKEY_KEY="${ONEKEY_KEY:?Set ONEKEY_KEY}"
GATEWAY_URL="${GATEWAY_URL:-http://localhost:8000}"

curl -sS "${GATEWAY_URL}/v1/models" \
  -H "Authorization: Bearer ${ONEKEY_KEY}" | jq '.data[].id'
