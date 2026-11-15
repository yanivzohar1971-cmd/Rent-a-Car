package com.rentacar.app.agentdev

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.rentacar.app.BuildConfig
import kotlin.concurrent.thread

/**
 * AGENT-101 (AgentDev only). Optional `com.rentacar.app.agentdev.SEED` broadcast.
 * Registered only in the agentdev manifest overlay; process start already seeds via `App.onCreate`.
 *
 * `adb shell am broadcast -a com.rentacar.app.agentdev.SEED -n com.rentacar.app.agentdev/com.rentacar.app.agentdev.AgentDevCommandReceiver --ez force true`
 */
class AgentDevCommandReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (!BuildConfig.AGENT_DEV_MODE || intent.action != AgentDevBootstrap.ACTION_SEED) return
        val pending = goAsync()
        val force = intent.getBooleanExtra("force", false)
        thread(name = "agentdev-seed", isDaemon = true) {
            try {
                val wrote = AgentDevBootstrap.seedNow(context, force)
                Log.i(AgentDevBootstrap.TAG, "SEED broadcast handled (force=$force, wrote=$wrote)")
            } catch (t: Throwable) {
                Log.e(AgentDevBootstrap.TAG, "SEED broadcast failed", t)
            } finally {
                pending.finish()
            }
        }
    }
}
