package com.rentacar.app.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class ReminderWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        // TODO: query reservations without supplierOrderNumber older than 48h, notify
        return Result.success()
    }
}


