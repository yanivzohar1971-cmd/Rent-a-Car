package com.rentacar.app.share

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File

data class ShareResult(
    val success: Boolean,
    val errorMessage: String? = null
)

object ShareService {

    const val MIME_XLSX =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    const val MIME_OCTET_STREAM = "application/octet-stream"
    const val MIME_PDF = "application/pdf"
    const val MIME_PNG = "image/png"
    const val MIME_JSON = "application/json"

    fun buildSupplierText(
        firstName: String,
        lastName: String,
        phone: String,
        tzId: String?,
        email: String?,
        fromDate: String,
        toDate: String,
        days: Int,
        carType: String,
        price: Double,
        kmIncluded: Int,
        branch: String,
        supplier: String,
        holdAmount: Int,
        holdNote: String,
        lang: ShareLanguage = ShareLanguage.HE
    ): String = when (lang) {
        ShareLanguage.HE -> buildString {
            appendLine("הזמנת השכרת רכב:")
            appendLine("שם: $firstName $lastName")
            appendLine("טל׳: $phone")
            if (!tzId.isNullOrBlank()) appendLine("ת" + "ז: $tzId")
            if (!email.isNullOrBlank()) appendLine("אימייל: $email")
            appendLine("מתאריך: $fromDate עד $toDate ($days ימים)")
            appendLine("סוג רכב: $carType")
            appendLine("מחיר: ₪${price.toInt()}")
            appendLine("ק" + "מ כלול: $kmIncluded")
            appendLine("סניף קבלה: $branch")
            appendLine("חברה מספקת: $supplier")
            append("מסגרת אשראי נדרשת: ₪$holdAmount")
            if (holdNote.isNotBlank()) append(holdNote)
        }
        ShareLanguage.EN -> buildString {
            appendLine("Car rental reservation:")
            appendLine("Name: $firstName $lastName")
            appendLine("Phone: $phone")
            if (!tzId.isNullOrBlank()) appendLine("ID: $tzId")
            if (!email.isNullOrBlank()) appendLine("Email: $email")
            appendLine("From: $fromDate To: $toDate ($days days)")
            appendLine("Car type: $carType")
            appendLine("Price: ₪${price.toInt()}")
            appendLine("Included km: $kmIncluded")
            appendLine("Pickup branch: $branch")
            appendLine("Supplier: $supplier")
            append("Required credit hold: ₪$holdAmount")
            if (holdNote.isNotBlank()) append(holdNote)
        }
    }

    fun shareText(context: Context, text: String): ShareResult {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
        }
        return launchChooser(context, intent, "שיתוף הזמנה")
    }

    fun sharePdf(context: Context, pdfBytes: ByteArray, fileName: String = "reservation.pdf"): ShareResult {
        val uri = saveBytesToCacheAndGetUri(context, pdfBytes, fileName)
        return shareFile(context, uri, fileName, MIME_PDF)
    }

    fun shareImage(context: Context, imageBytes: ByteArray, fileName: String = "image.png"): ShareResult {
        val uri = saveBytesToCacheAndGetUri(context, imageBytes, fileName)
        return shareFile(context, uri, fileName, MIME_PNG)
    }

    fun generateImageFromLines(lines: List<String>, rtl: Boolean = false): ByteArray {
        val paint = android.graphics.Paint().apply {
            color = android.graphics.Color.BLACK
            textSize = 40f
            isAntiAlias = true
        }
        val padding = 32
        val lineHeight = (paint.fontMetrics.bottom - paint.fontMetrics.top + 16).toInt()
        val width = 1200
        val height = padding * 2 + lineHeight * lines.size
        val bitmap = android.graphics.Bitmap.createBitmap(width, height, android.graphics.Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(bitmap)
        canvas.drawColor(android.graphics.Color.WHITE)
        var y = padding - paint.fontMetrics.top
        lines.forEach { text ->
            val x = if (rtl) width - padding.toFloat() else padding.toFloat()
            paint.textAlign =
                if (rtl) android.graphics.Paint.Align.RIGHT else android.graphics.Paint.Align.LEFT
            canvas.drawText(text, x, y, paint)
            y += lineHeight
        }
        val stream = java.io.ByteArrayOutputStream()
        bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, stream)
        return stream.toByteArray()
    }

    fun saveBytesToCacheAndGetUri(context: Context, bytes: ByteArray, fileName: String): Uri {
        val cacheDir = File(context.cacheDir, "shared")
        if (!cacheDir.exists()) cacheDir.mkdirs()
        val file = File(cacheDir, fileName)
        file.writeBytes(bytes)
        return FileProvider.getUriForFile(context, "com.rentacar.app.fileprovider", file)
    }

    fun copyTextToClipboard(context: Context, text: String, label: String = "text") {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText(label, text))
    }

    fun copyUriToClipboard(context: Context, uri: Uri, label: String = "content") {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newUri(context.contentResolver, label, uri))
    }

    /**
     * Builds a share [Intent] without launching it — used by unit tests and callers that
     * prefer to start the activity themselves on the UI thread.
     */
    fun buildShareFileIntent(
        uri: Uri,
        itemName: String? = null,
        mimeType: String = MIME_OCTET_STREAM,
        contentResolver: android.content.ContentResolver? = null
    ): Intent {
        return Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            if (contentResolver != null) {
                clipData = ClipData.newUri(contentResolver, itemName ?: "shared", uri)
            }
            if (!itemName.isNullOrBlank()) putExtra(Intent.EXTRA_TITLE, itemName)
        }
    }

    fun buildShareChooserIntent(
        uri: Uri,
        itemName: String? = null,
        mimeType: String = MIME_OCTET_STREAM,
        chooserTitle: String = "שיתוף קובץ",
        addNewTaskForNonActivity: Boolean = false,
        contentResolver: android.content.ContentResolver? = null
    ): Intent {
        val share = buildShareFileIntent(uri, itemName, mimeType, contentResolver)
        val chooser = Intent.createChooser(share, chooserTitle)
        if (addNewTaskForNonActivity) {
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return chooser
    }

    /**
     * Shares a file via the system chooser.
     * Safe for Activity and Application contexts.
     * Never throws [ActivityNotFoundException] — returns [ShareResult] instead.
     */
    fun shareFile(
        context: Context,
        uri: Uri,
        itemName: String? = null,
        mimeType: String = MIME_OCTET_STREAM
    ): ShareResult {
        val needsNewTask = context !is Activity
        val chooser = buildShareChooserIntent(
            uri = uri,
            itemName = itemName,
            mimeType = mimeType,
            addNewTaskForNonActivity = needsNewTask,
            contentResolver = context.contentResolver
        )
        return launchChooser(context, chooser, alreadyChooser = true)
    }

    private fun launchChooser(
        context: Context,
        intentOrChooser: Intent,
        title: String = "שיתוף קובץ",
        alreadyChooser: Boolean = false
    ): ShareResult {
        return try {
            val chooser = if (alreadyChooser) {
                intentOrChooser
            } else {
                val c = Intent.createChooser(intentOrChooser, title)
                if (context !is Activity) {
                    c.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                c
            }
            if (context !is Activity &&
                (chooser.flags and Intent.FLAG_ACTIVITY_NEW_TASK) == 0
            ) {
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(chooser)
            ShareResult(success = true)
        } catch (_: ActivityNotFoundException) {
            ShareResult(success = false, errorMessage = "לא נמצאה אפליקציה לשיתוף הקובץ")
        } catch (e: Exception) {
            ShareResult(
                success = false,
                errorMessage = e.message?.takeIf { it.isNotBlank() } ?: "שגיאה בפתיחת שיתוף"
            )
        }
    }
}
