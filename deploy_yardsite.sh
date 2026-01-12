#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="carexpert-94faa"
REPO_DIR="/mnt/c/Rent_a_Car"
WEB_DIST="$REPO_DIR/web/dist"
CHECK_FILE="$WEB_DIST/index.html"

echo "==[1/8] Sanity =="
whoami
pwd

echo "==[2/8] Go to repo: $REPO_DIR =="
cd "$REPO_DIR"
ls -la

echo "==[3/8] Ensure Node & npm =="
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node/npm not found. Installing via apt..."
  sudo apt update
  sudo apt install -y nodejs npm
fi
echo "Node: $(node -v)"
echo "npm:  $(npm -v)"

echo "==[4/8] Ensure Firebase CLI (Linux) =="
if ! command -v firebase >/dev/null 2>&1; then
  echo "firebase-tools not found. Installing..."
  sudo npm i -g firebase-tools
fi
echo "firebase: $(firebase --version)"

echo "==[5/8] Export AdminDebug snapshot (pre-build) =="
echo "Running AdminDebug snapshot exporter to ensure fresh data..."
chmod +x tools/adminDebug/runExportSnapshot.sh
./tools/adminDebug/runExportSnapshot.sh
echo "AdminDebug snapshot export completed ✅"

echo "==[6/8] Build output check =="
if [ ! -f "$CHECK_FILE" ]; then
  echo "Missing $CHECK_FILE -> building web..."
  (cd web && npm run build)
else
  echo "Build output exists: $CHECK_FILE"
fi

echo "==[7/8] Firebase project context (read-only steps) =="
# These will fail if you're not logged in; we'll tell you clearly.
firebase use "$PROJECT_ID" >/dev/null 2>&1 || {
  echo ""
  echo "!! You are probably not logged in to Firebase in WSL."
  echo "Run this once, then re-run this script:"
  echo "   firebase login"
  echo ""
  exit 1
}

echo "Hosting sites:"
firebase hosting:sites:list --project "$PROJECT_ID" || true

echo "==[8/8] DEPLOY (ONLY hosting:yardsite) =="
echo "Running: firebase deploy --only hosting:yardsite --project $PROJECT_ID"
firebase deploy --only hosting:yardsite --project "$PROJECT_ID"

echo ""
echo "DONE ✅"
echo "Yardsite URL: https://yardsite.web.app"
