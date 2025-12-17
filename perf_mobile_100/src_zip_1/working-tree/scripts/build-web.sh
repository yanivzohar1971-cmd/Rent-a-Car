#!/bin/bash
# Build web app script (CWD-safe)
# Works from any directory

set -e  # Exit on error

# Get repo root via git
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

if [ -z "$REPO_ROOT" ]; then
    echo "❌ Error: Not a git repo / cannot determine repo root"
    exit 1
fi

# Verify web directory exists
if [ ! -f "$REPO_ROOT/web/package.json" ]; then
    echo "❌ Error: web/package.json not found at: $REPO_ROOT/web/package.json"
    exit 1
fi

# Build web app
echo "Building web app from: $REPO_ROOT/web"
cd "$REPO_ROOT/web"
npm run build
cd "$REPO_ROOT"

echo "✓ Web build complete"
