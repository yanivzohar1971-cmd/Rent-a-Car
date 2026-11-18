package com.rentacar.app.agentstage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.rentacar.app.agentapi.production.ProductionAgentRuntime
import com.rentacar.app.agentdev.AgentDevFixtureData
import com.rentacar.app.agentdev.AgentDevFixtureSeeder
import com.rentacar.app.data.auth.AuthProvider
import com.rentacar.app.di.DatabaseModule
import kotlinx.coroutines.runBlocking
import kotlin.concurrent.thread

/**
 * agentstage-only test automation (emulator). Requires android.permission.DUMP (adb shell only).
 *
 *  SIGN_IN  --es email <test account> --es password <test password>
 *           Signs in through the app's normal FirebaseAuth instance, which agentstage routes to the
 *           local Auth emulator (demo project). Exercises the real FirebaseTrustedSessionBinder.
 *  SEED     Upserts the synthetic AgentDev fixture rows for the CURRENTLY signed-in uid.
 *  STATUS   Logs non-secret Agent status (enabled / signed in / relay / clients).
 *
 * It cannot enable Agent access or create pairings: those stay owner actions in the UI.
 */
class AgentStageCommandReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        val app = context.applicationContext
        thread(name = "agentstage-command") {
            try {
                when (intent.action) {
                    ACTION_SIGN_IN -> signIn(intent)
                    ACTION_SEED -> seed(app)
                    ACTION_STATUS -> status(app)
                }
            } catch (t: Throwable) {
                Log.e(TAG, "command ${intent.action} failed: ${t.javaClass.simpleName}: ${t.message}")
            } finally {
                pending.finish()
            }
        }
    }

    private fun signIn(intent: Intent) {
        val email = intent.getStringExtra("email").orEmpty()
        val password = intent.getStringExtra("password").orEmpty()
        require(email.endsWith("@example.test")) { "agentstage only signs in example.test test accounts" }
        val auth = AuthProvider.auth
        val latch = java.util.concurrent.CountDownLatch(1)
        auth.signInWithEmailAndPassword(email, password)
            .addOnSuccessListener { Log.i(TAG, "SIGNED_IN uid=${it.user?.uid?.take(6)}… anonymous=${it.user?.isAnonymous}") }
            .addOnFailureListener { Log.e(TAG, "SIGN_IN_FAILED ${it.javaClass.simpleName}") }
            .addOnCompleteListener { latch.countDown() }
        latch.await(30, java.util.concurrent.TimeUnit.SECONDS)
    }

    private fun seed(app: Context) {
        val user = AuthProvider.auth.currentUser
        val uid = user?.uid
        require(uid != null && !user.isAnonymous) { "sign in first" }
        runBlocking { AgentDevFixtureSeeder.seed(DatabaseModule.provideDatabase(app), AgentDevFixtureData.build(uid)) }
        Log.i(TAG, "SEEDED synthetic fixtures for uid=${uid.take(6)}…")
    }

    private fun status(app: Context) {
        val rt = ProductionAgentRuntime.get(app) ?: return
        Log.i(
            TAG,
            "STATUS enabled=${rt.settings.enabled} signedIn=${rt.isSignedIn()} relayConfigured=${rt.relayConfigured} " +
                "lastPollOk=${rt.loop?.lastPollOkAtEpochMs} lastError=${rt.loop?.lastError} " +
                "clients=${rt.pairedClients().map { it.state }}"
        )
    }

    companion object {
        const val TAG = "AgentStage"
        const val ACTION_SIGN_IN = "com.rentacar.app.agentstage.SIGN_IN"
        const val ACTION_SEED = "com.rentacar.app.agentstage.SEED"
        const val ACTION_STATUS = "com.rentacar.app.agentstage.STATUS"
    }
}
