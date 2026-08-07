# Streaming chat completion
#
# Usage:
#   export ONEKEY_KEY="ok-your-key"
#   ./stream.sh

set -euo pipefail

ONEKEY_KEY="${ONEKEY_KEY:?Set ONEKEY_KEY}"
GATEWAY_URL="${GATEWAY_URL:-http://localhost:8000}"

curl -sS -N "${GATEWAY_URL}/v1/chat/completions" \
  -H "Authorization: Bearer ${ONEKEY_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "onekey-low",
    "stream": true,
    "messages": [{"role": "user", "content": "Count from 1 to 5 slowly."}]
  }'
