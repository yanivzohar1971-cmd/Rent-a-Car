#!/bin/bash
# Deployment script for Rental Companies module
# Run from repo root

set -e  # Exit on error

echo "=========================================="
echo "Rental Companies Module - Production Deploy"
echo "=========================================="
echo ""

# Step 1: Deploy Firestore rules
echo "[1/3] Deploying Firestore rules..."
firebase deploy --only firestore:rules
echo "✓ Firestore rules deployed"
echo ""

# Step 2: Deploy Storage rules
echo "[2/3] Deploying Storage rules..."
firebase deploy --only storage
echo "✓ Storage rules deployed"
echo ""

# Step 3: Build and deploy Hosting
echo "[3/3] Building and deploying Hosting..."
# Get repo root (works from any directory)
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
if [ ! -f "$REPO_ROOT/web/package.json" ]; then
  echo "❌ Error: web/package.json not found. Are you in the repo root?"
  exit 1
fi
cd "$REPO_ROOT/web"
npm run build
cd "$REPO_ROOT"
firebase deploy --only hosting
echo "✓ Hosting deployed"
echo ""

echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Verify custom claims are set for all admin users"
echo "2. Run smoke tests (see PRODUCTION_SMOKE_TEST_REPORT.md)"
echo "3. Monitor Firebase Console logs for errors"
