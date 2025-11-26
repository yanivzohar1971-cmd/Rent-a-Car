package com.rentacar.app.work

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.annotation.RequiresApi
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.gson.GsonBuilder
import com.rentacar.app.di.DatabaseModule
import com.rentacar.app.data.auth.CurrentUserProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class BackupWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    private val db by lazy { DatabaseModule.provideDatabase(appContext) }
    private val gson = GsonBuilder().setPrettyPrinting().create()

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            val currentUid = CurrentUserProvider.requireCurrentUid()
            // Collect data from DAOs (ensure DAO methods provide snapshot lists)
            val customers = db.customerDao().listActive(currentUid).firstOrNull() ?: emptyList()
            val suppliers = db.supplierDao().getAll(currentUid).firstOrNull() ?: emptyList()
            val agents = db.agentDao().getAll(currentUid).firstOrNull() ?: emptyList()
            val carTypes = db.carTypeDao().getAll(currentUid).firstOrNull() ?: emptyList()
            val reservations = db.reservationDao().getAll(currentUid).firstOrNull() ?: emptyList()
            val payments = reservations.flatMap { r -> db.paymentDao().getForReservation(r.id, currentUid).firstOrNull().orEmpty() }
            val branches = suppliers.flatMap { s -> db.branchDao().getBySupplier(s.id, currentUid).firstOrNull().orEmpty() }
            val commissionRules = db.commissionRuleDao().getAll(currentUid).firstOrNull() ?: emptyList()
            val cardStubs = reservations.flatMap { r -> db.cardStubDao().getForReservation(r.id, currentUid).firstOrNull().orEmpty() }
            val requests = db.requestDao().getAll(currentUid).firstOrNull() ?: emptyList()
            val carSales = db.carSaleDao().getAll(currentUid).firstOrNull() ?: emptyList()

            val snapshot = mapOf(
                "exportVersion" to 5,
                "timestamp" to System.currentTimeMillis(),
                "tables" to mapOf(
                    "customers" to customers,
                    "suppliers" to suppliers,
                    "agents" to agents,
                    "carTypes" to carTypes,
                    "branches" to branches,
                    "reservations" to reservations,
                    "payments" to payments,
                    "commissionRules" to commissionRules,
                    "cardStubs" to cardStubs,
                    "requests" to requests,
                    "carSales" to carSales
                )
            )

            val json = gson.toJson(snapshot)
            val bytes = json.toByteArray(Charsets.UTF_8)

            val ts = SimpleDateFormat("dd-MM-yyyy_HH-mm-ss", Locale.getDefault()).format(Date())
            val fileName = "$ts.ICE"
            val relativePath = Environment.DIRECTORY_DOWNLOADS + "/MyApp/Backups/"
            val uri = insertDownloadUri(applicationContext, fileName, relativePath, "application/octet-stream")
                ?: return@withContext Result.retry()

            applicationContext.contentResolver.openOutputStream(uri)?.use { out ->
                out.write(bytes)
                out.flush()
            } ?: return@withContext Result.retry()

            pruneOldBackups(applicationContext, relativePath, fileExt = ".ICE", keep = 7)

            // Broadcast completion
            val intent = android.content.Intent("com.rentacar.app.BACKUP_DONE")
            applicationContext.sendBroadcast(intent)

            Result.success()
        } catch (t: Throwable) {
            val intent = android.content.Intent("com.rentacar.app.BACKUP_FAILED")
            applicationContext.sendBroadcast(intent)
            Result.retry()
        }
    }

    

    private fun insertDownloadUri(
        context: Context,
        displayName: String,
        relativeSubPath: String,
        mime: String
    ): Uri? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            insertDownloadUriApi29(context, displayName, relativeSubPath, mime)
        } else {
            // For API < 29, use MediaStore.Files for compatibility
            // Note: This is a fallback, but Downloads collection is preferred on API 29+
            null
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun insertDownloadUriApi29(
        context: Context,
        displayName: String,
        relativeSubPath: String,
        mime: String
    ): Uri? {
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, relativeSubPath)
        }
        val cr = context.contentResolver
        return cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
    }

    private fun pruneOldBackups(
        context: Context,
        relativeSubPath: String,
        fileExt: String,
        keep: Int
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            pruneOldBackupsApi29(context, relativeSubPath, fileExt, keep)
        }
        // For API < 29, skip pruning as Downloads collection is not available
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun pruneOldBackupsApi29(
        context: Context,
        relativeSubPath: String,
        fileExt: String,
        keep: Int
    ) {
        val cr = context.contentResolver
        val projection = arrayOf(
            MediaStore.Downloads._ID,
            MediaStore.MediaColumns.DISPLAY_NAME,
            MediaStore.MediaColumns.DATE_MODIFIED
        )
        val sel = "${MediaStore.MediaColumns.RELATIVE_PATH} = ?"
        cr.query(
            MediaStore.Downloads.EXTERNAL_CONTENT_URI,
            projection,
            sel,
            arrayOf(relativeSubPath + "/"),
            MediaStore.MediaColumns.DATE_MODIFIED + " DESC"
        )?.use { cursor ->
            val ids = mutableListOf<Long>()
            val nameIdx = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
            val idIdx = cursor.getColumnIndexOrThrow(MediaStore.Downloads._ID)
            while (cursor.moveToNext()) {
                val name = cursor.getString(nameIdx) ?: continue
                if (name.endsWith(fileExt)) {
                    ids += cursor.getLong(idIdx)
                }
            }
            ids.drop(keep).forEach { id ->
                val delUri = ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI, id)
                cr.delete(delUri, null, null)
            }
        }
    }
}


