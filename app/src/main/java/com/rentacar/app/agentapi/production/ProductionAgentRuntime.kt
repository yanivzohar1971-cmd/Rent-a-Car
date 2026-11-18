package com.rentacar.app.agentapi.production

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.rentacar.app.BuildConfig
import com.rentacar.app.agentapi.RentCarAgentAPI
import com.rentacar.app.agentapi.relay.ClientChannel
import com.rentacar.app.agentapi.relay.HttpsRelayDeviceClient
import com.rentacar.app.agentapi.relay.RelayConnectionState
import com.rentacar.app.agentapi.relay.RelayDeviceLoop
import com.rentacar.app.agentapi.relay.RelayE2E
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
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.UUID
import kotlin.concurrent.thread

/** Persisted owner opt-in. Plain prefs: the flag is not secret, and it defaults to OFF. */
class SharedPreferencesAgentAccessSettings(private val prefs: SharedPreferences) : AgentAccessSettings {
    override val enabled: Boolean get() = prefs.getBoolean(KEY_ENABLED, false)
    fun setEnabled(value: Boolean) = prefs.edit().putBoolean(KEY_ENABLED, value).commit()

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

/** How the phone is currently able to answer (AGENT-137). */
enum class BackgroundMode { OFF, FOREGROUND_SERVICE, APP_PROCESS_ONLY }

/** E2E channel as persisted (encrypted prefs). */
private data class StoredChannel(val clientId: String, val tokenId: String, val keyB64: String, val secretHashHex: String)

/**
 * AGENT-125/127/128/137/138: app-level composition of Claude Agent access for NON-AgentDev builds.
 *
 * Nothing here does anything until the owner enables access in "Claude AI — חיבור ושליטה":
 *  - identity = the app's live Firebase user ([FirebaseTrustedSessionBinder]); sign-out → nothing served;
 *  - device tokens: EncryptedSharedPreferences store + Android Keystore HMAC signer;
 *  - per-client E2E channel keys + relay client credentials (hash only at the relay);
 *  - reads: existing repositories / existing Room DB, read-only ([ProductionAgentGateway]);
 *  - transport: outbound HTTPS long-poll to [BuildConfig.AGENT_RELAY_URL]; empty → no relay
 *    (the `standard` build ships with none until an owner-authorized endpoint exists);
 *  - background: [AgentRelayService] foreground service (type specialUse) with a visible
 *    notification; falls back to "only while the app process lives" when Android refuses it.
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
    @Volatile var serviceActive: Boolean = false
        internal set

    val relayConfigured: Boolean get() = BuildConfig.AGENT_RELAY_URL.isNotBlank()

    val backgroundMode: BackgroundMode
        get() = when {
            !settings.enabled || !relayConfigured -> BackgroundMode.OFF
            serviceActive -> BackgroundMode.FOREGROUND_SERVICE
            else -> BackgroundMode.APP_PROCESS_ONLY
        }

    val connectionState: RelayConnectionState get() = loop?.state ?: RelayConnectionState.STOPPED

    fun isSignedIn(): Boolean = BoundSessionIdentity.fromTrustedBinder(binder) != null

    /** Null whenever access must not be served (disabled, AgentDev, not signed in). */
    fun gateway(): ProductionAgentGateway? {
        // Cheap checks first: never initialize Keystore / encrypted prefs / Room for a disabled or signed-out app.
        if (!settings.enabled || BuildConfig.AGENT_DEV_MODE || !isSignedIn()) return null
        return ProductionAgentGateway.createOrNull(settings, binder, pairing, api, inner, BuildConfig.AGENT_DEV_MODE)
    }

    /** Owner toggle. Enabling starts background connectivity; disabling stops it immediately. */
    fun setEnabled(value: Boolean) {
        settings.setEnabled(value)
        if (value) startBackground() else {
            app.stopService(Intent(app, AgentRelayService::class.java))
            loop?.wake()
        }
    }

    /**
     * Starts the foreground service when Android allows it (visible app, boot, notification action);
     * otherwise keeps the in-process loop. Never bypasses background-start restrictions.
     */
    fun startBackground() {
        if (!settings.enabled || !relayConfigured || BuildConfig.AGENT_DEV_MODE) return
        try {
            ContextCompat.startForegroundService(app, Intent(app, AgentRelayService::class.java))
        } catch (t: Throwable) {
            // e.g. ForegroundServiceStartNotAllowedException when the app is in the background.
            Log.i(TAG, "foreground service not allowed now (${t.javaClass.simpleName}); app-process mode")
            ensureRelayLoop()
        }
    }

    /** Starts the relay loop once (idempotent). Runs while access stays enabled. */
    fun ensureRelayLoop() {
        if (!settings.enabled || !relayConfigured || BuildConfig.AGENT_DEV_MODE) return
        synchronized(lock) {
            if (loopThread?.isAlive == true) return
            val (deviceId, secret) = relayIdentity()
            val l = RelayDeviceLoop(
                HttpsRelayDeviceClient(BuildConfig.AGENT_RELAY_URL, deviceId, secret),
                gatewayProvider = { gateway() },
                channels = { activeChannels() },
                deviceId = deviceId,
                log = { Log.i(TAG, it) }
            )
            loop = l
            loopThread = thread(name = "claude-agent-relay", isDaemon = true) {
                l.run(keepRunning = { settings.enabled })
            }
        }
    }

    /** Network restored / owner action: cut any pending backoff short. */
    fun wake() = loop?.wake()

    /** Creates a client (token + E2E channel + relay credential) and publishes it sealed under a one-time code. */
    fun startPairing(): PairingStartResult {
        if (!settings.enabled) return PairingStartResult.Failed("יש להפעיל קודם את הגישה")
        if (!relayConfigured) return PairingStartResult.Failed("לא הוגדר שרת ממסר מאושר בגרסה זו")
        val session = BoundSessionIdentity.fromTrustedBinder(binder)
            ?: return PairingStartResult.Failed("יש להתחבר לחשבון Rent a Car")
        val (relayDeviceId, secret) = relayIdentity()
        val clientId = "claude-" + UUID.randomUUID().toString().take(8)
        val channelKey = RelayE2E.newChannelKey()
        val clientSecret = hex(ByteArray(32).also { SecureRandom().nextBytes(it) })
        val clientSecretHash = hex(MessageDigest.getInstance("SHA-256").digest(clientSecret.toByteArray()))
        val paired = pairing.pair(DeviceIdentity(clientId, "Claude client"), session, CLIENT_TOKEN_TTL_MS)
        val code = RelayPairingCrypto.newCode()
        val payload = gson.toJson(
            mapOf(
                "v" to 2,
                "token" to paired.presentedToken,
                "relayDeviceId" to relayDeviceId,
                "tokenId" to paired.token.tokenId,
                "expiresAtEpochMs" to paired.token.expiresAtEpochMs,
                "clientId" to clientId,
                "clientSecret" to clientSecret,
                "channelKeyB64" to Base64.getEncoder().encodeToString(channelKey)
            )
        )
        val offer = RelayPairingCrypto.seal(code, relayDeviceId, payload, clock())
        saveChannel(StoredChannel(clientId, paired.token.tokenId, Base64.getEncoder().encodeToString(channelKey), clientSecretHash))
        val published = try {
            val client = HttpsRelayDeviceClient(BuildConfig.AGENT_RELAY_URL, relayDeviceId, secret)
            client.register(activeChannels().map { it.clientId to it.secretHashHex }) &&
                client.publishPairingOffer(offer, clientId, clientSecretHash)
        } catch (t: Throwable) {
            Log.w(TAG, "pairing offer publish failed: ${t.javaClass.simpleName}")
            false
        }
        if (!published) {
            pairing.revoke(paired.token.tokenId)
            removeChannel(clientId)
            return PairingStartResult.Failed("שרת הממסר אינו זמין")
        }
        saveClient(PairedClientRecord(paired.token.tokenId, clientId, clock(), paired.token.expiresAtEpochMs))
        loop?.clientsDirty = true
        startBackground()
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

    /** Revokes the token on the phone (authoritative, immediate) and removes the client at the relay (best effort). */
    fun revoke(tokenId: String): Boolean {
        val ok = pairing.revoke(tokenId)
        val ch = loadChannels().firstOrNull { it.tokenId == tokenId }
        if (ch != null) {
            removeChannel(ch.clientId)
            loop?.clientsDirty = true
            thread(name = "claude-agent-revoke", isDaemon = true) {
                try {
                    val (id, secret) = relayIdentity()
                    HttpsRelayDeviceClient(BuildConfig.AGENT_RELAY_URL, id, secret).removeClient(ch.clientId)
                } catch (_: Throwable) {
                }
            }
        }
        return ok
    }

    private fun activeChannels(): List<ClientChannel> = loadChannels()
        .filter { ch -> tokenStore.get(ch.tokenId)?.let { !it.revoked && !it.isExpired(clock()) } == true }
        .map { ClientChannel(it.clientId, Base64.getDecoder().decode(it.keyB64), it.secretHashHex) }

    private fun relayIdentity(): Pair<String, String> = synchronized(lock) {
        val id = secure.getString(KEY_RELAY_DEVICE_ID, null)
        val secret = secure.getString(KEY_RELAY_SECRET, null)
        if (id != null && secret != null) return id to secret
        val newId = UUID.randomUUID().toString()
        val newSecret = hex(ByteArray(32).also { SecureRandom().nextBytes(it) })
        secure.edit().putString(KEY_RELAY_DEVICE_ID, newId).putString(KEY_RELAY_SECRET, newSecret).commit()
        newId to newSecret
    }

    private inline fun <reified T> loadList(key: String): List<T> {
        val json = secure.getString(key, null) ?: return emptyList()
        return try {
            gson.fromJson(json, TypeToken.getParameterized(List::class.java, T::class.java).type)
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun loadClients(): List<PairedClientRecord> = loadList(KEY_CLIENTS)
    private fun loadChannels(): List<StoredChannel> = loadList(KEY_CHANNELS)

    private fun saveClient(rec: PairedClientRecord) = synchronized(lock) {
        secure.edit().putString(KEY_CLIENTS, gson.toJson((loadClients() + rec).takeLast(MAX_CLIENTS))).commit()
    }

    private fun saveChannel(ch: StoredChannel) = synchronized(lock) {
        secure.edit().putString(KEY_CHANNELS, gson.toJson((loadChannels().filter { it.clientId != ch.clientId } + ch).takeLast(MAX_CLIENTS))).commit()
    }

    private fun removeChannel(clientId: String) = synchronized(lock) {
        secure.edit().putString(KEY_CHANNELS, gson.toJson(loadChannels().filter { it.clientId != clientId })).commit()
    }

    private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }

    companion object {
        private const val TAG = "ClaudeAgent"
        private const val SECURE_PREFS = "rentacar_agent_relay"
        private const val KEY_RELAY_DEVICE_ID = "relay_device_id"
        private const val KEY_RELAY_SECRET = "relay_device_secret"
        private const val KEY_CLIENTS = "paired_clients_v1"
        private const val KEY_CHANNELS = "client_channels_v1"
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
