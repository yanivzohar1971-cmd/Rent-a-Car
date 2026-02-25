#!/usr/bin/env bash
# Fix 403 on syncVehicleByPlate: allow unauthenticated invoker so browser reaches the function (CORS + Bearer auth in code).
# Run in Google Cloud Shell: bash scripts/set-syncVehicleByPlate-public-invoker.sh
# Or locally if gcloud is installed.

set -e
echo "Setting allUsers as Cloud Functions Invoker for syncVehicleByPlate (us-central1)..."
gcloud functions add-iam-policy-binding syncVehicleByPlate \
  --region=us-central1 \
  --member="allUsers" \
  --role="roles/cloudfunctions.invoker"
echo "Done. OPTIONS/POST will reach the function; CORS and Bearer auth run in code."
