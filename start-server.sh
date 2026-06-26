#!/usr/bin/env bash
# Start the Cadre Crew PersonaPlex server with the built client UI.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PERSONAPLEX_DIR="$SCRIPT_DIR/personaplex"
VENV_DIR="$SCRIPT_DIR/.venv"
ENV_FILE="$PERSONAPLEX_DIR/.env"

if [ ! -d "$VENV_DIR" ]; then
  echo "Virtualenv not found. Run ./setup.sh first."
  exit 1
fi

if [ ! -f "$PERSONAPLEX_DIR/client/dist/index.html" ]; then
  echo "Client not built. Run ./setup.sh first."
  exit 1
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

cd "$PERSONAPLEX_DIR"
SSL_DIR="$(mktemp -d)"
echo "Starting server on https://0.0.0.0:8998 (SSL dir: $SSL_DIR)"
exec python -m moshi.server \
  --host 0.0.0.0 \
  --port 8998 \
  --ssl "$SSL_DIR" \
  --static ./client/dist
