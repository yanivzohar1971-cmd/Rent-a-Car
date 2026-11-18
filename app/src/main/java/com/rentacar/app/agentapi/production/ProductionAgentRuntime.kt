package com.rentacar.app.agentapi.production

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.rentacar.app.BuildConfig
import com.rentacar.app.agentapi.RentCarAgentAPI
import com.rentacar.app.agentapi.relay.HttpsRelayDeviceClient
import com.rentacar.app.agentapi.relay.RelayDeviceLoop
import com.rentacar.app.agentapi.relay.RelayPairingCrypto
import com.rentacar.app.agentapi.transport.AndroidKeystoreHmacKeyProvider
import com.rentacar.app.agentapi.transport.AuthenticatedAgentGateway
import com.rentacar.app.agentapi.transport.BoundSessionIdentity
import com.rentacar.app.agentapi.transport.DeviceIdentity
import com.rentacar.app.agentapi.transport.DevicePairingService
import com.rentacar.app.agentapi.transport.DevicePresenceTracker
import com.rentacar.app.agentapi.transport.DeviceTokenSigner
import com.rentacar.app.agentapi.transport.EncryptedPrefsDeviceTokenStore
import com.rentacar.app.agentapi.transport.FirebaseTrustedSessionBinder
import com.rentacar.app.agentapi.transport.InMemoryReplayGuard
import com.rentacar.app.agentapi.transport.TokenValidation
import java.security.SecureRandom
import java.util.UUID
import kotlin.concurrent.thread

/** Persisted owner opt-in. Plain prefs: the flag is not secret, and it defaults to OFF. */
class SharedPreferencesAgentAccessSettings(private val prefs: SharedPreferences) : AgentAccessSettings {
    override val enabled: Boolean get() = prefs.getBoolean(KEY_ENABLED, false)
    fun setEnabled(value: Boolean) = prefs.edit().putBoolean(KEY_ENABLED, value).apply()

    companion object {
        const val PREFS_NAME = "rentacar_agent_access"
        const val KEY_ENABLED = "agent_access_enabled_v1"
    }
}

/** Non-secret record of a paired Claude client (the token itself is never stored here or shown). */
data class PairedClientRecord(
    val tokenId: String,
    val clientId: String,
    val createdAtEpochMs: Long,
    val expiresAtEpochMs: Long
)

enum class PairedClientState { ACTIVE, EXPIRED, REVOKED, UNKNOWN }

data class PairedClientView(val record: PairedClientRecord, val state: PairedClientState)

sealed class PairingStartResult {
    data class CodeReady(val displayCode: String, val expiresAtEpochMs: Long) : PairingStartResult()
    data class Failed(val reason: String) : PairingStartResult()
}

/**
 * AGENT-125/127/128: app-level composition of Claude Agent access for NON-AgentDev builds.
 *
 * Nothing here does anything until the owner enables access in "Claude AI — חיבור ושליטה":
 *  - no relay connection, no pairing, no Agent reads while [settings] is disabled;
 *  - identity = the app's live Firebase user via [FirebaseTrustedSessionBinder] (anonymous / signed-out → none);
 *  - device tokens: EncryptedSharedPreferences store + Android Keystore HMAC signer;
 *  - business reads: existing repositories / existing Room DB (RentCarAgentAPI.forAndroidLocalReads), read-only;
 *  - transport: outbound HTTPS long-poll to [BuildConfig.AGENT_RELAY_URL]; empty → relay unavailable
 *    (the production `standard` build ships with no relay until an authorized endpoint exists).
 * Relay polling runs only while the app process is alive; Android may stop it in the background.
 */
class ProductionAgentRuntime private constructor(private val app: Context) {
    val settings = SharedPreferencesAgentAccessSettings(
        app.getSharedPreferences(SharedPreferencesAgentAccessSettings.PREFS_NAME, Context.MODE_PRIVATE)
    )
    private val gson = Gson()
    private val clock: () -> Long = System::currentTimeMillis
    private val binder = FirebaseTrustedSessionBinder()
    private val secure: SharedPreferences by lazy { encryptedPrefs(app) }
    private val tokenStore: EncryptedPrefsDeviceTokenStore by lazy { EncryptedPrefsDeviceTokenStore.create(app) }
    private val pairing: DevicePairingService by lazy {
        DevicePairingService(tokenStore, DeviceTokenSigner(AndroidKeystoreHmacKeyProvider()), clock)
    }
    private val api: RentCarAgentAPI by lazy { RentCarAgentAPI.forAndroidLocalReads(app) }
    private val inner: AuthenticatedAgentGateway by lazy {
        AuthenticatedAgentGateway(pairing, api, InMemoryReplayGuard(clock = clock), DevicePresenceTracker(clock), clock)
    }
    private val lock = Any()
    @Volatile private var loopThread: Thread? = null
    @Volatile var loop: RelayDeviceLoop? = null
        private set

    val relayConfigured: Boolean get() = BuildConfig.AGENT_RELAY_URL.isNotBlank()

    fun isSignedIn(): Boolean = BoundSessionIdentity.fromTrustedBinder(binder) != null

    /** Null whenever access must not be served (disabled, AgentDev, not signed in). */
    fun gateway(): ProductionAgentGateway? =
        ProductionAgentGateway.createOrNull(settings, binder, pairing, api, inner, BuildConfig.AGENT_DEV_MODE)

    fun setEnabled(value: Boolean) {
        settings.setEnabled(value)
        if (value) ensureRelayLoop()
    }

    /** Starts the relay loop once, only when enabled and a relay is configured. Idempotent. */
    fun ensureRelayLoop() {
        if (!settings.enabled || !relayConfigured || BuildConfig.AGENT_DEV_MODE) return
        synchronized(lock) {
            if (loopThread?.isAlive == true) return
            val (deviceId, secret) = relayIdentity()
            val l = RelayDeviceLoop(
                HttpsRelayDeviceClient(BuildConfig.AGENT_RELAY_URL, deviceId, secret),
                gatewayProvider = { gateway() },
                log = { Log.i(TAG, it) }
            )
            loop = l
            loopThread = thread(name = "claude-agent-relay", isDaemon = true) {
                l.run(keepRunning = { settings.enabled })
            }
        }
    }

    /** Creates a device token for a new Claude client and publishes it to the relay sealed under a one-time code. */
    fun startPairing(): PairingStartResult {
        if (!settings.enabled) return PairingStartResult.Failed("יש להפעיל קודם את הגישה")
        if (!relayConfigured) return PairingStartResult.Failed("לא הוגדר שרת ממסר מאושר בגרסה זו")
        val session = BoundSessionIdentity.fromTrustedBinder(binder)
            ?: return PairingStartResult.Failed("יש להתחבר לחשבון Rent a Car")
        val (relayDeviceId, secret) = relayIdentity()
        val clientId = "claude-" + UUID.randomUUID().toString().take(8)
        val paired = pairing.pair(DeviceIdentity(clientId, "Claude client"), session, CLIENT_TOKEN_TTL_MS)
        val code = RelayPairingCrypto.newCode()
        val payload = gson.toJson(
            mapOf(
                "v" to 1,
                "token" to paired.presentedToken,
                "relayDeviceId" to relayDeviceId,
                "tokenId" to paired.token.tokenId,
                "expiresAtEpochMs" to paired.token.expiresAtEpochMs
            )
        )
        val offer = RelayPairingCrypto.seal(code, relayDeviceId, payload, clock())
        val published = try {
            val client = HttpsRelayDeviceClient(BuildConfig.AGENT_RELAY_URL, relayDeviceId, secret)
            client.register() && client.publishPairingOffer(offer)
        } catch (t: Throwable) {
            Log.w(TAG, "pairing offer publish failed: ${t.javaClass.simpleName}")
            false
        }
        if (!published) {
            pairing.revoke(paired.token.tokenId)
            return PairingStartResult.Failed("שרת הממסר אינו זמין")
        }
        saveClient(PairedClientRecord(paired.token.tokenId, clientId, clock(), paired.token.expiresAtEpochMs))
        ensureRelayLoop()
        return PairingStartResult.CodeReady(RelayPairingCrypto.display(code), offer.expiresAtEpochMs)
    }

    fun pairedClients(): List<PairedClientView> = loadClients().map { rec ->
        val t = tokenStore.get(rec.tokenId)
        val state = when {
            t == null -> PairedClientState.UNKNOWN
            t.revoked -> PairedClientState.REVOKED
            t.isExpired(clock()) -> PairedClientState.EXPIRED
            else -> PairedClientState.ACTIVE
        }
        PairedClientView(rec, state)
    }

    fun revoke(tokenId: String): Boolean = pairing.revoke(tokenId)

    private fun relayIdentity(): Pair<String, String> = synchronized(lock) {
        val id = secure.getString(KEY_RELAY_DEVICE_ID, null)
        val secret = secure.getString(KEY_RELAY_SECRET, null)
        if (id != null && secret != null) return id to secret
        val newId = UUID.randomUUID().toString()
        val bytes = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val newSecret = bytes.joinToString("") { "%02x".format(it) }
        secure.edit().putString(KEY_RELAY_DEVICE_ID, newId).putString(KEY_RELAY_SECRET, newSecret).apply()
        newId to newSecret
    }

    private fun loadClients(): List<PairedClientRecord> {
        val json = secure.getString(KEY_CLIENTS, null) ?: return emptyList()
        return try {
            gson.fromJson(json, object : TypeToken<List<PairedClientRecord>>() {}.type)
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun saveClient(rec: PairedClientRecord) = synchronized(lock) {
        val all = (loadClients() + rec).takeLast(MAX_CLIENTS)
        secure.edit().putString(KEY_CLIENTS, gson.toJson(all)).apply()
    }

    /** True when a presented token is currently valid (used by diagnostics only; never logs it). */
    fun isTokenValid(presented: String?): Boolean = pairing.validate(presented) is TokenValidation.Valid

    companion object {
        private const val TAG = "ClaudeAgent"
        private const val SECURE_PREFS = "rentacar_agent_relay"
        private const val KEY_RELAY_DEVICE_ID = "relay_device_id"
        private const val KEY_RELAY_SECRET = "relay_device_secret"
        private const val KEY_CLIENTS = "paired_clients_v1"
        private const val MAX_CLIENTS = 20
        const val CLIENT_TOKEN_TTL_MS: Long = DevicePairingService.MAX_TTL_MS

        @Volatile private var instance: ProductionAgentRuntime? = null

        /** Returns null in AgentDev builds (they use AgentDevBootstrap instead). */
        fun get(context: Context): ProductionAgentRuntime? {
            if (BuildConfig.AGENT_DEV_MODE) return null
            return instance ?: synchronized(this) {
                instance ?: ProductionAgentRuntime(context.applicationContext).also { instance = it }
            }
        }

        private fun encryptedPrefs(app: Context): SharedPreferences {
            val masterKey = MasterKey.Builder(app).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
            return EncryptedSharedPreferences.create(
                app, SECURE_PREFS, masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        }
    }
}
