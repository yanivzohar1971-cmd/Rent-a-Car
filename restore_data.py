#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Quick restore script - pushes backup file and triggers restore via adb
"""
import subprocess
import time
import json

print("🔄 מתחיל שחזור נתונים...")
print()

# Check backup file
print("1️⃣ בודק קובץ גיבוי...")
with open('backup_29_09.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
    
tables = data.get('tables', {})
print(f"   ✅ נמצא גיבוי עם {len(tables)} טבלאות")
print(f"   📊 לקוחות: {len(tables.get('customers', []))}")
print(f"   📊 ספקים: {len(tables.get('suppliers', []))}")  
print(f"   📊 הזמנות: {len(tables.get('reservations', []))}")
print(f"   📊 תשלומים: {len(tables.get('payments', []))}")
print()

# Push to device
print("2️⃣ מעלה קובץ לטלפון...")
result = subprocess.run(
    ['adb', 'push', 'backup_29_09.json', '/sdcard/Download/MyApp/restore.json'],
    capture_output=True, text=True
)
if result.returncode == 0:
    print("   ✅ הקובץ הועלה בהצלחה")
else:
    print(f"   ❌ שגיאה: {result.stderr}")
    exit(1)

print()
print("✅ הכל מוכן!")
print()
print("📱 עכשיו בטלפון:")
print("   1. פתח את האפליקציה Rent_a_Car")
print("   2. לחץ על הגדרות (⚙️)")
print("   3. גלול למטה עד 'שחזור מגיבוי'")
print("   4. בחר את הקובץ: restore.json")
print("   5. לחץ 'שחזר'")
print()
print("או - עדיף: השתמש בקובץ .ICE מהיום אם יש לך!")

