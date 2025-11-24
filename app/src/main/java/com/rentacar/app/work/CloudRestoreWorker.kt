package com.rentacar.app.work

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.rentacar.app.data.sync.CloudToLocalRestoreRepository
import com.rentacar.app.di.DatabaseModule
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class CloudRestoreWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {
    
    companion object {
        private const val TAG = "cloud_restore"
    }
    
    private val db by lazy { DatabaseModule.provideDatabase(appContext) }
    private val firestore by lazy { FirebaseFirestore.getInstance() }
    private val restoreRepository by lazy { CloudToLocalRestoreRepository(db, firestore) }
    
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        return@withContext try {
            Log.d(TAG, "Starting restore from cloud to local (insert-only)")
            val result = restoreRepository.restoreMissingDataFromCloud()
            
            if (result.errors.isNotEmpty()) {
                Log.e(TAG, "Restore finished with errors: ${result.errors}")
                // Return success even with errors - partial restore is better than nothing
                Result.success()
            } else {
                Log.d(TAG, "Restore finished successfully: ${result.restoredCounts}")
                Result.success()
            }
        } catch (t: Throwable) {
            Log.e(TAG, "Unexpected failure during restore", t)
            Result.retry()
        }
    }
}

