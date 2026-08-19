package com.rentacar.app.commission

import com.rentacar.app.commission.domain.CommissionLifecycleClassification
import com.rentacar.app.commission.domain.NormalizedSupplierGroup
import com.rentacar.app.commission.domain.ReconciliationMatchStatus
import com.rentacar.app.commission.domain.SupplierCommissionTerms
import com.rentacar.app.commission.money.MoneyDecimal
import com.rentacar.app.data.Customer
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import com.rentacar.app.data.Supplier
import com.rentacar.app.domain.CommissionBusinessDates
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class CommissionReconciliationServiceTest {

    private val tz = ZoneId.of("Asia/Jerusalem")

    @Test
    fun sliceCandidates_supplierStatusAndDateFromOnly() {
        val cutoff = LocalDate.of(2026, 7, 1)
        val included = reservation(id = 1, dateFrom = date(2026, 6, 30))
        val excludedExact = reservation(id = 2, dateFrom = date(2026, 7, 1))
        val cancelled = reservation(id = 3, dateFrom = date(2026, 6, 1), status = ReservationStatus.Cancelled)
        val otherSupplier = reservation(id = 4, supplierId = 99, dateFrom = date(2026, 6, 1))
        val withUpdatedAt = reservation(
            id = 5,
            dateFrom = date(2026, 6, 15),
            updatedAt = date(2026, 8, 1)
        )
        val lateCreated = reservation(id = 6, dateFrom = date(2026, 6, 1)).copy(
            createdAt = date(2026, 8, 1)
        )

        val sliced = CommissionReconciliationService.sliceCandidates(
            listOf(included, excludedExact, cancelled, otherSupplier, withUpdatedAt, lateCreated),
            supplierId = 1,
            departureCutoffExclusive = cutoff
        )
        assertEquals(setOf(1L, 5L, 6L), sliced.map { it.id }.toSet())
        assertTrue(sliced.none { it.id == 2L })
    }

    @Test
    fun sliceCandidates_doesNotDedupeByOrderNumber() {
        val cutoff = LocalDate.of(2026, 7, 1)
        val a = reservation(id = 1, dateFrom = date(2026, 6, 1), order = "28004")
        val b = reservation(id = 2, dateFrom = date(2026, 6, 2), order = "28004")
        val sliced = CommissionReconciliationService.sliceCandidates(
            listOf(a, b),
            supplierId = 1,
            departureCutoffExclusive = cutoff
        )
        assertEquals(2, sliced.size)
    }

    @Test
    fun match_bySupplierOrderNumber_andExternalFallback() {
        val group = group("9001", "1", 5, "15")
        val byOrder = reservation(id = 1, order = "9001")
        val byExternal = reservation(id = 2, order = null, external = "9002")
        val group2 = group("9002", "1", 5, "15")

        val result = CommissionReconciliationService.reconcile(
            input(
                groups = listOf(group, group2),
                reservations = listOf(byOrder, byExternal)
            )
        )
        assertTrue(result.items.any { it.reservationId == 1L })
        assertTrue(result.items.any { it.reservationId == 2L })
    }

    @Test
    fun noMatch_supplierOnly() {
        val result = CommissionReconciliationService.reconcile(
            input(groups = listOf(group("404", "1", 5, "15")), reservations = emptyList())
        )
        assertEquals(
            ReconciliationMatchStatus.SUPPLIER_ONLY.name,
            result.items.single().matchStatus
        )
    }

    @Test
    fun multipleMatches_needsManualReview() {
        val result = CommissionReconciliationService.reconcile(
            input(
                groups = listOf(group("1", "1", 5, "15")),
                reservations = listOf(
                    reservation(id = 1, order = "1"),
                    reservation(id = 2, order = "1")
                )
            )
        )
        assertEquals(
            ReconciliationMatchStatus.MULTIPLE_RESERVATION_MATCHES.name,
            result.items.single().matchStatus
        )
    }

    @Test
    fun exact30_classifiedOpenMonthly() {
        val result = CommissionReconciliationService.reconcile(
            input(
                groups = listOf(group("10", "1", 30, "70", revenue = "1000", commission = "70")),
                reservations = listOf(
                    reservation(
                        id = 1,
                        order = "10",
                        periodTypeDays = 30,
                        dateFrom = date(2026, 5, 1),
                        dateTo = date(2026, 12, 1),
                        agreedPrice = 1000.0
                    )
                )
            )
        )
        assertTrue(
            result.items.any {
                it.lifecycleClassification ==
                    CommissionLifecycleClassification.OPEN_MONTHLY_30_DAY_CYCLE.name
            }
        )
    }

    private fun input(
        groups: List<NormalizedSupplierGroup>,
        reservations: List<Reservation>
    ) = CommissionReconciliationService.Input(
        supplier = Supplier(id = 1, name = "TestSupplier"),
        reportYear = 2026,
        reportMonth = 7,
        departureCutoff = LocalDate.of(2026, 7, 1),
        normalizedGroups = groups,
        candidateReservations = reservations,
        customersById = reservations.associate {
            it.customerId to Customer(id = it.customerId, firstName = "A", lastName = "B", phone = "1")
        },
        terms = SupplierCommissionTerms(15, 10, 7),
        settledEvents = emptyList(),
        trackingOverrides = emptyList(),
        userUid = "uid"
    )

    private fun group(
        order: String,
        invoice: String,
        days: Int,
        percent: String,
        revenue: String = "100",
        commission: String = "15"
    ) = NormalizedSupplierGroup(
        groupKey = "$order|$invoice",
        orderNumber = order,
        invoiceNumber = invoice,
        totalDays = days,
        commissionPercent = MoneyDecimal.of(percent),
        revenueExVat = MoneyDecimal.of(revenue),
        commissionAmount = MoneyDecimal.of(commission),
        customerName = "A B",
        agentName = "Agent",
        sourceRowNumbers = listOf(3),
        sourceRows = emptyList(),
        isValid = true
    )

    private fun reservation(
        id: Long,
        supplierId: Long = 1,
        dateFrom: Long = date(2026, 6, 1),
        dateTo: Long = date(2026, 6, 10),
        status: ReservationStatus = ReservationStatus.Confirmed,
        order: String? = null,
        external: String? = null,
        periodTypeDays: Int = 1,
        agreedPrice: Double = 100.0,
        updatedAt: Long = System.currentTimeMillis()
    ) = Reservation(
        id = id,
        customerId = 1,
        supplierId = supplierId,
        branchId = 1,
        carTypeId = 1,
        dateFrom = dateFrom,
        dateTo = dateTo,
        agreedPrice = agreedPrice,
        kmIncluded = 100,
        requiredHoldAmount = 500,
        periodTypeDays = periodTypeDays,
        status = status,
        supplierOrderNumber = order,
        externalContractNumber = external,
        updatedAt = updatedAt
    )

    private fun date(y: Int, m: Int, d: Int): Long =
        LocalDate.of(y, m, d).atStartOfDay(tz).toInstant().toEpochMilli()
}
