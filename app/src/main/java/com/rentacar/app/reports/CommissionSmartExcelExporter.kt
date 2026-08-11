package com.rentacar.app.reports

import com.rentacar.app.data.Customer
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import com.rentacar.app.data.Supplier
import com.rentacar.app.domain.CommissionBusinessDates
import com.rentacar.app.domain.CommissionCalculationService
import com.rentacar.app.domain.CommissionInstallment
import org.apache.poi.ss.usermodel.CellStyle
import org.apache.poi.ss.usermodel.FillPatternType
import org.apache.poi.ss.usermodel.Font
import org.apache.poi.ss.usermodel.IndexedColors
import org.apache.poi.ss.usermodel.Row
import org.apache.poi.ss.usermodel.Sheet
import org.apache.poi.ss.usermodel.Workbook
import org.apache.poi.ss.util.CellRangeAddress
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import java.io.ByteArrayOutputStream
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter

/**
 * Smart Excel export for commission audit.
 *
 * Reservation selection is sliced by rental departure ([Reservation.dateFrom]) only —
 * never by createdAt / updatedAt / import timestamps.
 * Commission amounts and payout months come exclusively from [CommissionCalculationService].
 */
object CommissionSmartExcelExporter {

    data class ExportParams(
        val reservations: List<Reservation>,
        val customers: List<Customer>,
        val suppliers: List<Supplier>,
        val payoutMonth: YearMonth,
        val supplierId: Long? = null,
        val departureFrom: LocalDate? = null,
        val departureTo: LocalDate? = null
    )

    private val dateFmt: DateTimeFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy")
    private val monthFmt: DateTimeFormatter = DateTimeFormatter.ofPattern("MM/yyyy")

    fun buildWorkbookBytes(params: ExportParams): ByteArray {
        val payoutMonthStr = formatPayoutMonth(params.payoutMonth)
        val candidates = selectByDeparture(params)
        val installments = CommissionCalculationService.calculateCommissionInstallmentsForPayoutMonth(
            payoutMonth = payoutMonthStr,
            reservations = candidates,
            supplierFilter = null, // already filtered
            statusFilter = null
        )
        val reservationById = candidates.associateBy { it.id }
        val customerById = params.customers.associateBy { it.id }
        val supplierById = params.suppliers.associateBy { it.id }

        val workbook = XSSFWorkbook()
        val headerStyle = createHeaderStyle(workbook)

        writeSummarySheet(
            workbook = workbook,
            headerStyle = headerStyle,
            params = params,
            candidates = candidates,
            installments = installments,
            supplierById = supplierById
        )
        writeDetailsSheet(
            workbook = workbook,
            headerStyle = headerStyle,
            installments = installments,
            reservationById = reservationById,
            customerById = customerById,
            supplierById = supplierById,
            payoutMonthStr = payoutMonthStr
        )
        writeOpenMonthlySheet(
            workbook = workbook,
            headerStyle = headerStyle,
            candidates = candidates,
            customerById = customerById,
            supplierById = supplierById
        )
        writeMissingReturnSheet(
            workbook = workbook,
            headerStyle = headerStyle,
            candidates = candidates,
            customerById = customerById,
            supplierById = supplierById
        )
        writeAuditRulesSheet(workbook, headerStyle)

        ByteArrayOutputStream().use { out ->
            workbook.write(out)
            workbook.close()
            return out.toByteArray()
        }
    }

    /**
     * Candidate reservations: by departure [Reservation.dateFrom] (+ optional supplier).
     * Cancelled are excluded. Does not use createdAt/updatedAt.
     */
    fun selectByDeparture(params: ExportParams): List<Reservation> {
        return params.reservations.filter { r ->
            if (r.status == ReservationStatus.Cancelled) return@filter false
            if (params.supplierId != null && r.supplierId != params.supplierId) return@filter false
            val departure = CommissionBusinessDates.toLocalDate(r.dateFrom)
            val fromOk = params.departureFrom?.let { !departure.isBefore(it) } ?: true
            val toOk = params.departureTo?.let { !departure.isAfter(it) } ?: true
            fromOk && toOk
        }
    }

    private fun writeSummarySheet(
        workbook: Workbook,
        headerStyle: CellStyle,
        params: ExportParams,
        candidates: List<Reservation>,
        installments: List<CommissionInstallment>,
        supplierById: Map<Long, Supplier>
    ) {
        val sheet = workbook.createSheet("סיכום")
        val headers = listOf(
            "ספק",
            "טווח תאריכי יציאה",
            "חודש תשלום עמלה",
            "מספר הזמנות",
            "מספר אירועי עמלה",
            "סך עמלות",
            "אירועי יומי/שבועי",
            "אירועי מחזור חודשי",
            "השכרות חודשיות פתוחות",
            "חסר תאריך החזרה בפועל"
        )
        writeHeaderRow(sheet, headers, headerStyle)

        val supplierLabel = params.supplierId?.let { supplierById[it]?.name } ?: "כל הספקים"
        val departureRange = formatDepartureRange(params.departureFrom, params.departureTo)
        val dailyEvents = installments.count { !it.isMonthlyRental }
        val monthlyEvents = installments.count { it.isMonthlyRental }
        val openMonthly = candidates.count {
            CommissionCalculationService.isMonthlyRental(it) && it.actualReturnDate == null
        }
        val missingReturn = candidates.count {
            !CommissionCalculationService.isMonthlyRental(it) && it.actualReturnDate == null
        }

        val row = sheet.createRow(1)
        var c = 0
        row.createCell(c++).setCellValue(supplierLabel)
        row.createCell(c++).setCellValue(departureRange)
        row.createCell(c++).setCellValue(params.payoutMonth.format(monthFmt))
        row.createCell(c++).setCellValue(candidates.size.toDouble())
        row.createCell(c++).setCellValue(installments.size.toDouble())
        row.createCell(c++).setCellValue(CommissionCalculationService.getTotalCommission(installments))
        row.createCell(c++).setCellValue(dailyEvents.toDouble())
        row.createCell(c++).setCellValue(monthlyEvents.toDouble())
        row.createCell(c++).setCellValue(openMonthly.toDouble())
        row.createCell(c).setCellValue(missingReturn.toDouble())

        applySheetChrome(sheet, headers.size)
    }

    private fun writeDetailsSheet(
        workbook: Workbook,
        headerStyle: CellStyle,
        installments: List<CommissionInstallment>,
        reservationById: Map<Long, Reservation>,
        customerById: Map<Long, Customer>,
        supplierById: Map<Long, Supplier>,
        payoutMonthStr: String
    ) {
        val sheet = workbook.createSheet("פירוט עמלות")
        val headers = listOf(
            "ספק",
            "מספר הזמנה",
            "שם לקוח",
            "רכב",
            "סוג השכרה",
            "תאריך יציאה",
            "תאריך החזרה מתוכנן",
            "תאריך החזרה בפועל",
            "מספר מחזור",
            "תחילת מחזור",
            "סוף מחזור",
            "חודש תשלום עמלה",
            "סכום עמלה",
            "מזהה אירוע עמלה",
            "סיבת הכללה",
            "סטטוס / הערות"
        )
        writeHeaderRow(sheet, headers, headerStyle)

        val sorted = installments.sortedWith(
            compareBy<CommissionInstallment> { it.orderId }
                .thenBy { it.periodStart }
        )

        // Cycle numbers per reservation for monthly
        val cycleIndexById = mutableMapOf<String, Int>()
        sorted.filter { it.isMonthlyRental }
            .groupBy { it.orderId }
            .forEach { (_, list) ->
                list.sortedBy { it.periodStart }.forEachIndexed { index, inst ->
                    cycleIndexById[inst.id] = index + 1
                }
            }

        sorted.forEachIndexed { index, inst ->
            val reservation = reservationById[inst.orderId]
            val customer = reservation?.let { customerById[it.customerId] }
            val supplier = reservation?.let { supplierById[it.supplierId] }
            val row = sheet.createRow(index + 1)
            var c = 0
            row.createCell(c++).setCellValue(supplier?.name ?: "—")
            row.createCell(c++).setCellValue(inst.orderId.toDouble())
            row.createCell(c++).setCellValue(customerDisplayName(customer))
            row.createCell(c++).setCellValue(reservation?.carTypeName ?: "—")
            row.createCell(c++).setCellValue(
                if (inst.isMonthlyRental) "חודשי" else rentalTypeLabel(reservation)
            )
            row.createCell(c++).setCellValue(
                reservation?.let { formatMillisDate(it.dateFrom) } ?: "—"
            )
            row.createCell(c++).setCellValue(
                reservation?.let { formatMillisDate(it.dateTo) } ?: "—"
            )
            row.createCell(c++).setCellValue(
                reservation?.actualReturnDate?.let { formatMillisDate(it) } ?: "—"
            )
            row.createCell(c++).setCellValue(
                if (inst.isMonthlyRental) {
                    (cycleIndexById[inst.id] ?: 1).toDouble()
                } else {
                    1.0
                }
            )
            row.createCell(c++).setCellValue(formatMillisDate(inst.periodStart))
            row.createCell(c++).setCellValue(formatMillisDate(inst.periodEnd))
            row.createCell(c++).setCellValue(payoutMonthStr)
            row.createCell(c++).setCellValue(inst.amount)
            row.createCell(c++).setCellValue(inst.id)
            row.createCell(c++).setCellValue(reasonIncluded(inst, reservation))
            row.createCell(c).setCellValue(
                reservation?.notes?.takeIf { it.isNotBlank() }
                    ?: reservation?.status?.name
                    ?: "—"
            )
        }

        applySheetChrome(sheet, headers.size)
    }

    private fun writeOpenMonthlySheet(
        workbook: Workbook,
        headerStyle: CellStyle,
        candidates: List<Reservation>,
        customerById: Map<Long, Customer>,
        supplierById: Map<Long, Supplier>
    ) {
        val sheet = workbook.createSheet("השכרות חודשיות פתוחות")
        val headers = listOf(
            "ספק",
            "מספר הזמנה",
            "לקוח",
            "תאריך יציאה",
            "תאריך החזרה בפועל",
            "מחזורים שהושלמו",
            "סוף מחזור אחרון שהושלם",
            "סוף מחזור צפוי הבא",
            "חודש תשלום צפוי הבא"
        )
        writeHeaderRow(sheet, headers, headerStyle)

        val openMonthly = candidates.filter {
            CommissionCalculationService.isMonthlyRental(it) && it.actualReturnDate == null
        }.sortedBy { it.dateFrom }

        val today = LocalDate.now(CommissionBusinessDates.TIMEZONE)

        openMonthly.forEachIndexed { index, reservation ->
            val completed = completedMonthlyCycles(reservation)
            val lastEnd = completed.lastOrNull()?.second
            val nextStart = lastEnd?.plusDays(1)
                ?: CommissionBusinessDates.toLocalDate(reservation.dateFrom)
            val nextEnd = nextStart.plusDays(29)
            val nextPayout = CommissionCalculationService.commissionMonthForEventDate(nextEnd)

            val row = sheet.createRow(index + 1)
            var c = 0
            row.createCell(c++).setCellValue(supplierById[reservation.supplierId]?.name ?: "—")
            row.createCell(c++).setCellValue(reservation.id.toDouble())
            row.createCell(c++).setCellValue(customerDisplayName(customerById[reservation.customerId]))
            row.createCell(c++).setCellValue(formatMillisDate(reservation.dateFrom))
            row.createCell(c++).setCellValue("—")
            row.createCell(c++).setCellValue(completed.size.toDouble())
            row.createCell(c++).setCellValue(lastEnd?.format(dateFmt) ?: "—")
            row.createCell(c++).setCellValue(
                if (nextEnd.isAfter(today)) nextEnd.format(dateFmt) else nextEnd.format(dateFmt)
            )
            row.createCell(c).setCellValue(nextPayout.format(monthFmt))
        }

        applySheetChrome(sheet, headers.size)
    }

    private fun writeMissingReturnSheet(
        workbook: Workbook,
        headerStyle: CellStyle,
        candidates: List<Reservation>,
        customerById: Map<Long, Customer>,
        supplierById: Map<Long, Supplier>
    ) {
        val sheet = workbook.createSheet("חסר תאריך החזרה")
        val headers = listOf(
            "ספק",
            "מספר הזמנה",
            "לקוח",
            "סוג השכרה",
            "תאריך יציאה",
            "תאריך החזרה מתוכנן",
            "תאריך החזרה בפועל",
            "מדוע אין עמלה"
        )
        writeHeaderRow(sheet, headers, headerStyle)

        val missing = candidates.filter {
            !CommissionCalculationService.isMonthlyRental(it) && it.actualReturnDate == null
        }.sortedBy { it.dateFrom }

        missing.forEachIndexed { index, reservation ->
            val row = sheet.createRow(index + 1)
            var c = 0
            row.createCell(c++).setCellValue(supplierById[reservation.supplierId]?.name ?: "—")
            row.createCell(c++).setCellValue(reservation.id.toDouble())
            row.createCell(c++).setCellValue(customerDisplayName(customerById[reservation.customerId]))
            row.createCell(c++).setCellValue(rentalTypeLabel(reservation))
            row.createCell(c++).setCellValue(formatMillisDate(reservation.dateFrom))
            row.createCell(c++).setCellValue(formatMillisDate(reservation.dateTo))
            row.createCell(c++).setCellValue("—")
            row.createCell(c).setCellValue(
                "אין עמלה: חסר תאריך החזרה בפועל (השכרה יומית/שבועית)"
            )
        }

        applySheetChrome(sheet, headers.size)
    }

    private fun writeAuditRulesSheet(workbook: Workbook, headerStyle: CellStyle) {
        val sheet = workbook.createSheet("כללי ביקורת")
        writeHeaderRow(sheet, listOf("כלל"), headerStyle)
        val rules = listOf(
            "סינון הייצוא לפי תאריך יציאה / התחלת השכרה (dateFrom) בלבד — לא לפי createdAt / updatedAt / תאריך ייבוא.",
            "עמלה יומית/שבועית: חודש התשלום = החודש שאחרי תאריך ההחזרה בפועל (actualReturnDate).",
            "עמלה חודשית: חודש התשלום = החודש שאחרי סוף כל מחזור 30 יום שהושלם.",
            "אין עמלה על מחזור חודשי חלקי — רק מחזורים מלאים של 30 יום.",
            "השכרה יומית/שבועית פתוחה ללא actualReturnDate — אין עמלה.",
            "השכרה חודשית פתוחה יכולה לייצר עמלות רק על מחזורי 30 יום שהושלמו.",
            "חישוב העמלה מבוצע אך ורק דרך CommissionCalculationService — מקור האמת היחיד."
        )
        rules.forEachIndexed { index, text ->
            sheet.createRow(index + 1).createCell(0).setCellValue(text)
        }
        sheet.setColumnWidth(0, 18000)
        sheet.createFreezePane(0, 1)
    }

    /** Completed 30-day cycles as (start, end) pairs — mirrors commission service timing. */
    fun completedMonthlyCycles(reservation: Reservation): List<Pair<LocalDate, LocalDate>> {
        if (!CommissionCalculationService.isMonthlyRental(reservation)) return emptyList()
        val completionCap = CommissionCalculationService.getCommissionEndLocalDate(reservation)
            ?: LocalDate.now(CommissionBusinessDates.TIMEZONE)
        val cycles = mutableListOf<Pair<LocalDate, LocalDate>>()
        var cycleStart = CommissionBusinessDates.toLocalDate(reservation.dateFrom)
        while (true) {
            val cycleEnd = cycleStart.plusDays(29)
            if (cycleEnd.isAfter(completionCap)) break
            cycles += cycleStart to cycleEnd
            cycleStart = cycleEnd.plusDays(1)
        }
        return cycles
    }

    fun reasonIncluded(installment: CommissionInstallment, reservation: Reservation?): String {
        return if (installment.isMonthlyRental) {
            if (reservation?.actualReturnDate == null) {
                "חודשי פתוח: מחזור 30 יום שהושלם בחודש הקודם"
            } else {
                "חודשי: מחזור 30 יום שהסתיים בחודש הקודם"
            }
        } else {
            "יומי/שבועי: החזרה בפועל בחודש הקודם"
        }
    }

    private fun rentalTypeLabel(reservation: Reservation?): String {
        if (reservation == null) return "—"
        return when (reservation.periodTypeDays) {
            1 -> "יומי"
            7 -> "שבועי"
            24, 30 -> "חודשי"
            else -> "אחר (${reservation.periodTypeDays})"
        }
    }

    private fun customerDisplayName(customer: Customer?): String {
        if (customer == null) return "—"
        return listOfNotNull(customer.firstName, customer.lastName)
            .joinToString(" ")
            .ifBlank { "—" }
    }

    private fun formatPayoutMonth(month: YearMonth): String =
        "${month.year}-${month.monthValue.toString().padStart(2, '0')}"

    private fun formatDepartureRange(from: LocalDate?, to: LocalDate?): String = when {
        from == null && to == null -> "הכל"
        from != null && to != null -> "${from.format(dateFmt)} – ${to.format(dateFmt)}"
        from != null -> "מ-${from.format(dateFmt)}"
        else -> "עד-${to!!.format(dateFmt)}"
    }

    private fun formatMillisDate(millis: Long): String =
        CommissionBusinessDates.toLocalDate(millis).format(dateFmt)

    private fun createHeaderStyle(workbook: Workbook): CellStyle {
        val font: Font = workbook.createFont().apply { bold = true }
        return workbook.createCellStyle().apply {
            setFont(font)
            fillForegroundColor = IndexedColors.GREY_25_PERCENT.index
            fillPattern = FillPatternType.SOLID_FOREGROUND
        }
    }

    private fun writeHeaderRow(sheet: Sheet, headers: List<String>, style: CellStyle) {
        val row: Row = sheet.createRow(0)
        headers.forEachIndexed { index, title ->
            row.createCell(index).apply {
                setCellValue(title)
                cellStyle = style
            }
        }
    }

    private fun applySheetChrome(sheet: Sheet, columnCount: Int) {
        sheet.createFreezePane(0, 1)
        if (columnCount > 0) {
            sheet.setAutoFilter(CellRangeAddress(0, 0, 0, columnCount - 1))
        }
        for (i in 0 until columnCount) {
            sheet.setColumnWidth(i, 4200)
        }
    }
}
