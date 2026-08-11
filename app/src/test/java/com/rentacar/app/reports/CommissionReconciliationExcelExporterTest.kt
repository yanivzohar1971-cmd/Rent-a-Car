package com.rentacar.app.reports

import com.rentacar.app.commission.CommissionReconciliationService
import com.rentacar.app.commission.domain.CommissionLifecycleClassification
import com.rentacar.app.commission.domain.ReconciliationMatchStatus
import com.rentacar.app.commission.money.MoneyDecimal
import com.rentacar.app.commission.presentation.CommissionComparisonMapper
import com.rentacar.app.commission.presentation.PaymentDifferenceDirection
import com.rentacar.app.data.CommissionReconciliationItem
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.time.YearMonth

class CommissionReconciliationExcelExporterTest {

    @Test
    fun excel_containsDirectionAndGrossTotals() {
        val items = listOf(
            item(1, "a", "80", "100"),
            item(2, "b", "120", "100")
        )
        val presentations = CommissionComparisonMapper.buildPresentations(items)
        val totals = CommissionComparisonMapper.computeTotals(presentations)
        val bytes = CommissionReconciliationExcelExporter.buildWorkbookBytes(
            CommissionReconciliationExcelExporter.Params(
                supplierName = "שגריר",
                reportYearMonth = YearMonth.of(2026, 7),
                departureCutoffLabel = "cutoff",
                sourceFileName = "f.xlsx",
                fileHash = "h",
                parserLabel = "Shagrir",
                kpis = CommissionReconciliationService.ReconciliationKpis(
                    supplierCommissionTotal = MoneyDecimal.of("200"),
                    internalCommissionTotal = MoneyDecimal.of("200"),
                    deviationTotal = MoneyDecimal.ZERO,
                    fullMatches = 0,
                    amountMismatches = 2,
                    daysMismatches = 0,
                    supplierOnly = 0,
                    applicationOnly = 0,
                    alreadySettled = 0,
                    openMonthly30 = 0,
                    finalClosures = 2,
                    historicalCandidates = 0,
                    needsReview = 0
                ),
                items = items,
                presentations = presentations,
                paymentTotals = totals
            )
        )
        XSSFWorkbook(ByteArrayInputStream(bytes)).use { wb ->
            val summary = wb.getSheet("סיכום")
            val summaryText = (0..summary.lastRowNum).joinToString("\n") { r ->
                val row = summary.getRow(r) ?: return@joinToString ""
                "${row.getCell(0)?.stringCellValue}|${row.getCell(1)?.stringCellValue}"
            }
            assertTrue(summaryText.contains("סה״כ שולם בחסר"))
            assertTrue(summaryText.contains("סה״כ שולם ביתר"))
            assertTrue(summaryText.contains("יתרה נטו"))

            val sheet = wb.getSheet("התאמות")
            val header = sheet.getRow(0)
            val headers = (0 until header.lastCellNum).map { header.getCell(it).stringCellValue }
            assertTrue(headers.contains("כיוון הפער"))
            assertTrue(headers.contains("סכום בחסר"))
            assertTrue(headers.contains("סכום ביתר"))
            assertTrue(headers.contains("לתשלום לפי האפליקציה בדוח הנוכחי"))
            assertTrue(headers.contains("הכנסה לפני מע״מ לפי הספק"))
            assertTrue(headers.contains("מחיר חודשי"))
            assertTrue(headers.contains("סוג תעריף"))

            val directions = (1..sheet.lastRowNum).map {
                sheet.getRow(it).getCell(headers.indexOf("כיוון הפער")).stringCellValue
            }
            assertTrue(directions.contains("שולם בחסר"))
            assertTrue(directions.contains("שולם ביתר"))

            val percentIdx = headers.indexOf("אחוז ספק")
            val percent = sheet.getRow(1).getCell(percentIdx).stringCellValue
            assertEquals("7%", percent)
        }
        assertEquals(1, presentations.count { it.direction == PaymentDifferenceDirection.UNDERPAID })
        assertEquals(1, presentations.count { it.direction == PaymentDifferenceDirection.OVERPAID })
    }

    private fun item(id: Long, key: String, supplier: String, internal: String) =
        CommissionReconciliationItem(
            id = id,
            importId = 1,
            supplierId = 1,
            normalizedGroupKey = key,
            reservationId = id,
            internalEventId = "e$id",
            supplierOrderNumber = "$id",
            supplierInvoiceNumber = "i$id",
            supplierCustomerName = "C",
            supplierDays = 5,
            supplierRevenue = "100",
            supplierPercent = "7.000000000000001",
            supplierCommission = supplier,
            internalPeriodStart = null,
            internalPeriodEnd = null,
            internalDays = 5,
            internalPercent = "7",
            internalCommission = internal,
            deviation = null,
            matchStatus = ReconciliationMatchStatus.AMOUNT_MISMATCH.name,
            lifecycleClassification = CommissionLifecycleClassification.FINAL_MONTHLY_SETTLEMENT.name,
            proposedActualReturnDate = null,
            approvalState = "PENDING",
            userUid = "uid"
        )
}
