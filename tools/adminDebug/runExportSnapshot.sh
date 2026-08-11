#!/bin/bash

# Helper script to run Admin Debug snapshot exporter with Service Account key
# 
# Usage:
#   ./tools/adminDebug/runExportSnapshot.sh
#   # or with custom key path:
#   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json ./tools/adminDebug/runExportSnapshot.sh

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEFAULT_KEY_PATH="$SCRIPT_DIR/keys/carexpert-94faa-sa.json"

# If GOOGLE_APPLICATION_CREDENTIALS not set and default key exists, use it
if [ -z "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
  if [ -f "$DEFAULT_KEY_PATH" ]; then
    export GOOGLE_APPLICATION_CREDENTIALS="$DEFAULT_KEY_PATH"
    echo "[Helper] Using default key path: $DEFAULT_KEY_PATH"
  else
    echo "[Helper] No Service Account key found at default path"
    echo "[Helper] Exporter will try Application Default Credentials (ADC)"
    echo ""
    echo "To use Service Account key instead:"
    echo "  1. Place key at: $DEFAULT_KEY_PATH"
    echo "  2. Or set: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json"
    echo ""
  fi
else
  echo "[Helper] Using key from GOOGLE_APPLICATION_CREDENTIALS: $GOOGLE_APPLICATION_CREDENTIALS"
  # Validate key file exists if explicitly set
  if [ ! -f "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
    echo "[Helper] Error: Key file not found: $GOOGLE_APPLICATION_CREDENTIALS"
    exit 1
  fi
fi

# Run the exporter
echo "[Helper] Running snapshot exporter..."
cd "$REPO_ROOT"
node tools/adminDebug/exportDebugSnapshot.mjs
