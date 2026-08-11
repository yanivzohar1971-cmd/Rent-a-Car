# Firebase Deploy — Commands Executed & Deliverable

## 1) Functions currently deployed

**Command:**
```bash
cd C:\Rent_a_Car
firebase functions:list
```

**Result (key parts):** Exit code 2 at end (firebase-tools update check error); list printed successfully. All three target functions are present:

| Function | Version | Trigger |
|----------|---------|---------|
| adminReprojectPublicCars | v1 | callable |
| onAdminSellerExposureChangeUpdatePublicCars | v1 | document.write |
| onYardProfileChangeUpdatePublicCars | v1 | document.update |

No need to re-deploy these; they were already deployed from the earlier (partial) full deploy.

---

## 2) Finish deployment (targeted, if needed)

If a full `firebase deploy --only functions` times out, use targeted deploys:

```bash
cd C:\Rent_a_Car
firebase deploy --only functions:adminReprojectPublicCars --debug
firebase deploy --only functions:onAdminSellerExposureChangeUpdatePublicCars --debug
firebase deploy --only functions:onYardProfileChangeUpdatePublicCars --debug
```

Build first if needed:
```bash
cd C:\Rent_a_Car\functions
npm ci
npm run build
cd ..
```

---

## 3) Firestore indexes

**Command:**
```bash
cd C:\Rent_a_Car
firebase deploy --only firestore:indexes
```

**Output:**
```
=== Deploying to 'carexpert-94faa'...
i  deploying firestore
i  firestore: reading indexes from firestore.indexes.json...
+  firestore: deployed indexes in firestore.indexes.json successfully for (default) database
+  Deploy complete!
```

---

## 4) Verify functions list again

After any deploy, run:
```bash
firebase functions:list
```
Confirm the three functions appear with no errors in the table.

---

## 5) Manual repair script

**Location:** `functions/tools/reprojectPublicCars.js`

**Full code:** (see file in repo; summary below)

- Reads env: `ID_TOKEN` (required), `YARD_UID` (default `72HNYgtEdWV0zn19I6H51TSzPEj1`), `LIMIT` (default 50).
- POSTs to `https://us-central1-carexpert-94faa.cloudfunctions.net/adminReprojectPublicCars` with `Authorization: Bearer <idToken>` and body `{ data: { yardUid, limit } }`.
- Prints `{ matched, processed, errors, durationMs }`.

**How to get ID_TOKEN:** In browser, logged in as admin, DevTools Console:
```js
(await firebase.auth().currentUser.getIdToken())
```

**Run (Windows PowerShell):**
```powershell
cd C:\Rent_a_Car
$env:ID_TOKEN = "<paste-token-here>"
node functions/tools/reprojectPublicCars.js
```

**Run without token (expected):**
```bash
node functions/tools/reprojectPublicCars.js
```
Output: `Missing ID_TOKEN. Get it from browser...` then exit 1.

---

## 6) Validate Firestore data

In Firebase Console → Firestore → `publicCars`: pick a document with `yardUid == 72HNYgtEdWV0zn19I6H51TSzPEj1` and confirm:

- `yardName` or `sellerDisplayName` is set.
- `showNameInBadge` / `showSellerNameInBadge` is not false when exposure allows.

---

## 7) Final validation

Open `/cars` in incognito (or hard refresh) and confirm the badge shows "שרק רכבים" for that yard’s cars.

---

## Summary

- **Functions:** Already deployed; no redeploy performed for the three.
- **Indexes:** Deployed with `firebase deploy --only firestore:indexes` — success.
- **Script:** `functions/tools/reprojectPublicCars.js` added; run with admin `ID_TOKEN` to trigger repair.
- **React/web:** Not modified.
