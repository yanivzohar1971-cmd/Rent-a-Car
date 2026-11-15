package com.rentacar.app.agentapi.commands

import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.data.CarSaleCommissionPayment
import com.rentacar.app.data.CarSaleCommissionPaymentLogic
import com.rentacar.app.data.Customer
import com.rentacar.app.data.Request
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import com.rentacar.app.data.Supplier
import java.util.concurrent.ConcurrentHashMap

/**
 * AGENT-111/113/114: commits confirmed commands to local Room, AgentDev only.
 *
 * Safety properties:
 *  - Defense in depth: refuses with WRITE_DISABLED unless [gate] is open (default `BuildConfig.AGENT_DEV_MODE`).
 *  - Reuses existing repositories (via [AgentDevWritePorts]) and existing commission logic; no new formulas.
 *  - Idempotency (in-memory, per process, per user - no schema change; see AGENT-111 doc):
 *      * explicit `idempotencyKey`, same command hash  -> original result replayed, nothing written;
 *      * explicit `idempotencyKey`, different hash     -> CONFLICT;
 *      * same command hash committed before (any key)  -> CONFLICT (duplicate), nothing written.
 *  - Only successful commits are recorded, so a rejected/failed command can be corrected and retried.
 */
class AgentDevRoomWriteCommitter(
    private val ports: AgentDevWritePorts,
    private val gate: () -> Boolean = AgentDevWriteGate::roomWritesEnabled,
    private val clock: () -> Long = System::currentTimeMillis
) : RoomWriteCommitter {

    private data class LedgerEntry(val commandHash: String, val result: RoomWriteResult.Committed)

    private val ledger = ConcurrentHashMap<String, LedgerEntry>()
    private val lock = Any()

    /** Number of distinct successful commits remembered by the idempotency ledger. */
    fun committedCount(): Int = ledger.values.toSet().size

    override fun commit(command: PreparedCommand): RoomWriteResult {
        if (!gate()) {
            return RoomWriteResult.Rejected(
                AgentErrorCode.WRITE_DISABLED, "Room writes are disabled outside the AgentDev build",
                mapOf("operation" to command.operationId)
            )
        }
        synchronized(lock) {
            val keyId = keyLedgerId(command)
            val hashId = hashLedgerId(command)
            if (keyId != null) {
                ledger[keyId]?.let { prior ->
                    return if (prior.commandHash == command.commandHash) {
                        prior.result.copy(idempotentReplay = true)
                    } else {
                        RoomWriteResult.Rejected(
                            AgentErrorCode.CONFLICT, "idempotencyKey was already used for a different command"
                        )
                    }
                }
            }
            ledger[hashId]?.let { prior ->
                return RoomWriteResult.Rejected(
                    AgentErrorCode.CONFLICT,
                    "Duplicate command: an identical command was already committed",
                    mapOf("entityType" to prior.result.entityType, "entityId" to prior.result.entityId)
                )
            }
            val result = apply(command)
            if (result is RoomWriteResult.Committed) {
                val entry = LedgerEntry(command.commandHash, result)
                ledger[hashId] = entry
                if (keyId != null) ledger[keyId] = entry
            }
            return result
        }
    }

    private fun keyLedgerId(command: PreparedCommand): String? =
        command.idempotencyKey?.takeIf { it.isNotBlank() }
            ?.let { "${command.userUid}|${command.operationId}|key:$it" }

    private fun hashLedgerId(command: PreparedCommand): String =
        "${command.userUid}|${command.operationId}|hash:${command.commandHash}"

    private fun apply(command: PreparedCommand): RoomWriteResult = when (command.operationId) {
        SandboxWriteSpecs.CUSTOMER_CREATE -> createCustomer(command)
        SandboxWriteSpecs.SUPPLIER_CREATE -> createSupplier(command)
        SandboxWriteSpecs.REQUEST_CREATE -> createRequest(command)
        ReservationWriteSpecs.RESERVATION_CREATE -> createReservation(command)
        ReservationWriteSpecs.RESERVATION_UPDATE -> updateReservation(command)
        CommissionPaymentWriteSpecs.CAR_SALE_COMMISSION_PAYMENT_ADD -> addCommissionPayment(command)
        else -> RoomWriteResult.Rejected(
            AgentErrorCode.WRITE_DISABLED,
            "Operation '${command.operationId}' has no AgentDev Room commit support",
            mapOf("operation" to command.operationId)
        )
    }

    // ---- AGENT-111 ----

    private fun createCustomer(c: PreparedCommand): RoomWriteResult {
        val p = c.parameters
        val id = ports.insertCustomer(
            Customer(
                firstName = p.str("firstName")!!,
                lastName = p.str("lastName")!!,
                phone = p.str("phone")!!,
                email = p.str("email"),
                isCompany = p["isCompany"] as? Boolean ?: false,
                createdAt = clock(),
                updatedAt = clock(),
                userUid = c.userUid
            )
        )
        return committed("Customer", id)
    }

    private fun createSupplier(c: PreparedCommand): RoomWriteResult {
        val p = c.parameters
        val name = p.str("name")!!
        // SupplierDao.upsert would silently UPDATE an existing supplier with the same name; a create must not.
        if (ports.supplierNameExists(name, c.userUid)) {
            return RoomWriteResult.Rejected(AgentErrorCode.CONFLICT, "A supplier with this name already exists")
        }
        val id = ports.insertSupplier(
            Supplier(
                name = name, phone = p.str("phone"), email = p.str("email"),
                address = p.str("address"), taxId = p.str("taxId"), userUid = c.userUid
            )
        )
        return committed("Supplier", id)
    }

    private fun createRequest(c: PreparedCommand): RoomWriteResult {
        val p = c.parameters
        val id = ports.insertRequest(
            Request(
                isPurchase = p["isPurchase"] as? Boolean ?: false,
                isQuote = p["isQuote"] as? Boolean ?: false,
                firstName = p.str("firstName")!!,
                lastName = p.str("lastName")!!,
                phone = p.str("phone")!!,
                carTypeName = p.str("carTypeName")!!,
                createdAt = clock(),
                userUid = c.userUid
            )
        )
        return committed("Request", id)
    }

    // ---- AGENT-113 ----

    private fun createReservation(c: PreparedCommand): RoomWriteResult {
        val p = c.parameters
        val uid = c.userUid
        val customerId = p.long("customerId")!!
        val supplierId = p.long("supplierId")!!
        val branchId = p.long("branchId")!!
        val carTypeId = p.long("carTypeId")!!
        notFound("customerId", ports.customerExists(customerId, uid))?.let { return it }
        notFound("supplierId", ports.supplierExists(supplierId, uid))?.let { return it }
        notFound("branchId", ports.branchBelongsToSupplier(branchId, supplierId, uid), "branch does not belong to the supplier")?.let { return it }
        notFound("carTypeId", ports.carTypeExists(carTypeId, uid))?.let { return it }

        val now = clock()
        val id = ports.insertReservation(
            Reservation(
                customerId = customerId,
                supplierId = supplierId,
                branchId = branchId,
                carTypeId = carTypeId,
                carTypeName = p.str("carTypeName"),
                dateFrom = p.long("dateFrom")!!,
                dateTo = p.long("dateTo")!!,
                includeVat = p["includeVat"] as? Boolean ?: true,
                vatPercentAtCreation = p.double("vatPercentAtCreation"),
                airportMode = p["airportMode"] as? Boolean ?: false,
                agreedPrice = p.double("agreedPrice")!!,
                kmIncluded = p.int("kmIncluded")!!,
                requiredHoldAmount = p.int("requiredHoldAmount")!!,
                periodTypeDays = p.int("periodTypeDays") ?: 1,
                // commissionPercentUsed intentionally left null: commission is computed by existing app logic.
                status = ReservationStatus.Draft,
                supplierOrderNumber = p.str("supplierOrderNumber"),
                externalContractNumber = p.str("externalContractNumber"),
                notes = p.str("notes"),
                isQuote = p["isQuote"] as? Boolean ?: false,
                createdAt = now,
                updatedAt = now,
                userUid = uid
            )
        )
        return committed("Reservation", id)
    }

    private fun updateReservation(c: PreparedCommand): RoomWriteResult {
        val p = c.parameters
        val uid = c.userUid
        val reservationId = p.long("reservationId")!!
        val existing = ports.findReservation(reservationId, uid)
            ?: return RoomWriteResult.Rejected(AgentErrorCode.NOT_FOUND, "Reservation not found")
        if (existing.isClosed) {
            return RoomWriteResult.Rejected(AgentErrorCode.CONFLICT, "Closed reservations cannot be updated")
        }
        val dateFrom = p.long("dateFrom") ?: existing.dateFrom
        val dateTo = p.long("dateTo") ?: existing.dateTo
        if (!ReservationCommandValidator.datesConsistent(dateFrom, dateTo)) {
            return RoomWriteResult.Rejected(AgentErrorCode.VALIDATION_FAILED, "dateTo must be after dateFrom")
        }
        val branchId = p.long("branchId") ?: existing.branchId
        if (p.containsKey("branchId")) {
            notFound("branchId", ports.branchBelongsToSupplier(branchId, existing.supplierId, uid), "branch does not belong to the supplier")?.let { return it }
        }
        val carTypeId = p.long("carTypeId") ?: existing.carTypeId
        if (p.containsKey("carTypeId")) {
            notFound("carTypeId", ports.carTypeExists(carTypeId, uid))?.let { return it }
        }
        fun text(key: String, current: String?): String? =
            if (p.containsKey(key)) p.str(key) else current

        val updated = existing.copy(
            branchId = branchId,
            carTypeId = carTypeId,
            carTypeName = text("carTypeName", existing.carTypeName),
            dateFrom = dateFrom,
            dateTo = dateTo,
            includeVat = p["includeVat"] as? Boolean ?: existing.includeVat,
            vatPercentAtCreation = if (p.containsKey("vatPercentAtCreation")) p.double("vatPercentAtCreation") else existing.vatPercentAtCreation,
            airportMode = p["airportMode"] as? Boolean ?: existing.airportMode,
            agreedPrice = p.double("agreedPrice") ?: existing.agreedPrice,
            kmIncluded = p.int("kmIncluded") ?: existing.kmIncluded,
            requiredHoldAmount = p.int("requiredHoldAmount") ?: existing.requiredHoldAmount,
            periodTypeDays = p.int("periodTypeDays") ?: existing.periodTypeDays,
            supplierOrderNumber = text("supplierOrderNumber", existing.supplierOrderNumber),
            externalContractNumber = text("externalContractNumber", existing.externalContractNumber),
            notes = text("notes", existing.notes),
            isQuote = p["isQuote"] as? Boolean ?: existing.isQuote,
            updatedAt = clock()
        )
        ports.updateReservation(updated)
        return committed("Reservation", reservationId)
    }

    // ---- AGENT-114 ----

    private fun addCommissionPayment(c: PreparedCommand): RoomWriteResult {
        val p = c.parameters
        val uid = c.userUid
        val saleId = p.long("carSaleId")!!
        val amount = p.double("amount")!!
        val date = p.long("paymentDate")!!
        val sale = ports.findCarSale(saleId, uid)
            ?: return RoomWriteResult.Rejected(AgentErrorCode.NOT_FOUND, "Car sale not found")
        val existing = ports.commissionPaymentsForSale(saleId, uid)

        // Persisted duplicate guard (survives restarts, unlike the in-memory ledger).
        if (existing.any { it.paymentDate == date && kotlin.math.abs(it.amount - amount) <= CarSaleCommissionPaymentLogic.MONEY_EPS }) {
            return RoomWriteResult.Rejected(
                AgentErrorCode.CONFLICT, "A commission payment with the same amount and date already exists",
                mapOf("carSaleId" to saleId)
            )
        }
        val check = CommissionPaymentSafety.verifyAdd(sale.commissionPrice, existing.map { it.amount }, amount, date)
        if (!check.allowed) {
            return RoomWriteResult.Rejected(
                AgentErrorCode.VALIDATION_FAILED, check.rejectionMessageHe ?: "Commission payment rejected",
                mapOf("statusBefore" to check.statusBefore.name, "remaining" to check.remainingAfter)
            )
        }
        val now = clock()
        val id = ports.insertCommissionPayment(
            CarSaleCommissionPayment(
                carSaleId = saleId, amount = amount, paymentDate = date,
                createdAt = now, updatedAt = now, userUid = uid
            )
        )
        return committed(
            "CarSaleCommissionPayment", id,
            mapOf(
                "statusBefore" to check.statusBefore.name,
                "statusAfter" to check.statusAfter.name,
                "remainingAfter" to check.remainingAfter
            )
        )
    }

    // ---- helpers ----

    private fun committed(type: String, id: Long, details: Map<String, Any?> = emptyMap()): RoomWriteResult =
        if (id > 0L) RoomWriteResult.Committed(type, id, details = details)
        else RoomWriteResult.Rejected(AgentErrorCode.INTERNAL_ERROR, "Room did not return a row id for $type")

    private fun notFound(field: String, exists: Boolean, message: String = "not found"): RoomWriteResult.Rejected? =
        if (exists) null else RoomWriteResult.Rejected(AgentErrorCode.NOT_FOUND, "$field: $message", mapOf("field" to field))

    private fun Map<String, Any?>.str(key: String): String? = (this[key] as? String)?.takeIf { it.isNotBlank() }
    private fun Map<String, Any?>.long(key: String): Long? = CommandParams.asLong(this[key])
    private fun Map<String, Any?>.int(key: String): Int? = CommandParams.asInt(this[key])
    private fun Map<String, Any?>.double(key: String): Double? = CommandParams.asDouble(this[key])
}
