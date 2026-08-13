package com.rentacar.app.mailbox

import android.content.Context
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Stores Gmail mailbox credentials in EncryptedSharedPreferences.
 * Never writes the App Password to Room, plain prefs, logs, or debug exports.
 */
class SecureMailboxCredentialsStore(context: Context) {

    private val appContext = context.applicationContext

    private val prefs by lazy {
        val masterKey = MasterKey.Builder(appContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            appContext,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun save(credentials: MailboxCredentials) {
        require(credentials.emailAddress.isNotBlank()) { "email required" }
        require(credentials.appPassword.isNotBlank()) { "app password required" }
        prefs.edit()
            .putString(KEY_EMAIL, credentials.emailAddress.trim())
            .putString(KEY_APP_PASSWORD, credentials.appPassword)
            .apply()
        Log.i(TAG, "Mailbox credentials saved for ${credentials.emailAddress}")
    }

    fun load(): MailboxCredentials? {
        val email = prefs.getString(KEY_EMAIL, null)?.trim().orEmpty()
        val password = prefs.getString(KEY_APP_PASSWORD, null).orEmpty()
        if (email.isBlank() || password.isBlank()) return null
        return MailboxCredentials(emailAddress = email, appPassword = password)
    }

    fun hasCredentials(): Boolean = load() != null

    fun clear() {
        prefs.edit().clear().apply()
        Log.i(TAG, "Mailbox credentials cleared")
    }

    /** Sanitized snapshot for diagnostics / debug export — never includes the password. */
    fun diagnosticsSnapshot(): Map<String, Any?> {
        val email = prefs.getString(KEY_EMAIL, null)
        return mapOf(
            "configured" to (!email.isNullOrBlank() && !prefs.getString(KEY_APP_PASSWORD, null).isNullOrBlank()),
            "emailAddress" to email,
            "appPassword" to if (prefs.contains(KEY_APP_PASSWORD)) "********" else null,
            "provider" to MailboxProvider.GMAIL_IMAP.name
        )
    }

    companion object {
        private const val TAG = "MailboxCredStore"
        private const val PREFS_NAME = "secure_mailbox_credentials"
        private const val KEY_EMAIL = "gmail_address"
        private const val KEY_APP_PASSWORD = "gmail_app_password"
    }
}
