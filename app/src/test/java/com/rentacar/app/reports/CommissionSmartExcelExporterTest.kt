package com.rentacar.app.reports

import com.rentacar.app.data.Customer
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import com.rentacar.app.data.Supplier
import com.rentacar.app.domain.CommissionBusinessDates
import com.rentacar.app.domain.CommissionCalculationService
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId

class CommissionSmartExcelExporterTest {

    private val zone = ZoneId.of("Asia/Jerusalem")

    @Before
    fun setUp() {
        CommissionCalculationService.currentDateProvider = { LocalDate.of(2026, 8, 1) }
    }

    @After
    fun tearDown() {
        CommissionCalculationService.currentDateProvider = {
            LocalDate.now(CommissionBusinessDates.TIMEZONE)
        }
    }

    @Test
    fun selectByDeparture_usesDateFrom_notCreatedAt() {
        val inRange = reservation(
            id = 1,
            dateFrom = LocalDate.of(2026, 6, 15),
            createdAt = LocalDate.of(2025, 1, 1) // old creation — must still be included
        )
        val outOfRange = reservation(
            id = 2,
            dateFrom = LocalDate.of(2026, 3, 1),
            createdAt = LocalDate.of(2026, 6, 20) // recent creation — must be excluded
        )

        val selected = CommissionSmartExcelExporter.selectByDeparture(
            CommissionSmartExcelExporter.ExportParams(
                reservations = listOf(inRange, outOfRange),
                customers = emptyList(),
                suppliers = emptyList(),
                payoutMonth = YearMonth.of(2026, 8),
                departureFrom = LocalDate.of(2026, 6, 1),
                departureTo = LocalDate.of(2026, 6, 30)
            )
        )

        assertEquals(listOf(1L), selected.map { it.id })
    }

    @Test
    fun selectByDeparture_excludesCancelled() {
        val ok = reservation(id = 1, dateFrom = LocalDate.of(2026, 6, 10))
        val cancelled = reservation(
            id = 2,
            dateFrom = LocalDate.of(2026, 6, 10),
            status = ReservationStatus.Cancelled
        )
        val selected = CommissionSmartExcelExporter.selectByDeparture(
            CommissionSmartExcelExporter.ExportParams(
                reservations = listOf(ok, cancelled),
                customers = emptyList(),
                suppliers = emptyList(),
                payoutMonth = YearMonth.of(2026, 8)
            )
        )
        assertEquals(1, selected.size)
        assertEquals(1L, selected.single().id)
    }

    @Test
    fun selectByDeparture_filtersSupplier() {
        val a = reservation(id = 1, dateFrom = LocalDate.of(2026, 6, 10), supplierId = 10)
        val b = reservation(id = 2, dateFrom = LocalDate.of(2026, 6, 10), supplierId = 20)
        val selected = CommissionSmartExcelExporter.selectByDeparture(
            CommissionSmartExcelExporter.ExportParams(
                reservations = listOf(a, b),
                customers = emptyList(),
                suppliers = listOf(Supplier(id = 10, name = "A"), Supplier(id = 20, name = "B")),
                payoutMonth = YearMonth.of(2026, 8),
                supplierId = 10
            )
        )
        assertEquals(listOf(1L), selected.map { it.id })
    }

    @Test
    fun buildWorkbook_producesFiveSheets_andUsesCommissionService() {
        val daily = reservation(
            id = 100,
            dateFrom = LocalDate.of(2026, 6, 1),
            dateTo = LocalDate.of(2026, 6, 10),
            actualReturnDate = LocalDate.of(2026, 7, 15),
            periodTypeDays = 1,
            agreedPrice = 1000.0
        )
        val bytes = CommissionSmartExcelExporter.buildWorkbookBytes(
            CommissionSmartExcelExporter.ExportParams(
                reservations = listOf(daily),
                customers = listOf(
                    Customer(
                        id = 1,
                        firstName = "Test",
                        lastName = "User",
                        phone = "050",
                        createdAt = 0L,
                        updatedAt = 0L
                    )
                ),
                suppliers = listOf(Supplier(id = 1, name = "Sup")),
                payoutMonth = YearMonth.of(2026, 8),
                departureFrom = LocalDate.of(2026, 6, 1),
                departureTo = LocalDate.of(2026, 6, 30)
            )
        )
        assertTrue(bytes.isNotEmpty())
        // XSSF magic / zip header
        assertEquals('P'.code.toByte(), bytes[0])
        assertEquals('K'.code.toByte(), bytes[1])
    }

    @Test
    fun reasonIncluded_dailyMentionsActualReturn() {
        val r = reservation(
            id = 1,
            dateFrom = LocalDate.of(2026, 6, 1),
            actualReturnDate = LocalDate.of(2026, 7, 10),
            periodTypeDays = 1
        )
        val inst = CommissionCalculationService.calculateAllInstallmentsForReservation(r).single()
        val reason = CommissionSmartExcelExporter.reasonIncluded(inst, r)
        assertTrue(reason.contains("יומי") || reason.contains("שבועי"))
        assertFalse(reason.contains("createdAt"))
    }

    private fun reservation(
        id: Long,
        dateFrom: LocalDate,
        dateTo: LocalDate = dateFrom.plusDays(5),
        actualReturnDate: LocalDate? = null,
        createdAt: LocalDate = LocalDate.of(2020, 1, 1),
        periodTypeDays: Int = 1,
        agreedPrice: Double = 500.0,
        supplierId: Long = 1,
        status: ReservationStatus = ReservationStatus.Confirmed
    ): Reservation {
        fun epoch(d: LocalDate): Long =
            d.atStartOfDay(zone).toInstant().toEpochMilli()
        return Reservation(
            id = id,
            customerId = 1,
            supplierId = supplierId,
            branchId = 1,
            carTypeId = 1,
            carTypeName = "TestCar",
            agentId = null,
            dateFrom = epoch(dateFrom),
            dateTo = epoch(dateTo),
            actualReturnDate = actualReturnDate?.let { epoch(it) },
            includeVat = false,
            vatPercentAtCreation = 17.0,
            airportMode = false,
            periodTypeDays = periodTypeDays,
            agreedPrice = agreedPrice,
            kmIncluded = 0,
            requiredHoldAmount = 0,
            status = status,
            isClosed = false,
            isQuote = false,
            createdAt = epoch(createdAt),
            updatedAt = epoch(createdAt)
        )
    }
}
