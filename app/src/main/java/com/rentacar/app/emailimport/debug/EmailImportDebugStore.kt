package com.rentacar.app.emailimport.debug

import android.content.Context
import android.os.Build
import android.util.Log
import com.rentacar.app.BuildConfig
import java.io.File

/**
 * Single persistent UTF-8 debug JSON writer for email HTML and Clipboard import.
 *
 * Device path (debug / run-as):
 *   cache/email_import_debug/email-import-debug-latest.json
 *
 * Retrieve:
 *   adb exec-out run-as com.rentacar.app cat cache/email_import_debug/email-import-debug-latest.json
 */
object EmailImportDebugStore {
    const val SUBDIR = "email_import_debug"
    const val LATEST_FILE_NAME = "email-import-debug-latest.json"
    private const val TAG = EmailImportDebugSession.TAG

    fun persist(context: Context, session: EmailImportDebugSession) {
        try {
            val dir = File(context.cacheDir, SUBDIR)
            persistToDir(
                dir = dir,
                session = session,
                appVersionName = try {
                    context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "1.0"
                } catch (_: Exception) {
                    "1.0"
                },
                appVersionCode = 1,
                buildType = if (BuildConfig.DEBUG) "debug" else "release",
                deviceManufacturer = Build.MANUFACTURER,
                deviceModel = Build.MODEL,
                androidVersion = Build.VERSION.RELEASE,
                sdkInt = Build.VERSION.SDK_INT
            )
        } catch (e: Exception) {
            Log.w(TAG, "debug snapshot write failed: ${e.javaClass.simpleName}")
        }
    }

    fun persistToDir(
        dir: File,
        session: EmailImportDebugSession,
        appVersionName: String,
        appVersionCode: Int,
        buildType: String,
        deviceManufacturer: String,
        deviceModel: String,
        androidVersion: String,
        sdkInt: Int
    ): File {
        dir.mkdirs()
        val json = EmailImportDebugJsonExporter.toJson(
            session = session,
            appVersionName = appVersionName,
            appVersionCode = appVersionCode,
            buildType = buildType,
            deviceManufacturer = deviceManufacturer,
            deviceModel = deviceModel,
            androidVersion = androidVersion,
            sdkInt = sdkInt
        )
        val latest = File(dir, LATEST_FILE_NAME)
        latest.writeText(json, Charsets.UTF_8)
        val hash = session.candidateMessageIdHash?.take(12)
        if (!hash.isNullOrBlank()) {
            File(dir, "email-import-debug-${session.sessionId}-$hash.json").writeText(json, Charsets.UTF_8)
        }
        dir.listFiles()
            ?.filter { it.name != LATEST_FILE_NAME }
            ?.sortedByDescending { it.lastModified() }
            ?.drop(8)
            ?.forEach { it.delete() }
        return latest
    }

    fun latestFile(context: Context): File =
        File(File(context.cacheDir, SUBDIR), LATEST_FILE_NAME)
}
