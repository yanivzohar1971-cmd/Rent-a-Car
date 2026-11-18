package com.rentacar.app

import android.app.Application
import androidx.work.Configuration
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

class App : Application(), Configuration.Provider {
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().build()

    override fun onCreate() {
        super.onCreate()

        // AGENT-101: the agentdev APK is fully offline. No Firebase sign-in, no cloud/backup workers.
        if (BuildConfig.AGENT_DEV_MODE) {
            com.rentacar.app.agentdev.AgentDevBootstrap.start(this)
            return
        }

        // AGENT-125..128: the emulator-only `agentstage` build routes Firebase to local emulators
        // (demo project). Empty in `standard`, so production behaviour is unchanged.
        if (BuildConfig.FIREBASE_EMULATOR_HOST.isNotBlank()) {
            com.google.firebase.auth.FirebaseAuth.getInstance().useEmulator(BuildConfig.FIREBASE_EMULATOR_HOST, 19099)
            com.google.firebase.firestore.FirebaseFirestore.getInstance().useEmulator(BuildConfig.FIREBASE_EMULATOR_HOST, 18080)
        }

        // Ensure Firebase Auth user exists for Firestore security rules (debug logging, etc.)
        com.rentacar.app.data.firebase.FirebaseAuthInitializer.ensureSignedIn()

        scheduleDailyBackup(this)

        // AGENT-125: Claude Agent access. No-op unless the owner enabled it AND a relay is configured
        // for this build (standard ships with none).
        com.rentacar.app.agentapi.production.ProductionAgentRuntime.get(this)?.ensureRelayLoop()
    }
}

fun scheduleDailyBackup(context: android.content.Context) {
    val request = PeriodicWorkRequestBuilder<com.rentacar.app.work.BackupWorker>(1, TimeUnit.DAYS)
        .setConstraints(
            Constraints.Builder()
                .setRequiresBatteryNotLow(true)
                .build()
        )
        .build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
        "daily_json_backup",
        ExistingPeriodicWorkPolicy.KEEP,
        request
    )
}

