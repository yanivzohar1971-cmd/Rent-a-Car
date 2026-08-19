package com.rentacar.app.commission.diagnostics

import android.content.Context
import android.util.Log
import java.io.File

/**
 * Latest reconciliation diagnostic JSON for ADB + in-app share.
 *
 * Device path:
 *   cache/commission_reconciliation/commission-reconciliation-latest.json
 *
 * Retrieve:
 *   adb exec-out run-as com.rentacar.app cat cache/commission_reconciliation/commission-reconciliation-latest.json
 */
object CommissionReconciliationReportStore {
    const val SUBDIR = "commission_reconciliation"
    const val LATEST_FILE_NAME = "commission-reconciliation-latest.json"
    private const val TAG = "RentCarReconDebug"

    fun persist(context: Context, json: String): File? = try {
        persistToDir(File(context.cacheDir, SUBDIR), json)
    } catch (e: Exception) {
        Log.w(TAG, "reconciliation json write failed: ${e.javaClass.simpleName}")
        null
    }

    fun persistToDir(dir: File, json: String): File {
        dir.mkdirs()
        val latest = File(dir, LATEST_FILE_NAME)
        latest.writeText(json, Charsets.UTF_8)
        return latest
    }

    fun latestFile(context: Context): File =
        File(File(context.cacheDir, SUBDIR), LATEST_FILE_NAME)
}
