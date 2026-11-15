package com.rentacar.app.agentapi.commands

/** Lenient-but-strict numeric extraction for JSON-ish parameter maps (Int/Long/Double all arrive here). */
internal object CommandParams {
    /** Integral, finite [Number] as Long, or null. Strings are never coerced. */
    fun asLong(value: Any?): Long? {
        val n = value as? Number ?: return null
        val d = n.toDouble()
        if (d.isNaN() || d.isInfinite() || d % 1.0 != 0.0) return null
        if (d > Long.MAX_VALUE.toDouble() || d < Long.MIN_VALUE.toDouble()) return null
        return n.toLong()
    }

    fun asInt(value: Any?): Int? = asLong(value)?.takeIf { it in Int.MIN_VALUE..Int.MAX_VALUE }?.toInt()

    /** Finite [Number] as Double, or null. */
    fun asDouble(value: Any?): Double? {
        val n = value as? Number ?: return null
        val d = n.toDouble()
        return d.takeUnless { it.isNaN() || it.isInfinite() }
    }
}

/**
 * AGENT-113: pure validators for `reservation.create` / `reservation.update`.
 * They never touch storage; existence checks (customer, supplier, branch, car type, reservation)
 * happen at commit time inside [AgentDevRoomWriteCommitter].
 *
 * Deliberately NOT accepted: `status`, `isClosed`, `actualReturnDate` and `commissionPercentUsed`
 * (financial/lifecycle fields owned by existing app logic - the agent API does not invent them),
 * plus `userUid`/`id`/timestamps (identity and bookkeeping are server-side).
 */
object ReservationCommandValidator {
    const val MAX_TEXT_LENGTH = 200
    const val MAX_NOTES_LENGTH = 2000
    val ALLOWED_PERIOD_TYPE_DAYS: Set<Int> = setOf(1, 7, 24, 30)
    private const val ENVELOPE_KEY = "idempotencyKey"

    val CREATE_REQUIRED_IDS = listOf("customerId", "supplierId", "branchId", "carTypeId")
    private val dateFields = listOf("dateFrom", "dateTo")
    private val textFields = mapOf(
        "carTypeName" to MAX_TEXT_LENGTH,
        "supplierOrderNumber" to MAX_TEXT_LENGTH,
        "externalContractNumber" to MAX_TEXT_LENGTH,
        "notes" to MAX_NOTES_LENGTH
    )
    private val booleanFields = listOf("includeVat", "airportMode", "isQuote")

    private val createAllowed: Set<String> =
        CREATE_REQUIRED_IDS.toSet() + dateFields + textFields.keys + booleanFields +
            setOf("agreedPrice", "kmIncluded", "requiredHoldAmount", "vatPercentAtCreation", "periodTypeDays", ENVELOPE_KEY)

    /** Update cannot re-parent a reservation (customerId/supplierId are immutable through the agent API). */
    val UPDATE_MUTABLE_FIELDS: Set<String> =
        setOf("branchId", "carTypeId") + dateFields + textFields.keys + booleanFields +
            setOf("agreedPrice", "kmIncluded", "requiredHoldAmount", "vatPercentAtCreation", "periodTypeDays")
    private val updateAllowed: Set<String> = UPDATE_MUTABLE_FIELDS + setOf("reservationId", ENVELOPE_KEY)

    fun validateCreate(params: Map<String, Any?>): List<String> {
        val problems = mutableListOf<String>()
        unknown(params, createAllowed, problems)
        CREATE_REQUIRED_IDS.forEach { positiveId(params, it, true, problems) }
        dateFields.forEach { epoch(params, it, true, problems) }
        checkDateOrder(params["dateFrom"], params["dateTo"], problems)
        money(params, "agreedPrice", true, problems)
        wholeNumber(params, "kmIncluded", true, problems)
        wholeNumber(params, "requiredHoldAmount", true, problems)
        commonOptional(params, problems)
        return problems
    }

    fun validateUpdate(params: Map<String, Any?>): List<String> {
        val problems = mutableListOf<String>()
        unknown(params, updateAllowed, problems)
        positiveId(params, "reservationId", true, problems)
        if (params.keys.none { it in UPDATE_MUTABLE_FIELDS }) {
            problems += "at least one updatable field is required: ${UPDATE_MUTABLE_FIELDS.sorted().joinToString()}"
        }
        positiveId(params, "branchId", false, problems)
        positiveId(params, "carTypeId", false, problems)
        dateFields.forEach { epoch(params, it, false, problems) }
        checkDateOrder(params["dateFrom"], params["dateTo"], problems)
        money(params, "agreedPrice", false, problems)
        wholeNumber(params, "kmIncluded", false, problems)
        wholeNumber(params, "requiredHoldAmount", false, problems)
        commonOptional(params, problems)
        return problems
    }

    /** Create: trims text, drops blank optionals and the envelope key; numbers become Long/Double. */
    fun normalizeCreate(params: Map<String, Any?>): Map<String, Any?> = normalize(params, createAllowed, clearBlank = false)

    /** Update: blank text means "clear this field" (kept as ""). */
    fun normalizeUpdate(params: Map<String, Any?>): Map<String, Any?> =
        normalize(params, updateAllowed + "reservationId", clearBlank = true)

    /** Used at commit time when only one of the dates is changed. */
    fun datesConsistent(dateFrom: Long, dateTo: Long): Boolean = dateTo > dateFrom

    // ---- internals ----

    private fun unknown(params: Map<String, Any?>, allowed: Set<String>, problems: MutableList<String>) {
        params.keys.filterNot { it in allowed }.sorted().takeIf { it.isNotEmpty() }?.let {
            problems += "unknown parameters: ${it.joinToString()}"
        }
    }

    private fun positiveId(params: Map<String, Any?>, key: String, required: Boolean, problems: MutableList<String>) {
        if (!params.containsKey(key) || params[key] == null) {
            if (required) problems += "$key is required"
            return
        }
        val v = CommandParams.asLong(params[key])
        if (v == null) problems += "$key must be a whole number" else if (v <= 0L) problems += "$key must be positive"
    }

    private fun epoch(params: Map<String, Any?>, key: String, required: Boolean, problems: MutableList<String>) {
        if (!params.containsKey(key) || params[key] == null) {
            if (required) problems += "$key is required"
            return
        }
        val v = CommandParams.asLong(params[key])
        if (v == null) problems += "$key must be epoch milliseconds" else if (v <= 0L) problems += "$key must be a valid date"
    }

    private fun checkDateOrder(from: Any?, to: Any?, problems: MutableList<String>) {
        val f = CommandParams.asLong(from)
        val t = CommandParams.asLong(to)
        if (f != null && t != null && f > 0 && t > 0 && !datesConsistent(f, t)) {
            problems += "dateTo must be after dateFrom"
        }
    }

    private fun money(params: Map<String, Any?>, key: String, required: Boolean, problems: MutableList<String>) {
        if (!params.containsKey(key) || params[key] == null) {
            if (required) problems += "$key is required"
            return
        }
        val v = CommandParams.asDouble(params[key])
        if (v == null) problems += "$key must be a number" else if (v < 0.0) problems += "$key cannot be negative"
    }

    private fun wholeNumber(params: Map<String, Any?>, key: String, required: Boolean, problems: MutableList<String>) {
        if (!params.containsKey(key) || params[key] == null) {
            if (required) problems += "$key is required"
            return
        }
        val v = CommandParams.asInt(params[key])
        if (v == null) problems += "$key must be a whole number" else if (v < 0) problems += "$key cannot be negative"
    }

    private fun commonOptional(params: Map<String, Any?>, problems: MutableList<String>) {
        textFields.forEach { (key, max) ->
            val value = params[key] ?: return@forEach
            when {
                value !is String -> problems += "$key must be a string"
                value.trim().length > max -> problems += "$key must be at most $max characters"
                key != "notes" && value.any { it.isISOControl() } -> problems += "$key contains control characters"
                key == "notes" && value.any { it.isISOControl() && it != '\n' && it != '\r' && it != '\t' } ->
                    problems += "$key contains control characters"
            }
        }
        booleanFields.forEach { key ->
            val value = params[key]
            if (value != null && value !is Boolean) problems += "$key must be a boolean"
        }
        params["vatPercentAtCreation"]?.let {
            val v = CommandParams.asDouble(it)
            if (v == null) problems += "vatPercentAtCreation must be a number"
            else if (v < 0.0 || v > 100.0) problems += "vatPercentAtCreation must be between 0 and 100"
        }
        params["periodTypeDays"]?.let {
            val v = CommandParams.asInt(it)
            if (v == null || v !in ALLOWED_PERIOD_TYPE_DAYS) {
                problems += "periodTypeDays must be one of ${ALLOWED_PERIOD_TYPE_DAYS.sorted().joinToString()}"
            }
        }
    }

    private val longKeys = setOf("customerId", "supplierId", "branchId", "carTypeId", "reservationId", "dateFrom", "dateTo")
    private val intKeys = setOf("kmIncluded", "requiredHoldAmount", "periodTypeDays")
    private val doubleKeys = setOf("agreedPrice", "vatPercentAtCreation")

    private fun normalize(params: Map<String, Any?>, allowed: Set<String>, clearBlank: Boolean): Map<String, Any?> {
        val out = linkedMapOf<String, Any?>()
        allowed.sorted().forEach { key ->
            if (key == ENVELOPE_KEY) return@forEach
            val value = params[key] ?: return@forEach
            when {
                key in longKeys -> CommandParams.asLong(value)?.let { out[key] = it }
                key in intKeys -> CommandParams.asInt(value)?.let { out[key] = it }
                key in doubleKeys -> CommandParams.asDouble(value)?.let { out[key] = it }
                value is Boolean -> out[key] = value
                value is String -> {
                    val trimmed = value.trim()
                    if (trimmed.isNotEmpty() || clearBlank) out[key] = trimmed
                }
            }
        }
        return out
    }
}

/** AGENT-113: PREPARE + PREVIEW specs for the reservation write workflows. */
object ReservationWriteSpecs {
    const val RESERVATION_CREATE = "reservation.create"
    const val RESERVATION_UPDATE = "reservation.update"

    fun reservationCreate(): WriteCommandSpec = WriteCommandSpec(
        operationId = RESERVATION_CREATE,
        risk = CommandRisk.HARD,
        validate = ReservationCommandValidator::validateCreate,
        preview = { params ->
            ReservationCommandValidator.normalizeCreate(params).map { (k, v) ->
                PreviewChange("Reservation", k, null, v.toString(), "Set Reservation.$k on a new Reservation (status Draft)")
            }
        },
        normalize = ReservationCommandValidator::normalizeCreate
    )

    fun reservationUpdate(): WriteCommandSpec = WriteCommandSpec(
        operationId = RESERVATION_UPDATE,
        risk = CommandRisk.HARD,
        validate = ReservationCommandValidator::validateUpdate,
        preview = { params ->
            val normalized = ReservationCommandValidator.normalizeUpdate(params)
            val id = normalized["reservationId"]
            normalized.filterKeys { it != "reservationId" }.map { (k, v) ->
                PreviewChange(
                    "Reservation", k, null, v.toString().ifEmpty { "(cleared)" },
                    "Update Reservation#$id.$k (current value is read at commit time)"
                )
            }
        },
        normalize = ReservationCommandValidator::normalizeUpdate
    )

    fun all(): List<WriteCommandSpec> = listOf(reservationCreate(), reservationUpdate())
}
