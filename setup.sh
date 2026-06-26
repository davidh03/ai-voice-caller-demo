#!/usr/bin/env bash
# Cadre Crew / PersonaPlex — full server setup (Ubuntu/Debian, e.g. RunPod)
set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
NODE_VERSION="20.12.2"
PYTHON="${PYTHON:-python3}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PERSONAPLEX_DIR="$SCRIPT_DIR/personaplex"
CLIENT_DIR="$PERSONAPLEX_DIR/client"
MOSHI_DIR="$PERSONAPLEX_DIR/moshi"
VENV_DIR="$SCRIPT_DIR/.venv"

if [ ! -d "$MOSHI_DIR" ]; then
  echo "Error: personaplex/moshi not found. Clone the repo first, then run ./setup.sh from the repo root."
  exit 1
fi

echo "==> Cadre Crew AI Voice Caller — setup"
echo "    Repo: $SCRIPT_DIR"

# ---------------------------------------------------------------------------
# System packages
# ---------------------------------------------------------------------------
echo "==> Updating apt packages..."
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt-get install -y \
  nano \
  curl \
  ca-certificates \
  build-essential \
  pkg-config \
  libopus-dev \
  "$PYTHON" \
  "$PYTHON"-venv \
  "$PYTHON"-dev

# ---------------------------------------------------------------------------
# Python venv + moshi
# ---------------------------------------------------------------------------
echo "==> Creating Python virtualenv at $VENV_DIR"
"$PYTHON" -m venv "$VENV_DIR"
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

echo "==> Installing moshi (PersonaPlex)..."
pip install --upgrade pip wheel setuptools
pip install "$MOSHI_DIR/."

# ---------------------------------------------------------------------------
# Node.js + client build
# ---------------------------------------------------------------------------
echo "==> Installing Node.js $NODE_VERSION via nvm..."
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh"
nvm install "$NODE_VERSION"
nvm use "$NODE_VERSION"

echo "==> Building client..."
cd "$CLIENT_DIR"
npm ci
npm run build
cd "$SCRIPT_DIR"

# ---------------------------------------------------------------------------
# Environment file (.env)
# ---------------------------------------------------------------------------
ENV_EXAMPLE="$PERSONAPLEX_DIR/.env.example"
ENV_FILE="$PERSONAPLEX_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ENV_EXAMPLE" ]; then
    echo "==> Creating $ENV_FILE from .env.example"
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
  else
    echo "Warning: $ENV_EXAMPLE not found. Create $ENV_FILE manually with HF_TOKEN=..."
  fi
else
  echo "==> $ENV_FILE already exists, leaving it unchanged"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "=============================================="
echo " Setup complete."
echo "=============================================="
echo ""
echo "IMPORTANT: Accept the model license at:"
echo "  https://huggingface.co/nvidia/personaplex-7b-v1"
echo ""
echo "Add your Hugging Face token:"
echo "  nano $ENV_FILE"
echo ""
echo "Start the server:"
echo "  cd $SCRIPT_DIR"
echo "  ./start-server.sh"
echo ""
echo "Or manually:"
echo "  source $VENV_DIR/bin/activate"
echo "  set -a && source $ENV_FILE && set +a"
echo "  cd $PERSONAPLEX_DIR"
echo "  SSL_DIR=\$(mktemp -d)"
echo "  python -m moshi.server --host 0.0.0.0 --port 8998 --ssl \"\$SSL_DIR\" --static ./client/dist"
echo ""
