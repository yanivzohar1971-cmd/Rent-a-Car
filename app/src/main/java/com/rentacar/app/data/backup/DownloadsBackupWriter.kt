package com.rentacar.app.data.backup

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.annotation.RequiresApi

/**
 * Writes automatic backup files to the same Downloads/MyApp/Backups destination
 * used by [com.rentacar.app.work.BackupWorker].
 */
object DownloadsBackupWriter {

    val RELATIVE_PATH: String = Environment.DIRECTORY_DOWNLOADS + "/MyApp/Backups/"

    fun writeBytes(
        context: Context,
        fileName: String,
        bytes: ByteArray,
        mime: String = "application/json"
    ): Uri {
        val uri = insertDownloadUri(context, fileName, RELATIVE_PATH, mime)
            ?: error("לא ניתן ליצור קובץ גיבוי באחסון")
        context.contentResolver.openOutputStream(uri)?.use { out ->
            out.write(bytes)
            out.flush()
        } ?: error("לא ניתן לכתוב את קובץ הגיבוי")
        return uri
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
        return context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
    }
}
