package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.commands.AgentDevRoomWriteCommitter
import com.rentacar.app.agentapi.commands.CommandOutcome
import com.rentacar.app.agentapi.commands.CommandPrepareOutcome
import com.rentacar.app.agentapi.commands.CommissionPaymentSafety
import com.rentacar.app.agentapi.commands.CommissionPaymentWriteSpecs
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.data.CarSaleCommissionPaymentLogic
import com.rentacar.app.data.CarSaleCommissionPaymentLogic.PaymentStatus
import com.rentacar.app.domain.CommissionCalculator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** AGENT-114: carSale.commissionPayment.add safety (existing commission logic only, AgentDev-gated commit). */
class CommissionPaymentWriteTest {
    private val day = 1_800_000_000_000L
    private val op = CommissionPaymentWriteSpecs.CAR_SALE_COMMISSION_PAYMENT_ADD

    private fun params(saleId: Long, amount: Number, date: Long = day) =
        mapOf<String, Any?>("carSaleId" to saleId, "amount" to amount, "paymentDate" to date)

    // ---- registry / spec ----

    @Test
    fun theOperationIsARegisteredWriteAndTheSpecIsPipelineAccepted() {
        val fx = AgentDevWriteFixture()
        assertEquals("WRITE", fx.registry.get(op)!!.readOrWrite.name)
        assertEquals(listOf(op), CommissionPaymentWriteSpecs.all().map { it.operationId })
        // Constructing the fixture pipeline already proves registry acceptance; prepare is read-only.
        val p = fx.prepared(op, params(1, 100))
        assertTrue(p.preview.changes.any { it.field == "amount" })
        assertEquals(0, fx.ports.writeCalls)
    }

    @Test
    fun specValidationIsShapeOnlyAndPure() {
        val fx = AgentDevWriteFixture()
        fun rejectedMsg(p: Map<String, Any?>) =
            (fx.prepare(op, p) as CommandPrepareOutcome.Rejected).receipt.message
        assertTrue(rejectedMsg(emptyMap()).contains("carSaleId is required"))
        assertTrue(rejectedMsg(params(1, 0)).contains("amount must be greater than zero"))
        assertTrue(rejectedMsg(params(1, -5)).contains("amount must be greater than zero"))
        assertTrue(rejectedMsg(params(1, 10, 0)).contains("paymentDate must be a valid date"))
        assertTrue(rejectedMsg(params(0, 10)).contains("carSaleId must be positive"))
        assertTrue(rejectedMsg(params(1, 10) + ("amount" to "10")).contains("amount must be a number"))
        assertTrue(rejectedMsg(params(1, 10) + ("commissionPrice" to 5)).contains("unknown parameters"))
        assertTrue(rejectedMsg(params(1, Double.NaN)).contains("amount must be a number"))
    }

    // ---- calculation verification helper wraps existing logic ----

    @Test
    fun unpaidToPartialToPaidSemanticsMatchTheExistingLogic() {
        val unpaid = CommissionPaymentSafety.verifyAdd(1000.0, emptyList(), 400.0, day)
        assertTrue(unpaid.allowed)
        assertEquals(PaymentStatus.UNPAID, unpaid.statusBefore)
        assertEquals(PaymentStatus.PARTIAL, unpaid.statusAfter)
        assertEquals(600.0, unpaid.remainingAfter, 0.0)

        val partial = CommissionPaymentSafety.verifyAdd(1000.0, listOf(400.0), 600.0, day)
        assertEquals(PaymentStatus.PARTIAL, partial.statusBefore)
        assertEquals(PaymentStatus.PAID, partial.statusAfter)
        assertEquals(0.0, partial.remainingAfter, 0.0)

        val full = CommissionPaymentSafety.verifyAdd(1000.0, emptyList(), 1000.0, day)
        assertEquals(PaymentStatus.UNPAID, full.statusBefore)
        assertEquals(PaymentStatus.PAID, full.statusAfter)
    }

    @Test
    fun paidThresholdUsesTheExistingMoneyEpsilon() {
        val eps = CarSaleCommissionPaymentLogic.MONEY_EPS
        // Just inside the epsilon still counts as PAID, exactly like paymentStatus().
        val almost = CommissionPaymentSafety.verifyAdd(100.0, listOf(60.0), 40.0 - eps / 2, day)
        assertTrue(almost.allowed)
        assertEquals(PaymentStatus.PAID, almost.statusAfter)
        assertEquals(CarSaleCommissionPaymentLogic.paymentStatus(100.0, almost.totalPaidAfter), almost.statusAfter)
        // Over the remaining by more than epsilon is rejected with the existing Hebrew message.
        val over = CommissionPaymentSafety.verifyAdd(100.0, listOf(60.0), 40.0 + eps * 10, day)
        assertFalse(over.allowed)
        assertEquals(
            (CarSaleCommissionPaymentLogic.validatePaymentAmount(40.0 + eps * 10, 100.0, 60.0)
                as CarSaleCommissionPaymentLogic.ValidationResult.Error).messageHe,
            over.rejectionMessageHe
        )
        assertEquals(PaymentStatus.PARTIAL, over.statusAfter) // unchanged by a rejected add
        assertEquals(60.0, over.totalPaidAfter, 0.0)
    }

    @Test
    fun noCommissionSalesAcceptNoPayments() {
        val v = CommissionPaymentSafety.verifyAdd(0.0, emptyList(), 10.0, day)
        assertFalse(v.allowed)
        assertEquals(PaymentStatus.NO_COMMISSION, v.statusBefore)
        assertEquals("אין עמלה לתשלום", v.rejectionMessageHe)
    }

    @Test
    fun invalidAmountAndDateAreRejectedByTheExistingValidators() {
        assertFalse(CommissionPaymentSafety.verifyAdd(100.0, emptyList(), null, day).allowed)
        assertFalse(CommissionPaymentSafety.verifyAdd(100.0, emptyList(), 0.0, day).allowed)
        assertFalse(CommissionPaymentSafety.verifyAdd(100.0, emptyList(), -1.0, day).allowed)
        assertFalse(CommissionPaymentSafety.verifyAdd(100.0, emptyList(), 10.0, null).allowed)
        assertFalse(CommissionPaymentSafety.verifyAdd(100.0, emptyList(), 10.0, 0L).allowed)
    }

    @Test
    fun theHelperDelegatesToCommissionLogicAndAddsNoFormulaOfItsOwn() {
        // Existing CommissionCalculator output feeds the sale's commission total; the helper only
        // classifies payments against that number.
        val commission = CommissionCalculator.calculate(days = 3, price = 1000.0).amount
        val first = CommissionPaymentSafety.verifyAdd(commission, emptyList(), commission / 2, day)
        assertEquals(CarSaleCommissionPaymentLogic.paymentStatus(commission, commission / 2), first.statusAfter)
        assertEquals(CarSaleCommissionPaymentLogic.remaining(commission, commission / 2), first.remainingAfter, 0.0)
        assertEquals(CarSaleCommissionPaymentLogic.totals(commission, listOf(commission / 2)).remaining, first.remainingAfter, 0.0)
    }

    // ---- gated commit ----

    private fun saleFixture(commission: Double = 1000.0, gateOpen: Boolean = true): Pair<AgentDevWriteFixture, Long> {
        val fx = AgentDevWriteFixture(gateOpen = gateOpen)
        return fx to fx.ports.seedCarSale(fx.uid, commission)
    }

    @Test
    fun paymentsAdvanceUnpaidPartialPaidAndOverpaymentIsRejected() {
        val (fx, saleId) = saleFixture(1000.0)
        val first = fx.run(op, params(saleId, 400, day))
        assertEquals(CommandOutcome.ROOM_COMMITTED, first.outcome)
        assertTrue(first.developmentOnly)
        assertFalse(first.productionWritePerformed)
        assertEquals("CarSaleCommissionPayment", first.committedEntityType)
        val p1 = fx.ports.commissionPayments.single()
        assertEquals(400.0, p1.amount, 0.0)
        assertEquals(fx.uid, p1.userUid)

        val second = fx.run(op, params(saleId, 600, day + 1))
        assertEquals(CommandOutcome.ROOM_COMMITTED, second.outcome)
        assertEquals(2, fx.ports.commissionPayments.size)

        val over = fx.run(op, params(saleId, 1, day + 2))
        assertEquals(CommandOutcome.REJECTED, over.outcome)
        assertEquals(AgentErrorCode.VALIDATION_FAILED, over.error?.code)
        assertEquals("PAID", over.error!!.details["statusBefore"])
        assertEquals(2, fx.ports.commissionPayments.size)
    }

    @Test
    fun overpaymentIsRejectedBeforeAnyInsert() {
        val (fx, saleId) = saleFixture(1000.0)
        val receipt = fx.run(op, params(saleId, 1000.01 + 1))
        assertEquals(AgentErrorCode.VALIDATION_FAILED, receipt.error?.code)
        assertTrue(fx.ports.commissionPayments.isEmpty())
        assertEquals(0, fx.ports.writeCalls)
    }

    @Test
    fun theCommitDoesNotModifyTheSaleItself() {
        val (fx, saleId) = saleFixture(1000.0)
        val before = fx.ports.carSales.single()
        fx.run(op, params(saleId, 250))
        assertEquals(before, fx.ports.carSales.single())
    }

    @Test
    fun receiptDetailsReportStatusTransitionsInTheCommittedResult() {
        val (fx, saleId) = saleFixture(1000.0)
        val prepared = fx.prepared(op, params(saleId, 1000))
        val result = fx.committer.commit(prepared.command)
        result as com.rentacar.app.agentapi.commands.RoomWriteResult.Committed
        assertEquals("UNPAID", result.details["statusBefore"])
        assertEquals("PAID", result.details["statusAfter"])
        assertEquals(0.0, result.details["remainingAfter"] as Double, 0.0)
    }

    @Test
    fun unknownOrForeignSalesAreNotFound() {
        val (fx, _) = saleFixture()
        assertEquals(AgentErrorCode.NOT_FOUND, fx.run(op, params(424242, 10)).error?.code)
        val foreign = fx.ports.seedCarSale("someone-else", 500.0)
        assertEquals(AgentErrorCode.NOT_FOUND, fx.run(op, params(foreign, 10)).error?.code)
        assertTrue(fx.ports.commissionPayments.isEmpty())
    }

    @Test
    fun saleWithoutCommissionRejectsPayments() {
        val (fx, saleId) = saleFixture(0.0)
        val receipt = fx.run(op, params(saleId, 10))
        assertEquals(AgentErrorCode.VALIDATION_FAILED, receipt.error?.code)
        assertEquals("NO_COMMISSION", receipt.error!!.details["statusBefore"])
        assertTrue(fx.ports.commissionPayments.isEmpty())
    }

    // ---- duplicate submission ----

    @Test
    fun duplicatePaymentSubmissionIsRejectedByCommandHashAndInsertsOnce() {
        val (fx, saleId) = saleFixture(1000.0)
        assertEquals(CommandOutcome.ROOM_COMMITTED, fx.run(op, params(saleId, 100)).outcome)
        val dup = fx.run(op, params(saleId, 100))
        assertEquals(CommandOutcome.REJECTED, dup.outcome)
        assertEquals(AgentErrorCode.CONFLICT, dup.error?.code)
        assertEquals(1, fx.ports.commissionPayments.size)
        assertNotNull(dup.error!!.details["entityId"])
    }

    @Test
    fun duplicateWithADifferentIdempotencyKeyIsStillRejected() {
        val (fx, saleId) = saleFixture(1000.0)
        fx.run(op, params(saleId, 100), idempotencyKey = "pay-1")
        val dup = fx.run(op, params(saleId, 100), idempotencyKey = "pay-2")
        assertEquals(AgentErrorCode.CONFLICT, dup.error?.code)
        assertEquals(1, fx.ports.commissionPayments.size)
    }

    @Test
    fun retryWithTheSameIdempotencyKeyReplaysInsteadOfPayingTwice() {
        val (fx, saleId) = saleFixture(1000.0)
        val a = fx.run(op, params(saleId, 100), idempotencyKey = "pay-1")
        val b = fx.run(op, params(saleId, 100), idempotencyKey = "pay-1")
        assertTrue(b.idempotentReplay)
        assertEquals(a.committedEntityId, b.committedEntityId)
        assertEquals(1, fx.ports.commissionPayments.size)
        assertEquals(100.0, fx.ports.commissionPayments.single().amount, 0.0)
    }

    @Test
    fun persistedDuplicateIsRejectedEvenAfterTheInMemoryLedgerIsLost() {
        val (fx, saleId) = saleFixture(1000.0)
        fx.run(op, params(saleId, 100))
        // Simulates an app restart: fresh committer (empty ledger) over the same stored rows.
        val restarted = AgentDevRoomWriteCommitter(fx.ports, gate = { true })
        val command = fx.prepared(op, params(saleId, 100)).command
        val result = restarted.commit(command) as com.rentacar.app.agentapi.commands.RoomWriteResult.Rejected
        assertEquals(AgentErrorCode.CONFLICT, result.code)
        assertEquals(1, fx.ports.commissionPayments.size)
    }

    @Test
    fun differentAmountOrDateOnTheSameSaleIsNotADuplicate() {
        val (fx, saleId) = saleFixture(1000.0)
        fx.run(op, params(saleId, 100, day))
        assertEquals(CommandOutcome.ROOM_COMMITTED, fx.run(op, params(saleId, 150, day)).outcome)
        assertEquals(CommandOutcome.ROOM_COMMITTED, fx.run(op, params(saleId, 100, day + 86_400_000)).outcome)
        assertEquals(3, fx.ports.commissionPayments.size)
    }

    // ---- production stays disabled ----

    @Test
    fun closedGateNeverWritesAPayment() {
        val (fx, saleId) = saleFixture(1000.0, gateOpen = false)
        val receipt = fx.run(op, params(saleId, 100))
        assertEquals(AgentErrorCode.WRITE_DISABLED, receipt.error?.code)
        assertFalse(receipt.developmentOnly)
        assertFalse(receipt.productionWritePerformed)
        assertTrue(fx.ports.commissionPayments.isEmpty())
        assertEquals(0, fx.ports.writeCalls)
        assertNull(receipt.committedEntityId)
    }
}
