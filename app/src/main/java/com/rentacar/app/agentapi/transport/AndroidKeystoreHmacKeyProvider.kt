package com.rentacar.app.agentapi.transport

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey

/**
 * AGENT-104: HMAC-SHA256 signing key held in the Android Keystore (alias [KEY_ALIAS]).
 *
 * The key is generated on first use and is non-exportable: only [hmacSha256] results leave the
 * Keystore. Keystore HMAC keys require API 23+; the app's minSdk is 26, so no AES-wrapped
 * fallback is needed. Not exercised by JVM unit tests (needs a device/emulator Keystore);
 * the signing contract is covered through [InMemoryDeviceSigningKeyProvider].
 */
class AndroidKeystoreHmacKeyProvider(
    override val keyId: String = KEY_ALIAS
) : DeviceSigningKeyProvider {

    @Volatile
    private var cachedKey: SecretKey? = null

    override fun hmacSha256(data: ByteArray): ByteArray {
        val mac = Mac.getInstance(MAC_ALGORITHM)
        mac.init(key())
        return mac.doFinal(data)
    }

    /** Removes the key; previously issued tokens can no longer be verified. */
    fun deleteKey() {
        synchronized(this) {
            val store = keyStore()
            if (store.containsAlias(keyId)) store.deleteEntry(keyId)
            cachedKey = null
        }
    }

    private fun key(): SecretKey {
        cachedKey?.let { return it }
        synchronized(this) {
            cachedKey?.let { return it }
            val store = keyStore()
            val existing = store.getKey(keyId, null) as? SecretKey
            val created = existing ?: generate()
            cachedKey = created
            return created
        }
    }

    private fun generate(): SecretKey {
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(keyId, KeyProperties.PURPOSE_SIGN).build()
        )
        return generator.generateKey()
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    companion object {
        const val KEY_ALIAS: String = "rentacar_agent_device_hmac"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val MAC_ALGORITHM = "HmacSHA256"
    }
}
