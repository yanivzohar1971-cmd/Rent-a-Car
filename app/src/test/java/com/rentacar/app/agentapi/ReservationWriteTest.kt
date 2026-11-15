package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.commands.CommandOutcome
import com.rentacar.app.agentapi.commands.CommandPhase
import com.rentacar.app.agentapi.commands.CommandPrepareOutcome
import com.rentacar.app.agentapi.commands.ReservationCommandValidator
import com.rentacar.app.agentapi.commands.ReservationWriteSpecs
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.data.ReservationStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** AGENT-113: reservation.create / reservation.update validation + AgentDev-gated commit. */
class ReservationWriteTest {
    private val from = 1_800_000_000_000L
    private val to = from + 3 * 86_400_000L

    private fun createParams(
        customerId: Long, supplierId: Long, branchId: Long, carTypeId: Long
    ): Map<String, Any?> = mapOf(
        "customerId" to customerId, "supplierId" to supplierId, "branchId" to branchId, "carTypeId" to carTypeId,
        "dateFrom" to from, "dateTo" to to,
        "agreedPrice" to 450.5, "kmIncluded" to 300, "requiredHoldAmount" to 2000
    )

    private val validCreate = createParams(1, 2, 3, 4)

    private class Seeded(val fx: AgentDevWriteFixture) {
        val customerId = fx.ports.seedCustomer(fx.uid)
        val supplierId = fx.ports.seedSupplier(fx.uid)
        val branchId = fx.ports.seedBranch(supplierId)
        val carTypeId = fx.ports.seedCarType()
        fun create() = mapOf<String, Any?>(
            "customerId" to customerId, "supplierId" to supplierId, "branchId" to branchId, "carTypeId" to carTypeId,
            "dateFrom" to 1_800_000_000_000L, "dateTo" to 1_800_000_000_000L + 3 * 86_400_000L,
            "agreedPrice" to 450.5, "kmIncluded" to 300, "requiredHoldAmount" to 2000
        )
    }

    // ---- pure validation ----

    @Test
    fun operationIdsAreRegisteredWriteOperationsFromTheCatalog() {
        val fx = AgentDevWriteFixture()
        listOf(ReservationWriteSpecs.RESERVATION_CREATE, ReservationWriteSpecs.RESERVATION_UPDATE).forEach {
            assertEquals(it, "WRITE", fx.registry.get(it)!!.readOrWrite.name)
        }
        assertEquals(listOf("reservation.create", "reservation.update"), ReservationWriteSpecs.all().map { it.operationId })
    }

    @Test
    fun validCreateHasNoProblems() {
        assertTrue(ReservationCommandValidator.validateCreate(validCreate).isEmpty())
        // JSON numbers arrive as Double/Int: whole numbers are accepted.
        assertTrue(ReservationCommandValidator.validateCreate(validCreate + ("customerId" to 1.0) + ("kmIncluded" to 300L)).isEmpty())
    }

    @Test
    fun createRequiresEveryReferenceDateAndAmount() {
        listOf("customerId", "supplierId", "branchId", "carTypeId", "dateFrom", "dateTo", "agreedPrice", "kmIncluded", "requiredHoldAmount")
            .forEach { key ->
                val problems = ReservationCommandValidator.validateCreate(validCreate - key)
                assertTrue(key, problems.contains("$key is required"))
            }
    }

    @Test
    fun createRejectsBadIdsAndDoesNotCoerceStrings() {
        assertTrue(ReservationCommandValidator.validateCreate(validCreate + ("customerId" to 0)).contains("customerId must be positive"))
        assertTrue(ReservationCommandValidator.validateCreate(validCreate + ("supplierId" to -5)).contains("supplierId must be positive"))
        assertTrue(ReservationCommandValidator.validateCreate(validCreate + ("branchId" to "3")).contains("branchId must be a whole number"))
        assertTrue(ReservationCommandValidator.validateCreate(validCreate + ("carTypeId" to 1.5)).contains("carTypeId must be a whole number"))
    }

    @Test
    fun createValidatesDates() {
        assertTrue(ReservationCommandValidator.validateCreate(validCreate + ("dateTo" to from)).contains("dateTo must be after dateFrom"))
        assertTrue(ReservationCommandValidator.validateCreate(validCreate + ("dateTo" to from - 1)).contains("dateTo must be after dateFrom"))
        assertTrue(ReservationCommandValidator.validateCreate(validCreate + ("dateFrom" to 0)).contains("dateFrom must be a valid date"))
        assertTrue(ReservationCommandValidator.validateCreate(validCreate + ("dateFrom" to "2026-01-01")).contains("dateFrom must be epoch milliseconds"))
    }

    @Test
    fun createValidatesAmountsAndOptionalFields() {
        assertTrue(ReservationCommandValidator.validateCreate(validCreate + ("agreedPrice" to -1)).contains("agreedPrice cannot be negative"))
        assertTrue(ReservationCommandValidator.validateCreate(validCreate + ("agreedPrice" to Double.NaN)).contains("agreedPrice must be a number"))
        assertTrue(ReservationCommandValidator.validateCreate(validCreate + ("kmIncluded" to -1)).contains("kmIncluded cannot be negative"))
        assertTrue(ReservationCommandValidator.validateCreate(validCreate + ("periodTypeDays" to 5)).any { it.startsWith("periodTypeDays must be one of") })
        assertTrue(ReservationCommandValidator.validateCreate(validCreate + ("periodTypeDays" to 7)).isEmpty())
        assertTrue(ReservationCommandValidator.validateCreate(validCreate + ("vatPercentAtCreation" to 120)).any { it.contains("between 0 and 100") })
        assertTrue(ReservationCommandValidator.validateCreate(validCreate + ("airportMode" to "yes")).contains("airportMode must be a boolean"))
        assertTrue(ReservationCommandValidator.validateCreate(validCreate + ("notes" to "x".repeat(2001))).any { it.contains("notes must be at most") })
        assertTrue(ReservationCommandValidator.validateCreate(validCreate + ("supplierOrderNumber" to "a\u0000b")).any { it.contains("control characters") })
    }

    @Test
    fun lifecycleFinancialAndIdentityFieldsAreNotAccepted() {
        listOf("status", "isClosed", "actualReturnDate", "commissionPercentUsed", "userUid", "id", "createdAt", "agentId", "customerTerms")
            .forEach { key ->
                val problems = ReservationCommandValidator.validateCreate(validCreate + (key to 1))
                assertTrue(key, problems.any { it.startsWith("unknown parameters") && it.contains(key) })
            }
    }

    @Test
    fun updateNeedsReservationIdAndAtLeastOneMutableField() {
        assertTrue(ReservationCommandValidator.validateUpdate(mapOf("agreedPrice" to 1)).contains("reservationId is required"))
        assertTrue(ReservationCommandValidator.validateUpdate(mapOf("reservationId" to 5)).any { it.startsWith("at least one updatable field") })
        assertTrue(ReservationCommandValidator.validateUpdate(mapOf("reservationId" to 5, "notes" to "ok")).isEmpty())
        assertTrue(ReservationCommandValidator.validateUpdate(mapOf("reservationId" to 5, "dateFrom" to to, "dateTo" to from)).contains("dateTo must be after dateFrom"))
        assertTrue(ReservationCommandValidator.validateUpdate(mapOf("reservationId" to 5, "agreedPrice" to -3)).contains("agreedPrice cannot be negative"))
    }

    @Test
    fun updateCannotReparentOrChangeLifecycleFields() {
        listOf("customerId", "supplierId", "status", "isClosed", "commissionPercentUsed").forEach { key ->
            val problems = ReservationCommandValidator.validateUpdate(mapOf("reservationId" to 5, "notes" to "x", key to 1))
            assertTrue(key, problems.any { it.startsWith("unknown parameters") && it.contains(key) })
        }
    }

    @Test
    fun normalizationTrimsTextAndCanonicalizesNumbers() {
        val n = ReservationCommandValidator.normalizeCreate(
            validCreate + mapOf("notes" to "  hi  ", "supplierOrderNumber" to "   ", "customerId" to 1.0, "idempotencyKey" to "k")
        )
        assertEquals("hi", n["notes"])
        assertFalse(n.containsKey("supplierOrderNumber"))
        assertFalse(n.containsKey("idempotencyKey"))
        assertEquals(1L, n["customerId"])
        assertEquals(300, n["kmIncluded"])
        // Update keeps blank text as an explicit "clear".
        val u = ReservationCommandValidator.normalizeUpdate(mapOf("reservationId" to 5, "notes" to "  "))
        assertEquals("", u["notes"])
    }

    // ---- pipeline prepare/preview ----

    @Test
    fun prepareValidatesThroughThePipelineAndNeverWrites() {
        val fx = AgentDevWriteFixture()
        val bad = fx.prepare("reservation.create", validCreate - "customerId") as CommandPrepareOutcome.Rejected
        assertEquals(CommandPhase.VALIDATE, bad.receipt.phase)
        assertEquals(AgentErrorCode.VALIDATION_FAILED, bad.receipt.error?.code)

        val ok = fx.prepared("reservation.create", validCreate)
        assertEquals(com.rentacar.app.agentapi.commands.CommandRisk.HARD, ok.command.risk)
        assertTrue(ok.preview.changes.any { it.field == "agreedPrice" && it.after == "450.5" })
        assertTrue(ok.preview.warnings.any { it.contains("no data has been changed") })
        assertEquals(0, fx.ports.writeCalls)
    }

    // ---- gated commit: create ----

    @Test
    fun createCommitsADraftReservationWithoutInventingCommission() {
        val fx = AgentDevWriteFixture()
        val s = Seeded(fx)
        val receipt = fx.run("reservation.create", s.create() + mapOf("notes" to " VIP ", "isQuote" to true, "periodTypeDays" to 7))

        assertEquals(CommandOutcome.ROOM_COMMITTED, receipt.outcome)
        assertTrue(receipt.developmentOnly)
        assertFalse(receipt.productionWritePerformed)
        assertEquals("Reservation", receipt.committedEntityType)
        val r = fx.ports.reservations.single()
        assertEquals(ReservationStatus.Draft, r.status)
        assertNull(r.commissionPercentUsed)
        assertFalse(r.isClosed)
        assertEquals("VIP", r.notes)
        assertTrue(r.isQuote)
        assertEquals(7, r.periodTypeDays)
        assertEquals(450.5, r.agreedPrice, 0.0)
        assertEquals(fx.uid, r.userUid)
        assertEquals(s.customerId, r.customerId)
    }

    @Test
    fun createRejectsMissingReferencesAtCommitAndWritesNothing() {
        val fx = AgentDevWriteFixture()
        val s = Seeded(fx)
        listOf(
            "customerId" to 9_999L, "supplierId" to 9_999L, "branchId" to 9_999L, "carTypeId" to 9_999L
        ).forEach { (key, bad) ->
            val receipt = fx.run("reservation.create", s.create() + (key to bad))
            assertEquals(key, AgentErrorCode.NOT_FOUND, receipt.error?.code)
        }
        assertTrue(fx.ports.reservations.isEmpty())
    }

    @Test
    fun createRejectsABranchOfAnotherSupplier() {
        val fx = AgentDevWriteFixture()
        val s = Seeded(fx)
        val otherSupplier = fx.ports.seedSupplier(fx.uid, "Other")
        val foreignBranch = fx.ports.seedBranch(otherSupplier)
        val receipt = fx.run("reservation.create", s.create() + ("branchId" to foreignBranch))
        assertEquals(AgentErrorCode.NOT_FOUND, receipt.error?.code)
        assertTrue(receipt.error!!.message.contains("branch does not belong"))
        assertTrue(fx.ports.reservations.isEmpty())
    }

    @Test
    fun createCannotReferenceAnotherUsersCustomer() {
        val fx = AgentDevWriteFixture()
        val s = Seeded(fx)
        val foreignCustomer = fx.ports.seedCustomer("someone-else")
        val receipt = fx.run("reservation.create", s.create() + ("customerId" to foreignCustomer))
        assertEquals(AgentErrorCode.NOT_FOUND, receipt.error?.code)
    }

    @Test
    fun createIsIdempotentForTheSameKeyAndRejectsHashDuplicates() {
        val fx = AgentDevWriteFixture()
        val s = Seeded(fx)
        val a = fx.run("reservation.create", s.create(), idempotencyKey = "res-1")
        val b = fx.run("reservation.create", s.create(), idempotencyKey = "res-1")
        assertTrue(b.idempotentReplay)
        assertEquals(a.committedEntityId, b.committedEntityId)
        assertEquals(1, fx.ports.reservations.size)

        // The same content without (or with another) key is a duplicate by command hash.
        assertEquals(AgentErrorCode.CONFLICT, fx.run("reservation.create", s.create()).error?.code)
        assertEquals(AgentErrorCode.CONFLICT, fx.run("reservation.create", s.create(), idempotencyKey = "res-2").error?.code)
        assertEquals(1, fx.ports.reservations.size)
    }

    // ---- gated commit: update ----

    private fun created(fx: AgentDevWriteFixture, s: Seeded): Long {
        val receipt = fx.run("reservation.create", s.create() + ("notes" to "orig"))
        return receipt.committedEntityId!!
    }

    @Test
    fun updateMergesOnlyTheProvidedFieldsAndKeepsParents() {
        val fx = AgentDevWriteFixture()
        val s = Seeded(fx)
        val id = created(fx, s)
        fx.now += 5_000
        val receipt = fx.run("reservation.update", mapOf("reservationId" to id, "agreedPrice" to 500, "kmIncluded" to 450))

        assertEquals(CommandOutcome.ROOM_COMMITTED, receipt.outcome)
        val r = fx.ports.reservations.single()
        assertEquals(500.0, r.agreedPrice, 0.0)
        assertEquals(450, r.kmIncluded)
        assertEquals("orig", r.notes)
        assertEquals(s.customerId, r.customerId)
        assertEquals(s.supplierId, r.supplierId)
        assertEquals(ReservationStatus.Draft, r.status)
        assertNull(r.commissionPercentUsed)
        assertEquals(fx.now, r.updatedAt)
    }

    @Test
    fun updateCanClearTextWithABlankValue() {
        val fx = AgentDevWriteFixture()
        val s = Seeded(fx)
        val id = created(fx, s)
        fx.run("reservation.update", mapOf("reservationId" to id, "notes" to "   "))
        assertNull(fx.ports.reservations.single().notes)
    }

    @Test
    fun updateChecksDatesAgainstTheStoredReservation() {
        val fx = AgentDevWriteFixture()
        val s = Seeded(fx)
        val id = created(fx, s)
        val stored = fx.ports.reservations.single()
        // Valid on its own (only dateFrom), but later than the stored dateTo.
        val receipt = fx.run("reservation.update", mapOf("reservationId" to id, "dateFrom" to stored.dateTo + 1))
        assertEquals(AgentErrorCode.VALIDATION_FAILED, receipt.error?.code)
        assertEquals(stored, fx.ports.reservations.single())
    }

    @Test
    fun updateRejectsUnknownAndClosedReservations() {
        val fx = AgentDevWriteFixture()
        val s = Seeded(fx)
        assertEquals(AgentErrorCode.NOT_FOUND, fx.run("reservation.update", mapOf("reservationId" to 777, "notes" to "x")).error?.code)

        val id = created(fx, s)
        fx.ports.reservations[0] = fx.ports.reservations[0].copy(isClosed = true)
        val closed = fx.run("reservation.update", mapOf("reservationId" to id, "notes" to "x"))
        assertEquals(AgentErrorCode.CONFLICT, closed.error?.code)
        assertEquals("orig", fx.ports.reservations.single().notes)
    }

    @Test
    fun updateValidatesANewBranchAgainstTheReservationSupplier() {
        val fx = AgentDevWriteFixture()
        val s = Seeded(fx)
        val id = created(fx, s)
        val foreign = fx.ports.seedBranch(fx.ports.seedSupplier(fx.uid, "Other"))
        assertEquals(AgentErrorCode.NOT_FOUND, fx.run("reservation.update", mapOf("reservationId" to id, "branchId" to foreign)).error?.code)
        val sameSupplierBranch = fx.ports.seedBranch(s.supplierId)
        assertEquals(CommandOutcome.ROOM_COMMITTED, fx.run("reservation.update", mapOf("reservationId" to id, "branchId" to sameSupplierBranch)).outcome)
        assertEquals(sameSupplierBranch, fx.ports.reservations.single().branchId)
    }

    // ---- gate ----

    @Test
    fun reservationWritesAreDisabledWhenTheGateIsClosed() {
        val fx = AgentDevWriteFixture(gateOpen = false)
        val s = Seeded(fx)
        val create = fx.run("reservation.create", s.create())
        assertEquals(AgentErrorCode.WRITE_DISABLED, create.error?.code)
        val update = fx.run("reservation.update", mapOf("reservationId" to 1, "notes" to "x"))
        assertEquals(AgentErrorCode.WRITE_DISABLED, update.error?.code)
        assertEquals(0, fx.ports.writeCalls)
        assertTrue(fx.ports.reservations.isEmpty())
    }
}
