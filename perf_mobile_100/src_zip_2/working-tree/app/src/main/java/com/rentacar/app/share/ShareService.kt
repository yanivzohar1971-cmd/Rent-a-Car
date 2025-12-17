package com.rentacar.app.share

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.content.ClipData
import android.content.ClipboardManager
import androidx.core.content.FileProvider
import java.io.File

object ShareService {
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
        holdNote: String
    ): String = buildString {
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

    fun shareText(context: Context, text: String) {
        val intent = Intent(Intent.ACTION_SEND)
        intent.type = "text/plain"
        intent.putExtra(Intent.EXTRA_TEXT, text)
        context.startActivity(Intent.createChooser(intent, "שיתוף הזמנה"))
    }

    fun sharePdf(context: Context, pdfBytes: ByteArray, fileName: String = "reservation.pdf") {
        val uri = saveBytesToCacheAndGetUri(context, pdfBytes, fileName)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "שליחת PDF"))
    }

    fun shareImage(context: Context, imageBytes: ByteArray, fileName: String = "image.png") {
        val uri = saveBytesToCacheAndGetUri(context, imageBytes, fileName)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "שליחת תמונה"))
    }

    // Simple PNG from text lines (RTL supported by aligning text to right)
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
            if (rtl) paint.textAlign = android.graphics.Paint.Align.RIGHT else paint.textAlign = android.graphics.Paint.Align.LEFT
            canvas.drawText(text, x, y, paint)
            y += lineHeight
        }
        val stream = java.io.ByteArrayOutputStream()
        bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, stream)
        return stream.toByteArray()
    }

    // Helpers
    fun saveBytesToCacheAndGetUri(context: Context, bytes: ByteArray, fileName: String): Uri {
        val cacheDir = File(context.cacheDir, "shared"); if (!cacheDir.exists()) cacheDir.mkdirs()
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

    fun shareFile(context: Context, uri: Uri, itemName: String? = null) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/octet-stream"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            if (!itemName.isNullOrBlank()) putExtra(Intent.EXTRA_TITLE, itemName)
        }
        context.startActivity(Intent.createChooser(intent, "שיתוף קובץ"))
    }
}


