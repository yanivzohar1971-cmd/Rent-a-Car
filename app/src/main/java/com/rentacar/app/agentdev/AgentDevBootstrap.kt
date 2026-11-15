package com.rentacar.app.agentdev

import android.content.Context
import android.util.Log
import com.rentacar.app.BuildConfig
import com.rentacar.app.agentapi.RentCarAgentAPI
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File
import kotlin.concurrent.thread

/**
 * AGENT-101 (AgentDev only). Called from `App.onCreate` when `BuildConfig.AGENT_DEV_MODE`.
 *
 * Sequence (all on a background thread, never blocking app start):
 *  1. seed offline fixtures into Room for the fixed dev uid,
 *  2. start the loopback HTTP gateway on 127.0.0.1:[BuildConfig.AGENT_DEV_PORT],
 *  3. auto-pair once, write the token to `filesDir/agentdev_token.txt` (and the app-specific
 *     external files dir) and log it for `adb logcat` / `adb pull`.
 *
 * No Firebase, no WorkManager, no production sync is touched.
 */
object AgentDevBootstrap {
    const val TAG = "AgentDev"
    const val ACTION_SEED = "com.rentacar.app.agentdev.SEED"
    const val TOKEN_FILE_NAME = "agentdev_token.txt"
    const val TOKEN_LOG_PREFIX = "AGENTDEV_TOKEN="

    private val statusFlow = MutableStateFlow("Starting…")
    val status: StateFlow<String> = statusFlow

    private val lock = Any()
    private var started = false
    private var server: AgentDevLoopbackServer? = null
    @Volatile private var runtime: AgentDevGatewayRuntime? = null

    fun start(context: Context) {
        if (!BuildConfig.AGENT_DEV_MODE) return
        val app = context.applicationContext
        synchronized(lock) {
            if (started) return
            started = true
        }
        thread(name = "agentdev-bootstrap", isDaemon = true) {
            try {
                statusFlow.value = "Seeding fixtures…"
                AgentDevFixtureSeeder.seedIfNeeded(app)

                val rt = AgentDevGatewayRuntime(
                    api = RentCarAgentAPI.forAndroidLocalReads(app),
                    devUid = BuildConfig.AGENT_DEV_UID,
                    pairingSecret = BuildConfig.AGENT_DEV_PAIRING_SECRET,
                    agentDevMode = BuildConfig.AGENT_DEV_MODE
                )
                runtime = rt
                server = AgentDevLoopbackServer(rt.router, BuildConfig.AGENT_DEV_PORT).start()

                val paired = rt.autoPair()
                writeToken(app, paired.presentedToken)
                Log.i(TAG, "Gateway listening on ${AgentDevLoopbackServer.HOST}:${BuildConfig.AGENT_DEV_PORT} uid=${BuildConfig.AGENT_DEV_UID}")
                Log.i(TAG, "$TOKEN_LOG_PREFIX${paired.presentedToken}")
                statusFlow.value =
                    "Gateway listening on ${AgentDevLoopbackServer.HOST}:${BuildConfig.AGENT_DEV_PORT}"
            } catch (t: Throwable) {
                Log.e(TAG, "AgentDev bootstrap failed", t)
                statusFlow.value = "Bootstrap failed: ${t.javaClass.simpleName}: ${t.message}"
                synchronized(lock) { started = false }
            }
        }
    }

    /** Handles the optional `com.rentacar.app.agentdev.SEED` broadcast. */
    fun seedNow(context: Context, force: Boolean): Boolean {
        check(BuildConfig.AGENT_DEV_MODE)
        return AgentDevFixtureSeeder.seedIfNeeded(context, force)
    }

    private fun writeToken(context: Context, token: String) {
        File(context.filesDir, TOKEN_FILE_NAME).writeText(token)
        // App-specific external dir is readable by `adb pull` without run-as on most images.
        runCatching {
            context.getExternalFilesDir(null)?.let { File(it, TOKEN_FILE_NAME).writeText(token) }
        }.onFailure { Log.w(TAG, "Could not write external token copy: ${it.message}") }
    }
}
