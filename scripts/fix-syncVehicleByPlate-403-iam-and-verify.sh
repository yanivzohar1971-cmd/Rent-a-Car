#!/bin/bash
# Run in Google Cloud Shell: https://console.cloud.google.com/cloudshell
# Fixes 403 + CORS for syncVehicleByPlate (Gen1) and prints proof.

set -e
PROJECT=carexpert-94faa
REGION=us-central1
FUNC=syncVehicleByPlate
URL="https://us-central1-carexpert-94faa.cloudfunctions.net/syncVehicleByPlate"

echo "=== Step 1: Set project ==="
gcloud config set project $PROJECT

echo ""
echo "=== Step 2: Add allUsers invoker (Gen1) ==="
gcloud functions add-iam-policy-binding $FUNC \
  --region=$REGION \
  --member="allUsers" \
  --role="roles/cloudfunctions.invoker"

echo ""
echo "=== Step 3: Verify IAM policy (proof: allUsers invoker) ==="
gcloud functions get-iam-policy $FUNC \
  --region=$REGION \
  --format=json

echo ""
echo "=== Step 4: Preflight proof (OPTIONS + ACAO) ==="
curl -i -X OPTIONS \
  -H "Origin: https://www.carexperts4u.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  "$URL"

echo ""
echo "Done. Expected: HTTP 204/200 and Access-Control-Allow-Origin: https://www.carexperts4u.com"
