# פתרון סופי: 403 + CORS ב-syncVehicleByPlate (Gen1 IAM Invoker)

**מטרה:** להפסיק 403 ו-"No Access-Control-Allow-Origin" כאשר קוראים ל-  
`https://us-central1-carexpert-94faa.cloudfunctions.net/syncVehicleByPlate`  
מהדומיין `https://www.carexperts4u.com`.

**שורש הבעיה:** הבקשה נחסמת ב-IAM (invoker) לפני שהקוד רץ, ולכן CORS מהקוד לא נשלח. פתרון: `allUsers` כ-invoker ב-Gen1. האבטחה נשמרת ע"י `Authorization: Bearer` בתוך הקוד.

---

## 1) אימות שהפונקציה Gen1 קיימת ✅

הורץ `firebase functions:list`. תוצאה רלוונטית:

| Function           | Version | Trigger | Location    |
|--------------------|---------|---------|-------------|
| syncVehicleByPlate  | **v1**  | **https** | **us-central1** |

כלומר: Gen1, region us-central1 — מאומת.

---

## 2) ביצוע IAM binding (ב-Cloud Shell)

פתח [Google Cloud Shell](https://console.cloud.google.com/cloudshell), ואז:

```bash
gcloud config set project carexpert-94faa
```

```bash
gcloud functions add-iam-policy-binding syncVehicleByPlate \
  --region=us-central1 \
  --member="allUsers" \
  --role="roles/cloudfunctions.invoker"
```

---

## 3) אימות שה-binding נקלט

```bash
gcloud functions get-iam-policy syncVehicleByPlate \
  --region=us-central1 \
  --format=json
```

**פלט مطلوب:** בתוך `bindings` חייב להופיע:

```json
{
  "role": "roles/cloudfunctions.invoker",
  "members": [
    "allUsers"
  ]
}
```

(ייתכנו גם roles אחרים עם members אחרים — העיקר ש-`roles/cloudfunctions.invoker` כולל `allUsers`.)

---

## 4) בדיקת Preflight (הוכחה)

ב-Cloud Shell:

```bash
curl -i -X OPTIONS \
  -H "Origin: https://www.carexperts4u.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  "https://us-central1-carexpert-94faa.cloudfunctions.net/syncVehicleByPlate"
```

**חייב להיות:**
- **HTTP 204** (או 200)
- כותרת: **`Access-Control-Allow-Origin: https://www.carexperts4u.com`**

דוגמת תגובה:

```
HTTP/2 204
access-control-allow-origin: https://www.carexperts4u.com
...
```

---

## 5) בדיקה בדפדפן

באתר:  
`https://www.carexperts4u.com/yard/fleet?v=iamfix1`

ב-DevTools → Network:
- **OPTIONS** מצליח עם `Access-Control-Allow-Origin`.
- **POST** לא נחסם ע"י CORS (גם אם מחזיר 401/403 לוגי בגלל טוקן).

---

## סקריפט מוכן (אופציונלי)

במקום להריץ את הפקודות ידנית, אפשר ב-Cloud Shell מהמאגר:

```bash
# אחרי clone / cd לפרויקט
bash scripts/fix-syncVehicleByPlate-403-iam-and-verify.sh
```

הסקריפט מבצע את שלבים 2–4 ומדפיס את הפלטים.

---

## הגבלות (ללא שינוי)

- לא שינויי קוד.
- לא שינוי לוגיקת סנכרון.
- לא `Origin=*` — רק allowlist בדומיין (כבר בקוד).

---

## פלט مطلוב לסיום

1. **צילום/פלט** של `get-iam-policy` שמראה `allUsers` תחת `roles/cloudfunctions.invoker`.
2. **תוצאת curl OPTIONS** עם כותרת `Access-Control-Allow-Origin: https://www.carexperts4u.com`.
