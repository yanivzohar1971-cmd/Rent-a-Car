package com.rentacar.app.agentdev

import com.rentacar.app.data.CarSaleCommissionPaymentLogic
import com.rentacar.app.data.CarSaleCommissionPaymentLogic.PaymentStatus
import com.rentacar.app.data.ReservationStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class AgentDevFixtureDataTest {
    private val uid = "agent-dev-uid"
    private val fx = AgentDevFixtureData.build(uid)

    @Test
    fun everyRowIsOwnedByTheFixedDevUid() {
        assertTrue(fx.suppliers.all { it.userUid == uid })
        assertTrue(fx.branches.all { it.userUid == uid })
        assertTrue(fx.carTypes.all { it.userUid == uid })
        assertTrue(fx.customers.all { it.userUid == uid })
        assertTrue(fx.reservations.all { it.userUid == uid })
        assertTrue(fx.carSales.all { it.userUid == uid })
        assertTrue(fx.commissionPayments.all { it.userUid == uid })
    }

    @Test
    fun expectedCountsAndDeterministicNonZeroIds() {
        assertEquals(3, fx.suppliers.size)
        assertEquals(3, fx.customers.size)
        assertTrue(fx.reservations.size >= 4)
        assertTrue(fx.carSales.size >= 2)
        listOf(
            fx.suppliers.map { it.id }, fx.branches.map { it.id }, fx.carTypes.map { it.id },
            fx.customers.map { it.id }, fx.reservations.map { it.id }, fx.carSales.map { it.id },
            fx.commissionPayments.map { it.id }
        ).forEach { ids ->
            assertTrue("ids must be explicit and non-zero", ids.all { it != 0L })
            assertEquals("ids must be unique", ids.size, ids.toSet().size)
        }
        assertEquals(setOf("Alpha Rentals", "Beta Cars", "Gamma Mobility"), fx.suppliers.map { it.name }.toSet())
    }

    @Test
    fun buildIsDeterministic() {
        assertEquals(fx, AgentDevFixtureData.build(uid))
    }

    @Test
    fun reservationsReferenceSeededParentsAndCarryExternalNumbers() {
        val suppliers = fx.suppliers.map { it.id }.toSet()
        val customers = fx.customers.map { it.id }.toSet()
        val branches = fx.branches.associateBy { it.id }
        fx.reservations.forEach { r ->
            assertTrue(r.supplierId in suppliers)
            assertTrue(r.customerId in customers)
            assertEquals(r.supplierId, branches.getValue(r.branchId).supplierId)
            assertTrue(r.dateTo > r.dateFrom)
        }
        assertTrue(fx.reservations.count { it.supplierOrderNumber != null } >= 4)
        assertTrue(fx.reservations.count { it.externalContractNumber != null } >= 4)
        assertTrue(fx.reservations.map { it.status }.toSet().size >= 4)
        assertTrue(ReservationStatus.Cancelled in fx.reservations.map { it.status })
        // (supplierId, externalContractNumber) is a reconciliation key and must be unique.
        val keys = fx.reservations.mapNotNull { r -> r.externalContractNumber?.let { r.supplierId to it } }
        assertEquals(keys.size, keys.toSet().size)
    }

    @Test
    fun customersIncludeAnInactiveAndACompany() {
        assertTrue(fx.customers.any { !it.active })
        assertTrue(fx.customers.any { it.isCompany })
    }

    @Test
    fun commissionPaymentsCoverUnpaidPartialAndPaid() {
        val statuses = fx.carSales.associate { sale ->
            val paid = fx.commissionPayments.filter { it.carSaleId == sale.id }.map { it.amount }
            sale.id to CarSaleCommissionPaymentLogic.paymentStatus(
                sale.commissionPrice,
                CarSaleCommissionPaymentLogic.totalPaid(paid)
            )
        }
        assertEquals(PaymentStatus.UNPAID, statuses[AgentDevFixtureData.CAR_SALE_UNPAID_ID])
        assertEquals(PaymentStatus.PARTIAL, statuses[AgentDevFixtureData.CAR_SALE_PARTIAL_ID])
        assertEquals(PaymentStatus.PAID, statuses[AgentDevFixtureData.CAR_SALE_PAID_ID])
        // No fixture overpays a sale.
        fx.carSales.forEach { sale ->
            val amounts = fx.commissionPayments.filter { it.carSaleId == sale.id }.map { it.amount }
            assertEquals(
                CarSaleCommissionPaymentLogic.ValidationResult.Ok,
                CarSaleCommissionPaymentLogic.validatePaymentsDoNotExceedCommission(sale.commissionPrice, amounts)
            )
        }
        assertTrue(fx.commissionPayments.all { p -> fx.carSales.any { it.id == p.carSaleId } })
    }

    @Test
    fun blankUidIsRejected() {
        try {
            AgentDevFixtureData.build("  ")
            fail("expected IllegalArgumentException")
        } catch (_: IllegalArgumentException) {
        }
    }
}
