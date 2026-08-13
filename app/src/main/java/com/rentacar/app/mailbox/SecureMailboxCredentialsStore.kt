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
        val normalized = credentials.normalized()
        require(normalized.emailAddress.isNotBlank()) { "email required" }
        require(normalized.appPassword.isNotBlank()) { "app password required" }
        // commit() so values are durable before the settings dialog closes / import starts
        val ok = prefs.edit()
            .putString(KEY_EMAIL, normalized.emailAddress)
            .putString(KEY_APP_PASSWORD, normalized.appPassword)
            .commit()
        if (!ok) {
            Log.e(TAG, "Failed to persist mailbox credentials")
            error("credential_store_write_failed")
        }
        Log.i(TAG, "Mailbox credentials saved for ${normalized.emailAddress} (passwordLen=${normalized.appPassword.length})")
    }

    fun load(): MailboxCredentials? {
        return try {
            val email = prefs.getString(KEY_EMAIL, null)?.trim().orEmpty()
            val password = MailboxCredentials.normalizeAppPassword(
                prefs.getString(KEY_APP_PASSWORD, null).orEmpty()
            )
            if (email.isBlank() || password.isBlank()) return null
            MailboxCredentials(emailAddress = email, appPassword = password)
        } catch (e: Exception) {
            Log.e(TAG, "credential load failed: ${e.javaClass.simpleName}")
            throw e
        }
    }

    fun hasCredentials(): Boolean = try {
        load() != null
    } catch (_: Exception) {
        false
    }

    fun clear() {
        prefs.edit().clear().commit()
        Log.i(TAG, "Mailbox credentials cleared")
    }

    /** Sanitized snapshot for diagnostics / debug export — never includes the password. */
    fun diagnosticsSnapshot(): Map<String, Any?> {
        return try {
            val email = prefs.getString(KEY_EMAIL, null)
            val passwordLen = MailboxCredentials.normalizeAppPassword(
                prefs.getString(KEY_APP_PASSWORD, null).orEmpty()
            ).length
            mapOf(
                "configured" to (!email.isNullOrBlank() && passwordLen > 0),
                "emailAddress" to email,
                "appPasswordPresent" to (passwordLen > 0),
                "appPasswordLength" to passwordLen,
                "provider" to MailboxProvider.GMAIL_IMAP.name
            )
        } catch (e: Exception) {
            mapOf(
                "configured" to false,
                "loadErrorClass" to e.javaClass.simpleName
            )
        }
    }

    companion object {
        private const val TAG = "RentCarEmailImport"
        private const val PREFS_NAME = "secure_mailbox_credentials"
        private const val KEY_EMAIL = "gmail_address"
        private const val KEY_APP_PASSWORD = "gmail_app_password"
    }
}
