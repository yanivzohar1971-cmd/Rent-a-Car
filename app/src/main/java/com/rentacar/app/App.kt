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
        scheduleDailyBackup(this)
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


