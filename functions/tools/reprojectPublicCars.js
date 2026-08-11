/**
 * One-off script to call adminReprojectPublicCars (manual repair).
 *
 * Requires an admin user's Firebase ID token. Get it from the browser while
 * logged in as admin: open DevTools Console and run:
 *   (await firebase.auth().currentUser.getIdToken())
 * then set env: set ID_TOKEN=<paste>
 *
 * Usage (Windows): set ID_TOKEN=<your-token> && node tools/reprojectPublicCars.js
 * Usage (Unix):   ID_TOKEN=<your-token> node tools/reprojectPublicCars.js
 *
 * Optional env: YARD_UID (default 72HNYgtEdWV0zn19I6H51TSzPEj1), LIMIT (default 50)
 * Single car: CAR_ID (if set, reproject only that car; YARD_UID optional, can be blank)
 *
 * Run from repo root: node functions/tools/reprojectPublicCars.js
 * Or from functions dir: node tools/reprojectPublicCars.js
 */

const PROJECT_ID = 'carexpert-94faa';
const REGION = 'us-central1';
const FUNCTION_NAME = 'adminReprojectPublicCars';

const carIdRaw = process.env.CAR_ID;
const isSingleCar = carIdRaw != null && String(carIdRaw).trim() !== '';

const yardUid = process.env.YARD_UID || (isSingleCar ? '' : '72HNYgtEdWV0zn19I6H51TSzPEj1');
const limit = parseInt(process.env.LIMIT || '50', 10) || 50;
const idToken = process.env.ID_TOKEN || process.env.FIREBASE_ID_TOKEN;

if (!idToken || idToken.trim() === '') {
  console.error('Missing ID_TOKEN. Get it from browser (logged in as admin):');
  console.error('  (await firebase.auth().currentUser.getIdToken())');
  console.error('Then: set ID_TOKEN=<paste> && node functions/tools/reprojectPublicCars.js');
  process.exit(1);
}

if (!isSingleCar && (!yardUid || yardUid.trim() === '')) {
  console.error('Missing YARD_UID in batch mode (or set CAR_ID for single-car mode).');
  process.exit(1);
}

const url = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${FUNCTION_NAME}`;

let payload;
if (isSingleCar) {
  const carId = carIdRaw.trim();
  const effectiveYardUid = (yardUid || '').trim();
  console.log('Reproject single car: ' + carId + ' (yardUid: ' + effectiveYardUid + ')');
  payload = {
    data: {
      yardUid: effectiveYardUid,
      carId: carId,
    },
  };
} else {
  payload = {
    data: {
      yardUid: yardUid.trim(),
      limit: Math.min(2000, Math.max(1, limit)),
    },
  };
}

const body = JSON.stringify(payload);

;(async () => {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken.trim()}`,
      },
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('HTTP', res.status, text);
      process.exit(1);
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.log('Response (raw):', text);
      process.exit(0);
    }
    const result = data.result != null ? data.result : data;
    console.log('Result:', JSON.stringify({ matched: result.matched, processed: result.processed, errors: result.errors, durationMs: result.durationMs }, null, 2));
    if (result.errors && result.errors.length > 0) {
      console.error('Errors:', result.errors);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
