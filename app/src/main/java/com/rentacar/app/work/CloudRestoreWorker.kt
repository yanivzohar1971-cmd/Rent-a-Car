package com.rentacar.app.work

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.rentacar.app.data.UserUidBackfill
import com.rentacar.app.data.auth.CurrentUserProvider
import com.rentacar.app.data.debug.DataDebugLogger
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
    private val currentUserProvider = CurrentUserProvider
    private val restoreRepository by lazy { CloudToLocalRestoreRepository(db, firestore, currentUserProvider) }
    
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        return@withContext try {
            Log.d(TAG, "Starting restore from cloud to local (insert-only)")
            val result = restoreRepository.restoreMissingDataFromCloud()
            
            // Sum up all restored counts
            val restoredCount = result.restoredCounts.values.sum()
            
            val output = workDataOf("restoredCount" to restoredCount)
            
            val currentUid = currentUserProvider.getCurrentUid()
            if (currentUid != null) {
                runCatching {
                    UserUidBackfill.backfillUserUidForCurrentUser(applicationContext, currentUid)
                }.onFailure {
                    Log.e(TAG, "Backfill after cloud restore failed", it)
                }
            } else {
                Log.w(TAG, "Backfill skipped: no current user UID during cloud restore")
            }
            
            // DEBUG: Log data snapshot after restore and backfill
            runCatching {
                DataDebugLogger.logUserDataSnapshot("CloudRestoreWorker.afterRestore", currentUid, db)
            }.onFailure {
                Log.e(TAG, "Failed to log data snapshot after restore", it)
            }
            
            if (result.errors.isNotEmpty()) {
                Log.e(TAG, "Restore finished with errors: ${result.errors}, restoredCount=$restoredCount")
                // Return success even with errors - partial restore is better than nothing
                Result.success(output)
            } else {
                Log.d(TAG, "Restore finished successfully: restoredCount=$restoredCount, details=${result.restoredCounts}")
                Result.success(output)
            }
        } catch (t: Throwable) {
            Log.e(TAG, "Unexpected failure during restore", t)
            Result.retry()
        }
    }
}

