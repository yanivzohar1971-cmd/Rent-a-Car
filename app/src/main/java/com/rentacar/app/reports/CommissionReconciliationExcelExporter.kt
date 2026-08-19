package com.rentacar.app.reports

import com.rentacar.app.commission.CommissionReconciliationService
import com.rentacar.app.commission.domain.CommissionLifecycleClassification
import com.rentacar.app.commission.domain.ReconciliationMatchStatus
import com.rentacar.app.commission.money.MoneyDecimal
import com.rentacar.app.commission.presentation.CommissionComparisonMapper
import com.rentacar.app.commission.presentation.CommissionComparisonPresentation
import com.rentacar.app.commission.presentation.FinancialDisplayFormatter
import com.rentacar.app.commission.presentation.PaymentDifferenceDirection
import com.rentacar.app.commission.presentation.PaymentDifferenceTotals
import com.rentacar.app.data.CommissionReconciliationItem
import com.rentacar.app.domain.CommissionBusinessDates
import org.apache.poi.ss.usermodel.CellStyle
import org.apache.poi.ss.usermodel.FillPatternType
import org.apache.poi.ss.usermodel.IndexedColors
import org.apache.poi.ss.usermodel.Row
import org.apache.poi.ss.usermodel.Workbook
import org.apache.poi.ss.util.CellRangeAddress
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import java.io.ByteArrayOutputStream
import java.time.YearMonth
import java.time.format.DateTimeFormatter

/**
 * Reconciliation Excel export. Reuses [CommissionComparisonMapper] — does not recalculate commissions.
 */
object CommissionReconciliationExcelExporter {

    data class Params(
        val supplierName: String,
        val reportYearMonth: YearMonth,
        val departureCutoffLabel: String,
        val sourceFileName: String,
        val fileHash: String,
        val parserLabel: String,
        val kpis: CommissionReconciliationService.ReconciliationKpis,
        val items: List<CommissionReconciliationItem>,
        val presentations: List<CommissionComparisonPresentation> =
            CommissionComparisonMapper.buildPresentations(items),
        val paymentTotals: PaymentDifferenceTotals =
            CommissionComparisonMapper.computeTotals(presentations)
    )

    private val dateFmt = DateTimeFormatter.ofPattern("dd/MM/yyyy")

    fun buildWorkbookBytes(params: Params): ByteArray {
        XSSFWorkbook().use { workbook ->
            val headerStyle = headerStyle(workbook)
            writeSummary(workbook, headerStyle, params)
            writeComparisonSheet(workbook, headerStyle, "התאמות", params.presentations)
            writeComparisonSheet(
                workbook, headerStyle, "שגריר בלבד",
                params.presentations.filter {
                    it.primaryItem.matchStatus == ReconciliationMatchStatus.SUPPLIER_ONLY.name
                }
            )
            writeComparisonSheet(
                workbook, headerStyle, "אפליקציה בלבד",
                params.presentations.filter {
                    it.primaryItem.matchStatus == ReconciliationMatchStatus.APPLICATION_ONLY.name
                }
            )
            writeComparisonSheet(
                workbook, headerStyle, "מחזורי 30 יום",
                params.presentations.filter {
                    it.primaryItem.lifecycleClassification ==
                        CommissionLifecycleClassification.OPEN_MONTHLY_30_DAY_CYCLE.name
                }
            )
            writeComparisonSheet(
                workbook, headerStyle, "סגירות סופיות",
                params.presentations.filter {
                    it.primaryItem.lifecycleClassification ==
                        CommissionLifecycleClassification.FINAL_MONTHLY_SETTLEMENT.name
                }
            )
            writeComparisonSheet(
                workbook, headerStyle, "בסיס היסטורי",
                params.presentations.filter {
                    it.primaryItem.lifecycleClassification ==
                        CommissionLifecycleClassification.HISTORICAL_BASELINE_CANDIDATE.name
                }
            )
            writeAudit(workbook, headerStyle, params)

            ByteArrayOutputStream().use { out ->
                workbook.write(out)
                return out.toByteArray()
            }
        }
    }

    private fun writeSummary(workbook: Workbook, headerStyle: CellStyle, params: Params) {
        val sheet = workbook.createSheet("סיכום")
        var r = 0
        fun kv(label: String, value: String) {
            val row = sheet.createRow(r++)
            row.createCell(0).setCellValue(label)
            row.createCell(1).setCellValue(value)
        }
        val totals = params.paymentTotals
        kv("ספק", params.supplierName)
        kv("חודש דוח", params.reportYearMonth.toString())
        kv("סף יציאה", params.departureCutoffLabel)
        kv("קובץ מקור", params.sourceFileName)
        kv("סה״כ עמלה בדוח ספק", FinancialDisplayFormatter.formatMoney(totals.supplierTotal))
        kv(
            "סה״כ הזמנות שהותאמו",
            FinancialDisplayFormatter.formatMoney(totals.matchedApplicationTotal)
        )
        kv(
            "אפליקציה בלבד",
            FinancialDisplayFormatter.formatMoney(totals.applicationOnlyTotal)
        )
        kv(
            "פער על התאמות קיימות",
            FinancialDisplayFormatter.formatMoney(totals.matchedDifference)
        )
        kv(
            "סה״כ אפליקציה כולל ללא התאמה",
            FinancialDisplayFormatter.formatMoney(totals.combinedApplicationTotal)
        )
        kv("סה״כ שולם בחסר", FinancialDisplayFormatter.formatMoney(totals.grossUnderpaid))
        kv("סה״כ שולם ביתר", FinancialDisplayFormatter.formatMoney(totals.grossOverpaid))
        kv("יתרה נטו", FinancialDisplayFormatter.formatMoney(totals.netSignedDifference))
        kv("משמעות יתרה נטו", totals.netMeaningHebrew)
        kv("מספר הזמנות בחסר", totals.underpaidCount.toString())
        kv("מספר הזמנות ביתר", totals.overpaidCount.toString())
        kv("מספר התאמות מלאות", totals.matchCount.toString())
        kv("לא ניתן להשוואה", totals.notComparableCount.toString())
        kv("התאמות מלאות (KPI)", params.kpis.fullMatches.toString())
        kv("ספק בלבד (KPI)", params.kpis.supplierOnly.toString())
        kv("אפליקציה בלבד (KPI)", params.kpis.applicationOnly.toString())
        sheet.setColumnWidth(0, 11000)
        sheet.setColumnWidth(1, 14000)
        sheet.getRow(0)?.getCell(0)?.cellStyle = headerStyle
    }

    private fun writeComparisonSheet(
        workbook: Workbook,
        headerStyle: CellStyle,
        name: String,
        presentations: List<CommissionComparisonPresentation>
    ) {
        val sheet = workbook.createSheet(name)
        val headers = listOf(
            "מספר הזמנה בדוח",
            "מספר הזמנה באפליקציה",
            "חשבונית", "לקוח", "ימים ספק", "אחוז ספק",
            "הכנסה לפני מע״מ לפי הספק",
            "בסיס הכנסה לפי האפליקציה",
            "פער בבסיס ההכנסה",
            "סוג תעריף",
            "מחיר יומי",
            "מחיר שבועי",
            "מחיר חודשי",
            "מעבר תעריף",
            "עמלה בדוח שגריר",
            "סה״כ פנימי לכל התקופה",
            "שולם בעבר",
            "לתשלום לפי האפליקציה בדוח הנוכחי",
            "הפרש חתום",
            "כיוון הפער",
            "סכום בחסר",
            "סכום ביתר",
            "הסבר החישוב",
            "סיבה",
            "סיווג מחזור",
            "סטטוס התאמה"
        )
        val headerRow = sheet.createRow(0)
        headers.forEachIndexed { i, h ->
            headerRow.createCell(i).apply {
                setCellValue(h)
                cellStyle = headerStyle
            }
        }
        presentations.forEachIndexed { index, presentation ->
            writePresentationRow(sheet.createRow(index + 1), presentation)
        }
        sheet.createFreezePane(0, 1)
        if (presentations.isNotEmpty()) {
            sheet.setAutoFilter(CellRangeAddress(0, presentations.size, 0, headers.lastIndex))
        }
        headers.indices.forEach { i ->
            sheet.setColumnWidth(i, 5000.coerceAtMost(14000))
        }
    }

    private fun writePresentationRow(row: Row, p: CommissionComparisonPresentation) {
        var c = 0
        fun text(v: String?) = row.createCell(c++).setCellValue(v.orEmpty())
        fun num(v: Int?) = row.createCell(c++).setCellValue(v?.toDouble() ?: 0.0)
        fun money(v: MoneyDecimal?) = row.createCell(c++).setCellValue(
            v?.let { FinancialDisplayFormatter.formatMoney(it) }.orEmpty()
        )
        val item = p.primaryItem
        val pricing = p.pricing
        text(item.supplierOrderNumber)
        text(item.appSupplierOrderNumber)
        text(item.supplierInvoiceNumber)
        text(p.customerName)
        num(item.supplierDays)
        text(p.supplierPercentFormatted)
        money(pricing?.supplierRevenueExVat)
        money(pricing?.applicationRentalRevenueExVat)
        money(pricing?.revenueDifference?.abs())
        text(pricing?.tariffBasisHebrew.orEmpty())
        text(pricing?.dailyPriceFormatted.orEmpty())
        text(pricing?.weeklyPriceFormatted.orEmpty())
        text(pricing?.monthlyPriceFormatted.orEmpty())
        text(pricing?.tariffTransitionHebrew.orEmpty())
        money(p.supplierReportedAmount)
        money(p.internalLifecycleTotal)
        text(
            when {
                p.previouslySettledKnown ->
                    FinancialDisplayFormatter.formatMoney(p.previouslySettledAmount)
                p.priorSettlementHint -> "כן (סכום לא בטיוטה)"
                else -> FinancialDisplayFormatter.formatMoney(MoneyDecimal.ZERO)
            }
        )
        money(p.internalCurrentPayableAmount)
        money(p.signedDifference)
        text(
            when (p.direction) {
                PaymentDifferenceDirection.MATCH -> "תואם"
                PaymentDifferenceDirection.UNDERPAID -> "שולם בחסר"
                PaymentDifferenceDirection.OVERPAID -> "שולם ביתר"
                PaymentDifferenceDirection.NOT_COMPARABLE -> "לא ניתן להשוואה"
            }
        )
        money(
            if (p.direction == PaymentDifferenceDirection.UNDERPAID) p.absoluteDifference else null
        )
        money(
            if (p.direction == PaymentDifferenceDirection.OVERPAID) p.absoluteDifference else null
        )
        text(p.calculationDetailHebrew.ifBlank { p.explanationHebrew })
        text(p.reasonHebrew)
        text(p.lifecycleBadgeHebrew)
        text(item.matchStatus)
    }

    private fun writeAudit(workbook: Workbook, headerStyle: CellStyle, params: Params) {
        val sheet = workbook.createSheet("כללי ביקורת")
        var r = 0
        fun line(text: String) {
            sheet.createRow(r++).createCell(0).setCellValue(text)
        }
        sheet.createRow(0).createCell(0).apply {
            setCellValue("כללי ביקורת")
            cellStyle = headerStyle
        }
        r = 1
        line("פרסר: ${params.parserLabel}")
        line("Hash קובץ: ${params.fileHash}")
        line("סובלנות השוואה: ₪0.01 לאחר עיגול מטבע")
        line("הפרש חתום = עמלה בדוח ספק − לתשלום לפי האפליקציה בדוח הנוכחי")
        line("סכומי ההשוואה מגיעים מ-CommissionComparisonMapper (ללא חישוב עמלות מחדש)")
        line(params.departureCutoffLabel)
        line("עמלות מחושבות ב-CommissionCalculationService בלבד — הייצוא אינו מחשב מחדש")
        sheet.setColumnWidth(0, 20000)
    }

    private fun headerStyle(workbook: Workbook): CellStyle {
        val font = workbook.createFont().apply { bold = true }
        return workbook.createCellStyle().apply {
            setFont(font)
            fillForegroundColor = IndexedColors.GREY_25_PERCENT.index
            fillPattern = FillPatternType.SOLID_FOREGROUND
        }
    }
}
