# Fixing Firebase Auth CONFIGURATION_NOT_FOUND for Rent_a_Car (Android)

If you encounter the following error when trying to sign up with email/password:

```
FirebaseException: An internal error has occurred. [ CONFIGURATION_NOT_FOUND ]
RecaptchaCallWrapper … Initial task failed for action RecaptchaAction(action=signUpPassword)
```

This indicates a Firebase Auth configuration problem. Follow these steps to resolve it.

## 1. Verify Android Package Name

1. Open `app/build.gradle` in the Rent_a_Car project.
2. Check the `applicationId` value (should be `com.rentacar.app`).
3. In Firebase Console:
   - Go to **Project Settings** → **Your apps** → **Android app**.
   - Ensure the **Package name** matches exactly: `com.rentacar.app`.

## 2. Add SHA-1 and SHA-256 Fingerprints (Debug Keystore)

Firebase requires your app's signing certificate fingerprints for reCAPTCHA verification.

### Extract Debug Keystore Fingerprints (Windows)

Run this command in PowerShell or Command Prompt:

```bash
keytool -list -v ^
  -alias androiddebugkey ^
  -keystore "%USERPROFILE%\.android\debug.keystore" ^
  -storepass android ^
  -keypass android
```

### Copy the Fingerprints

Look for these lines in the output:

```
SHA1: XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX
SHA256: XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX
```

### Add to Firebase Console

1. Go to **Firebase Console** → **Project Settings** → **Your apps** → **Android app**.
2. Scroll to **SHA certificate fingerprints**.
3. Click **Add fingerprint**.
4. Paste the **SHA1** value and click **Save**.
5. Click **Add fingerprint** again.
6. Paste the **SHA256** value and click **Save**.

## 3. Download Updated google-services.json

After adding the fingerprints:

1. In Firebase Console → **Project Settings** → **Your apps** → **Android app**.
2. Click **Download google-services.json**.
3. Replace the existing file in your project:
   - Location: `app/google-services.json`
4. **Important**: Rebuild the project after replacing the file.

## 4. Ensure Email/Password Provider is Enabled

1. In Firebase Console, go to **Authentication** → **Sign-in method**.
2. Find **Email/Password** in the list.
3. Ensure it is set to **Enabled**.
4. If disabled, click on it and toggle **Enable**.

## 5. Rebuild & Retry

1. After completing the above steps:
   - Rebuild the project: `.\gradlew.bat assembleDebug` (or via Android Studio).
2. Test signup again.
3. The `CONFIGURATION_NOT_FOUND` error should be resolved.

## Debug Tips

- **Check internet connection**: Ensure the device/emulator has internet access.
- **Verify Firebase project**: Confirm you're using the correct Firebase project:
  - Check `app/google-services.json` → `project_info.project_id` should be `carexpert-94faa`.
  - Verify `applicationId` in `app/build.gradle` matches the Android app package in Firebase Console.
- **Clean build**: If issues persist, try:
  ```bash
  .\gradlew.bat clean
  .\gradlew.bat assembleDebug
  ```

## Additional Notes

- For **release builds**, you'll need to add the release keystore fingerprints using the same process.
- The debug keystore is typically located at `%USERPROFILE%\.android\debug.keystore` on Windows.
- If you're using a custom keystore, replace the keystore path and passwords in the `keytool` command accordingly.

