@REM Fix 403 on syncVehicleByPlate: allow unauthenticated invoker (CORS + Bearer auth in code).
@REM
@REM Gen1 confirmed: syncVehicleByPlate is v1 https in us-central1.
@REM
@REM Run ONE of:
@REM
@REM 1) Google Cloud Shell (gcloud preinstalled):
@REM    https://console.cloud.google.com/cloudshell
@REM    Then: gcloud functions add-iam-policy-binding syncVehicleByPlate --region=us-central1 --member=allUsers --role=roles/cloudfunctions.invoker
@REM
@REM 2) GCP Console (no CLI):
@REM    https://console.cloud.google.com/functions/list?project=carexpert-94faa
@REM    Click syncVehicleByPlate -> Permissions -> ADD PRINCIPAL -> New principals: allUsers -> Role: Cloud Functions Invoker -> Save
@REM
@REM 3) If gcloud is installed locally, run this script.
@REM
echo Checking gcloud...
where gcloud 2>nul || (echo gcloud not found. Run this in Google Cloud Shell or install Google Cloud SDK. & exit /b 1)

echo Setting allUsers as Cloud Functions Invoker for syncVehicleByPlate...
gcloud functions add-iam-policy-binding syncVehicleByPlate --region=us-central1 --member="allUsers" --role="roles/cloudfunctions.invoker"

echo Done. OPTIONS/POST will reach the function; CORS and Bearer auth run in code.
