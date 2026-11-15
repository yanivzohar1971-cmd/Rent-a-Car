package com.rentacar.app.agentapi.transport

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.gson.Gson

/**
 * AGENT-104: [DeviceTokenStore] whose records survive process restart. Same contract as
 * [DeviceTokenStore]; adds [clear] and [size].
 */
interface PersistentDeviceTokenStore : DeviceTokenStore {
    fun clear()
    fun size(): Int
}

/** Minimal string key/value surface so the encrypted store is testable on the JVM. */
interface SecureStringStore {
    fun get(key: String): String?
    fun put(key: String, value: String)
    fun remove(key: String)
    fun keys(): Set<String>
    fun clear()
}

/** [SecureStringStore] over a (normally encrypted) [SharedPreferences]; writes use commit(). */
class SharedPreferencesSecureStringStore(private val prefs: SharedPreferences) : SecureStringStore {
    override fun get(key: String): String? = prefs.getString(key, null)

    override fun put(key: String, value: String) {
        check(prefs.edit().putString(key, value).commit()) { "device_token_store_write_failed" }
    }

    override fun remove(key: String) {
        prefs.edit().remove(key).commit()
    }

    override fun keys(): Set<String> = prefs.all.keys.toSet()

    override fun clear() {
        prefs.edit().clear().commit()
    }
}

/**
 * Serialized form of a [DeviceAccessToken]. Contains no raw signing key. Restoring a record
 * re-creates the session through [BoundSessionIdentity.fromTrustedBinder]; any tampering with
 * the stored fields is still caught by the HMAC check in [DeviceTokenSigner].
 */
object DeviceTokenRecordCodec {
    private data class Stored(
        val tokenId: String,
        val deviceId: String,
        val userUid: String,
        val permissions: List<String>,
        val issuedAtEpochMs: Long,
        val expiresAtEpochMs: Long,
        val signature: String,
        val revoked: Boolean
    )

    private val gson = Gson()

    fun encode(token: DeviceAccessToken): String = gson.toJson(
        Stored(
            tokenId = token.tokenId,
            deviceId = token.deviceId,
            userUid = token.session.userUid,
            permissions = token.session.permissions.sorted(),
            issuedAtEpochMs = token.issuedAtEpochMs,
            expiresAtEpochMs = token.expiresAtEpochMs,
            signature = token.signature,
            revoked = token.revoked
        )
    )

    /** Returns null when the record is malformed or has no valid session. */
    fun decode(json: String): DeviceAccessToken? = try {
        val s = gson.fromJson(json, Stored::class.java)
        val session = BoundSessionIdentity.fromTrustedBinder {
            VerifiedSessionClaims(s.userUid, s.permissions.toSet())
        }
        if (session == null || s.tokenId.isNullOrEmpty() || s.deviceId.isNullOrEmpty() || s.signature.isNullOrEmpty()) {
            null
        } else {
            DeviceAccessToken(
                tokenId = s.tokenId,
                deviceId = s.deviceId,
                session = session,
                issuedAtEpochMs = s.issuedAtEpochMs,
                expiresAtEpochMs = s.expiresAtEpochMs,
                signature = s.signature,
                revoked = s.revoked
            )
        }
    } catch (_: Exception) {
        null
    }
}

/**
 * Persists device tokens in a [SecureStringStore]. In the app, [create] backs it with
 * EncryptedSharedPreferences (AES256-GCM values, AES256-SIV keys, Keystore master key) via
 * androidx.security-crypto, which is already a dependency of the app module.
 */
class EncryptedPrefsDeviceTokenStore(
    private val store: SecureStringStore
) : PersistentDeviceTokenStore {
    private val lock = Any()

    override fun put(token: DeviceAccessToken) = synchronized(lock) {
        store.put(storageKey(token.tokenId), DeviceTokenRecordCodec.encode(token))
    }

    override fun get(tokenId: String): DeviceAccessToken? = synchronized(lock) {
        store.get(storageKey(tokenId))?.let(DeviceTokenRecordCodec::decode)
    }

    override fun revoke(tokenId: String): Boolean = synchronized(lock) {
        val existing = get(tokenId) ?: return false
        store.put(storageKey(tokenId), DeviceTokenRecordCodec.encode(existing.copy(revoked = true)))
        true
    }

    override fun clear() = synchronized(lock) { store.clear() }

    override fun size(): Int = synchronized(lock) { store.keys().count { it.startsWith(KEY_PREFIX) } }

    private fun storageKey(tokenId: String) = KEY_PREFIX + tokenId

    companion object {
        private const val KEY_PREFIX = "device_token_"
        const val PREFS_NAME: String = "rentacar_agent_device_tokens"

        fun create(context: Context): EncryptedPrefsDeviceTokenStore {
            val app = context.applicationContext
            val masterKey = MasterKey.Builder(app)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            val prefs = EncryptedSharedPreferences.create(
                app,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
            return EncryptedPrefsDeviceTokenStore(SharedPreferencesSecureStringStore(prefs))
        }
    }
}
