# פריסה לאתר — Re-project publicCars על שינוי Exposure ו־Yard Profile

מסמך זה מתאר את כל השינויים שבוצעו (Backend-only) כדי ש־**דף הרכבים הציבורי (/cars)** יציג תמיד את שם החצר (Badge) ופרטי מוכר כשההגדרות מאפשרות.

---

## מטרה

- **בעיה:** דף `/cars` (מבוסס על `publicCars/{carId}`) לא הציג פרטי חצר/מוכר (למשל שם "שרק רכבים") גם כשפרופיל החצר והגדרות ה־Exposure היו נכונים.
- **סיבה:** ה־projection ב־`publicCars` לא התעדכן כשהשתנו:
  - `adminSellerExposure/{yardUid}` (הגדרות אדמין)
  - `users/{yardUid}` (פרופיל חצר)
- **פתרון:** טריגרים שמרעננים את כל ה־`publicCars` של אותו yard/seller בעת שינוי exposure או פרופיל, + אנדפוינט אדמין לריענון ידני.

---

## קבצים שנגעו בהם

| קובץ | שינוי |
|------|--------|
| `functions/src/cars/publicCarSyncTrigger.ts` | טריגרים + פונקציות עזר (chunkArray, runWithConcurrency) |
| `functions/src/cars/publicCarProjectionFunctions.ts` | אנדפוינט `adminReprojectPublicCars` + בדיקת אדמין (token + config) |
| `functions/src/index.ts` | ייצוא הטריגרים והאנדפוינט |
| `firestore.indexes.json` | אינדקס composite ל־`publicCars` (yardUid + isPublished) |
| `functions/src/cars/publicCarProjection.ts` | **לא שונה** (לוגיקת ה־projection נשארה כפי שהייתה) |

---

## 1. טריגר: שינוי Admin Exposure

**נתיב:** `adminSellerExposure/{sellerUid}` — **onWrite** (יצירה / עדכון / מחיקה).

- **מה קורה:** בכל שינוי במסמך (כולל מחיקה — כדי שהשדות הנגזרים יחזרו ל־defaults), מחפשים את כל ה־`publicCars` שבהם `yardUid == sellerUid` ו־`isPublished == true`.
- **עיבוד:** דפים של 500 מסמכים (עם `startAfter`), ואז עיבוד בצ’אנקים של 50 עם עד 5 קריאות מקבילות ל־`upsertPublicCarFromMaster(yardUid, carId)`.
- **שדות שמחושבים כ־"שונו":**  
  `showNameInBadge`, `showLogo`, `showPhone`, `showWhatsapp`, `showCity`, `showAddress`, `sellerType`.
- **לוג:**  
  `sellerUid`, `changedFields`, `matchedCount`, `processedCount`, `errorsCount`, `durationMs`.

---

## 2. טריגר: שינוי פרופיל חצר (Yard Profile)

**נתיב:** `users/{yardUid}` — **onUpdate**.

- **מתי רץ:** רק אם `after.isYard === true` או `after.primaryRole === 'YARD'`.
- **מתי ממשיך:** רק אם לפחות אחד מהשדות הרלוונטיים השתנה, ביניהם:  
  `displayName`, `fullName`, `yardName`, `businessName`, `companyName`, `name`, `phone`, `phoneNumber`, `secondaryPhone`, `contactPhone`, `yardLogoUrl`, `logoUrl`, `city`, `address`, `streetAddress`, `website`, `whatsappServicePhone`, `whatsappPhone`, `whatsapp`, `whatsApp`, `yardWhatsappPhone`, `roleStatus`, `status`, `primaryRole`, `isYard`.
- **שאילתות:**
  - Q1: `publicCars` שבו `yardUid == yardUid` ו־`isPublished == true`
  - Q2: אותו דבר עם `isPublished == null` (מסמכים legacy)
- **עיבוד:** איחוד מזהה ייחודי, צ’אנקים של 50, עד 5 מקביליות. מסמכי legacy עם סטטוס HIDDEN/ARCHIVED/draft מדולגים.
- **לוג:**  
  `yardUid`, `matchedCount`, `processedCount`, `skipped`, `errorsCount`, `durationMs`.

---

## 3. אנדפוינט אדמין: adminReprojectPublicCars

**סוג:** HTTPS Callable (פונקציה נגישה מהקליינט).

**אימות:**
- משתמש מחובר.
- אדמין לפי **אחד** מהבאים:
  - `context.auth.token.admin === true`
  - UID ברשימת `functions.config().admins.uids` (מחרוזת מופרדת בפסיקים או מערך)
  - UID ב־Firestore `config/admins` או custom claim (פונקציית `isAdmin` הקיימת).

**פרמטרים:**
- `yardUid` (חובה) — מזהה החצר/מוכר.
- `carId` (אופציונלי) — אם מועבר, מרעננים רק רכב זה.
- `limit` (אופציונלי, ברירת מחדל 500, מקסימום 2000) — מגבלת מסמכים בשאילתה לפי yard.
- `dryRun` (אופציונלי, ברירת מחדל false) — אם true, אין כתיבה, רק ספירה.

**התנהגות:**
- **עם `carId`:**  
  `effectiveYardUid` = `yardUid` מהבקשה (אם קיים) או `yardUid` מ־`publicCars/{carId}`.  
  אם לא `dryRun`: קוראים `upsertPublicCarFromMaster(effectiveYardUid, carId)`.  
  מחזיר: `{ yardUid: effectiveYardUid, carId, matched: 1, processed, errors, durationMs }`.
- **בלי `carId`:**  
  שאילתה ל־`publicCars` עם `yardUid == yardUid` ו־`limit`.  
  לכל doc: `upsertPublicCarFromMaster(yardUid, doc.id)` עם concurrency 5.  
  מחזיר: `{ yardUid, matched, processed, errors, durationMs }`.

---

## 4. אינדקס Firestore

ב־`firestore.indexes.json` נוסף אינדקס composite:

- **Collection:** `publicCars`
- **שדות:** `yardUid` (ASC), `isPublished` (ASC)

נדרש לשאילתות הטריגרים. שאר האינדקסים הקיימים נשארו ללא שינוי.

---

## 5. פונקציות עזר בטריגרים

ב־`publicCarSyncTrigger.ts`:

- **`chunkArray<T>(items, size)`** — מחלק מערך לצ’אנקים בגודל `size`.
- **`runWithConcurrency<T>(tasks, limit)`** — מריץ משימות אסינכרוניות עם הגבלת מקביליות ומחזיר תוצאות באותו סדר כמו ה־tasks.

---

## פריסה (Deploy) ובדיקה

### פריסה

```bash
# פריסת פונקציות
firebase deploy --only functions

# (אם צריך) פריסת אינדקסים
firebase deploy --only firestore:indexes
```

### ריענון ידני אחרי פריסה

קריאה ל־`adminReprojectPublicCars` עם:

- `yardUid`: `"72HNYgtEdWV0zn19I6H51TSzPEj1"`
- `limit`: `50`

(אותה חצר מהדוגמה — "שרק רכבים".)

### אימות

1. לבדוק שמסמך אחד לפחות ב־`publicCars` של אותה חצר מכיל `yardName` / `sellerDisplayName` ו־`showSellerNameInBadge: true` (כשההגדרות מאפשרות).
2. לפתוח את דף `/cars` ולוודא שה־Badge מציג "שרק רכבים" לרכבים של החצר.

---

## כללים שנשמרו

- **Backend only** — אין שינוי בקוד React/Web או במסכי תפקידים.
- **ללא מחיקה/החלפה** של לוגיקה עובדת; רק שינויים מצומצמים והוספות.
- **ללא שינוי** ב־`publicCarProjection.ts` — ה־projector נשאר כפי שהיה (כולל טעינת exposure ו־defaults).

---

---

## פריסה ובדיקה (Firebase Deploy + Verify)

### 1) אימות פונקציות פרוסות

```bash
cd C:\Rent_a_Car
firebase functions:list
```

לוודא שמופיעות:
- `adminReprojectPublicCars` (callable)
- `onAdminSellerExposureChangeUpdatePublicCars` (document.write)
- `onYardProfileChangeUpdatePublicCars` (document.update)

(נכון למועד הכתיבה — שלוש הפונקציות כבר פרוסות.)

### 2) סיום פריסה (אם נדרש)

אם פריסה מלאה מתנתקת (timeout), לפרוס רק את הפונקציות הרלוונטיות:

```bash
cd C:\Rent_a_Car
firebase deploy --only functions:adminReprojectPublicCars --debug
firebase deploy --only functions:onAdminSellerExposureChangeUpdatePublicCars --debug
firebase deploy --only functions:onYardProfileChangeUpdatePublicCars --debug
```

לפני פריסה: `cd functions && npm ci && npm run build && cd ..`

### 3) פריסת אינדקסים

```bash
firebase deploy --only firestore:indexes
```

(בוצע — "deployed indexes in firestore.indexes.json successfully".)

### 4) ריענון ידני (admin callable)

**סקריפט חד-פעמי:** `functions/tools/reprojectPublicCars.js`

דרוש: טוקן מזהה של משתמש אדמין. בדפדפן (מחובר כאדמין) להריץ בקונסול:

```js
(await firebase.auth().currentUser.getIdToken())
```

להעתיק את הטוקן, ואז (Windows PowerShell):

```powershell
cd C:\Rent_a_Car
$env:ID_TOKEN = "<הדבק-את-הטוקן-כאן>"
node functions/tools/reprojectPublicCars.js
```

אופציונלי: `$env:YARD_UID = "72HNYgtEdWV0zn19I6H51TSzPEj1"`; `$env:LIMIT = "50"` (ברירת מחדל).

הסקריפט מדפיס: `matched`, `processed`, `errors`, `durationMs`.

### 5) אימות נתונים ב-Firestore

ב-Firestore Console: לפתוח אוסף `publicCars`, לבחור מסמך אחד ששייך לחצר (שדה `yardUid` = `72HNYgtEdWV0zn19I6H51TSzPEj1`) ולוודא:

- `yardName` או `sellerDisplayName` מלאים
- `showNameInBadge` / `showSellerNameInBadge` לא `false` כשההגדרות מאפשרות הצגה

### 6) אימות סופי בדף

לפתוח `/cars` בחלון פרטי (או לרענן קשיח) ולוודא שה-Badge מציג "שרק רכבים" לרכבים של החצר.

---

*מסמך זה מכסה את כל מה שבוצע בפרויקט בנושא Re-project publicCars על שינוי Admin Exposure ו־Yard Profile.*
