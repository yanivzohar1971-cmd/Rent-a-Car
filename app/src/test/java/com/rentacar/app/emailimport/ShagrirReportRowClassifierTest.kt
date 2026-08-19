package com.rentacar.app.emailimport

import com.rentacar.app.commission.parser.ShagrirCommissionReportParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShagrirReportRowClassifierTest {

    private val columnIndex = ShagrirCommissionReportParser.REQUIRED_HEADERS
        .mapIndexed { i, col -> col to i }
        .toMap()

    private fun mapOfCells(order: String, commission: String = "10", days: String = "1",
                           customer: String = "לקוח", invoice: String = "9",
                           revenue: String = "100", percent: String = "0.07", agent: String = "סוכן") =
        ShagrirReportRowClassifier.cellMap(
            listOf(order, commission, days, customer, invoice, revenue, percent, agent),
            columnIndex
        )

    @Test
    fun validRowIsData() {
        val kind = ShagrirReportRowClassifier.classify(mapOfCells("123"), 0, emptyList())
        assertEquals(ShagrirRowKind.VALID_DATA, kind)
    }

    @Test
    fun totalsRowRecognized() {
        assertEquals(
            ShagrirRowKind.TOTALS,
            ShagrirReportRowClassifier.classify(mapOfCells("סה\"כ", "10", "0", "", "", "100", "", ""), 2, emptyList())
        )
        assertEquals(
            ShagrirRowKind.TOTALS,
            ShagrirReportRowClassifier.classify(mapOfCells("סהכ", "10", "0", "", "", "100", "", ""), 2, emptyList())
        )
    }

    @Test
    fun footerAfterValidRowsWhenOrderBlankAndNoNumericShape() {
        val footer = mapOfCells("", "", "", "בברכה", "", "", "", "")
        val kind = ShagrirReportRowClassifier.classify(footer, validRowsParsed = 3, followingRows = emptyList())
        assertEquals(ShagrirRowKind.FOOTER, kind)
    }

    @Test
    fun emptyOrderInMiddleWithLaterValidIsMalformed() {
        val broken = mapOfCells("", "10", "1", "לקוח", "9", "100", "0.07", "סוכן")
        val later = listOf(mapOfCells("999"))
        val kind = ShagrirReportRowClassifier.classify(broken, validRowsParsed = 2, followingRows = later)
        assertEquals(ShagrirRowKind.MALFORMED, kind)
        assertEquals("מספר הזמנה ריק", ShagrirReportRowClassifier.malformedReason(broken))
    }

    @Test
    fun emptyOrderAsFirstRowIsMalformed() {
        val broken = mapOfCells("", "10", "1", "לקוח", "9", "100", "0.07", "סוכן")
        val kind = ShagrirReportRowClassifier.classify(broken, validRowsParsed = 0, followingRows = listOf(mapOfCells("2")))
        assertEquals(ShagrirRowKind.MALFORMED, kind)
    }

    @Test
    fun emptyOrderWithoutLaterValidAndNumericShapeIsMalformedNotFooter() {
        val broken = mapOfCells("", "10", "1", "לקוח", "9", "100", "0.07", "סוכן")
        val kind = ShagrirReportRowClassifier.classify(broken, validRowsParsed = 5, followingRows = emptyList())
        assertEquals(ShagrirRowKind.MALFORMED, kind)
    }

    @Test
    fun blankRowSkipped() {
        val blank = mapOfCells("", "", "", "", "", "", "", "")
        assertEquals(ShagrirRowKind.BLANK, ShagrirReportRowClassifier.classify(blank, 3, emptyList()))
    }

    @Test
    fun emptyOrderBreakIsNotUsedAsSoleRule() {
        assertFalse(
            "empty order after valid rows with later data must fail",
            ShagrirReportRowClassifier.classify(
                mapOfCells("", "10", "1", "לקוח", "9", "100", "0.07", "סוכן"),
                4,
                listOf(mapOfCells("88"))
            ) == ShagrirRowKind.FOOTER
        )
    }
}
