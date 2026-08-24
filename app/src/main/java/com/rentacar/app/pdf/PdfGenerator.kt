package com.rentacar.app.pdf

import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import com.rentacar.app.share.ReservationShareDocument
import com.rentacar.app.share.ShareTextLayout
import com.rentacar.app.share.StyledShareLine
import java.io.ByteArrayOutputStream

object PdfGenerator {
    private const val PAGE_WIDTH = 595
    private const val PAGE_HEIGHT = 842
    private const val HEADER_HEIGHT = 72f
    private const val MARGIN = 40f
    private const val BODY_TEXT_SIZE = 12f
    private const val LINE_HEIGHT = 16f
    private const val TITLE = "Idan Car Expert"

    fun generateSimpleReservationPdf(lines: List<String>, rtl: Boolean = false): ByteArray {
        return generateStyledReservationPdf(
            lines = lines.map { StyledShareLine(it) },
            rtl = rtl
        )
    }

    fun generateReservationSharePdf(document: ReservationShareDocument): ByteArray {
        return generateStyledReservationPdf(
            lines = document.toStyledLines(),
            rtl = document.rtl
        )
    }

    fun generateStyledReservationPdf(
        lines: List<StyledShareLine>,
        rtl: Boolean = false
    ): ByteArray {
        val maxTextWidth = PAGE_WIDTH - (MARGIN * 2f)
        val measurePaint = android.graphics.Paint().apply {
            textSize = BODY_TEXT_SIZE
            isAntiAlias = true
        }
        val wrapped = ShareTextLayout.wrapLines(lines, maxTextWidth) { text, bold ->
            measurePaint.typeface = typeface(bold)
            measurePaint.measureText(text)
        }
        val firstContentHeight = PAGE_HEIGHT - HEADER_HEIGHT - 28f - MARGIN
        val additionalContentHeight = PAGE_HEIGHT - HEADER_HEIGHT - 28f - MARGIN
        val pages = ShareTextLayout.paginate(
            wrapped,
            ShareTextLayout.PageSpec(firstContentHeight, LINE_HEIGHT),
            ShareTextLayout.PageSpec(additionalContentHeight, LINE_HEIGHT)
        )

        val doc = PdfDocument()
        pages.forEachIndexed { index, pageLines ->
            val pageInfo = PdfDocument.PageInfo.Builder(PAGE_WIDTH, PAGE_HEIGHT, index + 1).create()
            val page = doc.startPage(pageInfo)
            drawPage(page.canvas, pageLines, rtl)
            doc.finishPage(page)
        }
        val bos = ByteArrayOutputStream()
        doc.writeTo(bos)
        doc.close()
        return bos.toByteArray()
    }

    private fun drawPage(
        canvas: android.graphics.Canvas,
        lines: List<StyledShareLine>,
        rtl: Boolean
    ) {
        val width = PAGE_WIDTH.toFloat()

        val headerBg = android.graphics.Paint().apply {
            style = android.graphics.Paint.Style.FILL
            color = android.graphics.Color.parseColor("#2E7D32")
            isAntiAlias = true
        }
        canvas.drawRect(0f, 0f, width, HEADER_HEIGHT, headerBg)

        val titlePaint = android.graphics.Paint().apply {
            color = android.graphics.Color.WHITE
            textSize = 24f
            isAntiAlias = true
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        canvas.drawText(TITLE, 40f, 46f, titlePaint)

        val sep = android.graphics.Paint().apply {
            color = android.graphics.Color.parseColor("#DDDDDD")
            strokeWidth = 1f
            isAntiAlias = true
        }
        canvas.drawLine(0f, HEADER_HEIGHT + 8f, width, HEADER_HEIGHT + 8f, sep)

        val bodyPaint = android.graphics.Paint().apply {
            textSize = BODY_TEXT_SIZE
            isAntiAlias = true
            color = android.graphics.Color.BLACK
            textAlign = if (rtl) android.graphics.Paint.Align.RIGHT else android.graphics.Paint.Align.LEFT
        }
        var y = HEADER_HEIGHT + 28f
        val x = if (rtl) width - MARGIN else MARGIN
        lines.forEach { line ->
            bodyPaint.typeface = typeface(line.bold)
            bodyPaint.color = line.colorArgb ?: android.graphics.Color.BLACK
            val segments = if (line.text.isEmpty()) listOf("") else line.text.split('\n')
            segments.forEach { segment ->
                canvas.drawText(segment, x, y, bodyPaint)
                y += LINE_HEIGHT
            }
        }
    }

    private fun typeface(bold: Boolean): Typeface =
        Typeface.create(Typeface.DEFAULT, if (bold) Typeface.BOLD else Typeface.NORMAL)
}
