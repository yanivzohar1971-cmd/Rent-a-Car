package com.rentacar.app.pdf

import android.graphics.pdf.PdfDocument
import android.os.ParcelFileDescriptor
import java.io.ByteArrayOutputStream

object PdfGenerator {
    fun generateSimpleReservationPdf(lines: List<String>, rtl: Boolean = false): ByteArray {
        val doc = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create() // A4
        val page = doc.startPage(pageInfo)
        val canvas = page.canvas
        val width = pageInfo.pageWidth.toFloat()

        // Header background
        val headerHeight = 72f
        val headerBg = android.graphics.Paint().apply {
            style = android.graphics.Paint.Style.FILL
            color = android.graphics.Color.parseColor("#2E7D32") // Dark green
            isAntiAlias = true
        }
        canvas.drawRect(0f, 0f, width, headerHeight, headerBg)

        // Header title: "Idan Car Expert"
        val titlePaint = android.graphics.Paint().apply {
            color = android.graphics.Color.WHITE
            textSize = 24f
            isAntiAlias = true
            typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
        }
        // Draw title on the left
        canvas.drawText("Idan Car Expert", 40f, 46f, titlePaint)

        // Separator line
        val sep = android.graphics.Paint().apply {
            color = android.graphics.Color.parseColor("#DDDDDD")
            strokeWidth = 1f
            isAntiAlias = true
        }
        canvas.drawLine(0f, headerHeight + 8f, width, headerHeight + 8f, sep)

        // Body text
        val bodyPaint = android.graphics.Paint().apply {
            textSize = 12f
            isAntiAlias = true
            color = android.graphics.Color.BLACK
            textAlign = if (rtl) android.graphics.Paint.Align.RIGHT else android.graphics.Paint.Align.LEFT
        }
        var y = headerHeight + 28f
        val margin = 40f
        val x = if (rtl) width - margin else margin
        lines.forEach { line ->
            canvas.drawText(line, x, y, bodyPaint)
            y += 20f
        }
        doc.finishPage(page)
        val bos = ByteArrayOutputStream()
        doc.writeTo(bos)
        doc.close()
        return bos.toByteArray()
    }
}


