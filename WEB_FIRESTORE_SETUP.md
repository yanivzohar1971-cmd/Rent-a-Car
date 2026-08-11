# הוראות ליצירת Collection `publicCars` ב-Firestore

## דרך מהירה: Firebase Console (מומלץ)

1. פתח [Firebase Console](https://console.firebase.google.com/)
2. בחר את הפרויקט: **carexpert-94faa**
3. בתפריט השמאלי: לחץ על **Firestore Database**
4. אם זה הפעם הראשונה - לחץ על **Create database**
   - בחר **Start in production mode** (נשנה את ה-rules אחר כך)
   - בחר location: **us-central** או **europe-west** (לפי מה שהכי קרוב)
5. לחץ על **Start collection**
   - **Collection ID**: `publicCars`
   - לחץ **Next**
6. **Document ID**: השאר ריק (auto-generate) או הזן ID כמו `car1`
7. הוסף את השדות הבאים (לחץ **Add field** לכל אחד):

| Field Name | Type | Value |
|------------|------|-------|
| `isActive` | boolean | `true` |
| `manufacturerHe` | string | `טויוטה` |
| `modelHe` | string | `קורולה` |
| `year` | number | `2018` |
| `price` | number | `78000` |
| `km` | number | `82000` |
| `city` | string | `תל אביב` |
| `mainImageUrl` | string | `https://via.placeholder.com/800x450?text=Corolla+2018` |

8. לחץ **Save**

✅ Collection נוצר!

## הוספת עוד רכבים

כדי להוסיף עוד רכבים:
1. ב-Firestore Console, בתוך collection `publicCars`
2. לחץ **Add document**
3. הוסף את אותם שדות עם הנתונים החדשים

## עדכון Firestore Rules (אופציונלי)

אם תרצה לאפשר קריאה ציבורית של `publicCars`:

1. ב-Firestore Console → **Rules**
2. החלף את ה-rules ב:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow public read access to publicCars
    match /publicCars/{document=**} {
      allow read: if true;
      allow write: if false; // Only admins can write (through Firebase Admin SDK)
    }
    
    // Keep other collections private
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

3. לחץ **Publish**

## בדיקה

לאחר יצירת ה-collection, רענן את האתר (`npm run dev`) ובדוק:
- `/cars` - צריך להציג את הרכב מ-Firestore
- `/cars/{id}` - צריך להציג את פרטי הרכב

אם אין נתונים ב-Firestore או יש שגיאה, האתר יעבור אוטומטית ל-MOCK_CARS.

