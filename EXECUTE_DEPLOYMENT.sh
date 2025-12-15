#!/bin/bash
# One-shot production deployment execution
# Run from repo root

set -e  # Exit on error

echo "=========================================="
echo "Rental Companies - Production Deployment"
echo "Project: carexpert-94faa"
echo "Date: $(date)"
echo "=========================================="
echo ""

# Check if Firebase CLI is available
if ! command -v firebase &> /dev/null; then
    echo "❌ Error: Firebase CLI not found. Install with: npm install -g firebase-tools"
    exit 1
fi

# Check if logged in
if ! firebase projects:list &> /dev/null; then
    echo "❌ Error: Not logged in to Firebase. Run: firebase login"
    exit 1
fi

echo "⚠️  PREREQUISITE CHECK"
echo "Before proceeding, ensure:"
echo "1. SUPER_ADMIN_EMAILS secret is set"
echo "2. Functions are deployed (if secret was just set)"
echo "3. All admin users have custom claims set and verified"
echo ""
read -p "Have you completed all prerequisites? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Deployment cancelled. Complete prerequisites first."
    exit 1
fi

echo ""
echo "=========================================="
echo "PHASE 3: Deploying Rules + Hosting"
echo "=========================================="
echo ""

# Step 1: Firestore rules
echo "[1/3] Deploying Firestore rules..."
echo "Command: firebase deploy --only firestore:rules"
echo "---"
firebase deploy --only firestore:rules
echo "✓ Firestore rules deployed"
echo ""

# Step 2: Storage rules
echo "[2/3] Deploying Storage rules..."
echo "Command: firebase deploy --only storage"
echo "---"
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
echo "Command: cd $REPO_ROOT/web && npm run build && cd $REPO_ROOT && firebase deploy --only hosting"
echo "---"
cd "$REPO_ROOT/web"
npm run build
cd "$REPO_ROOT"
firebase deploy --only hosting
echo "✓ Hosting deployed"
echo ""

echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Run smoke tests (see PRODUCTION_EXECUTION_INSTRUCTIONS.md)"
echo "2. Monitor Firebase Console logs"
echo "3. Update DEPLOYMENT_EXECUTION_LOG.md with outputs"
echo ""
