package com.rentacar.app.debug

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.rentacar.app.BuildConfig
import com.rentacar.app.work.CloudDeltaSyncWorker

/**
 * Debug-only trigger to enqueue cloud delta sync from adb:
 * adb shell am broadcast -a com.rentacar.app.DEBUG_SYNC_NOW -n com.rentacar.app/.debug.DebugSyncTriggerReceiver
 */
class DebugSyncTriggerReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (!BuildConfig.DEBUG) {
            Log.w(TAG, "Ignored: not a debug build")
            return
        }
        if (intent?.action != ACTION) {
            return
        }
        Log.i(TAG, "Enqueueing CloudDeltaSyncWorker via debug broadcast")
        val request = OneTimeWorkRequestBuilder<CloudDeltaSyncWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .addTag("cloud_delta_sync_now")
            .build()
        WorkManager.getInstance(context.applicationContext).enqueue(request)
    }

    companion object {
        private const val TAG = "DebugSyncTrigger"
        const val ACTION = "com.rentacar.app.DEBUG_SYNC_NOW"
    }
}
