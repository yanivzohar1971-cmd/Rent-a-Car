package com.rentacar.app.agentapi.commands

/**
 * AGENT-051: first PREPARE + PREVIEW specs for the safest create operations.
 *
 * These specs are pure: validators/normalizers/previewers never touch Room, Firestore or any
 * repository. Committing a prepared command is only possible into [InMemoryCommandSandbox];
 * the catalog write operations stay non-executable on the Agent API allowlist.
 *
 * Parameter schemas are declared here (the catalog `inputSchema` for write operations only
 * lists `confirmationToken`/`idempotencyKey` placeholders), mirroring the Room entity fields.
 * `tzId` and `address` are intentionally not accepted for customers (privacy-minimized, like
 * the read DTOs).
 */
object SandboxWriteSpecs {
    const val CUSTOMER_CREATE = "customer.create"
    const val SUPPLIER_CREATE = "supplier.create"
    const val REQUEST_CREATE = "request.create"

    const val MAX_TEXT_LENGTH = 200
    const val MAX_PHONE_LENGTH = 32

    /** Placeholder keys the catalog declares for every write; they never enter command parameters. */
    private val ENVELOPE_KEYS = setOf("idempotencyKey")

    private class Field(
        val name: String,
        val kind: Kind,
        val required: Boolean,
        val maxLength: Int = MAX_TEXT_LENGTH
    )

    private enum class Kind { TEXT, BOOLEAN }

    private val customerFields = listOf(
        Field("firstName", Kind.TEXT, true),
        Field("lastName", Kind.TEXT, true),
        Field("phone", Kind.TEXT, true, MAX_PHONE_LENGTH),
        Field("email", Kind.TEXT, false),
        Field("isCompany", Kind.BOOLEAN, false)
    )

    private val supplierFields = listOf(
        Field("name", Kind.TEXT, true),
        Field("phone", Kind.TEXT, false, MAX_PHONE_LENGTH),
        Field("email", Kind.TEXT, false),
        Field("address", Kind.TEXT, false),
        Field("taxId", Kind.TEXT, false, MAX_PHONE_LENGTH)
    )

    private val requestFields = listOf(
        Field("firstName", Kind.TEXT, true),
        Field("lastName", Kind.TEXT, true),
        Field("phone", Kind.TEXT, true, MAX_PHONE_LENGTH),
        Field("carTypeName", Kind.TEXT, true),
        Field("isPurchase", Kind.BOOLEAN, false),
        Field("isQuote", Kind.BOOLEAN, false)
    )

    fun customerCreate(): WriteCommandSpec = specFor(CUSTOMER_CREATE, "Customer", CommandRisk.SOFT, customerFields)

    fun supplierCreate(): WriteCommandSpec = specFor(SUPPLIER_CREATE, "Supplier", CommandRisk.SOFT, supplierFields)

    fun requestCreate(): WriteCommandSpec = specFor(REQUEST_CREATE, "Request", CommandRisk.SOFT, requestFields)

    fun all(): List<WriteCommandSpec> = listOf(customerCreate(), supplierCreate(), requestCreate())

    private fun specFor(operationId: String, entity: String, risk: CommandRisk, fields: List<Field>) =
        WriteCommandSpec(
            operationId = operationId,
            risk = risk,
            validate = { params -> validate(params, fields) },
            preview = { params -> preview(entity, normalize(params, fields), fields) },
            normalize = { params -> normalize(params, fields) }
        )

    private fun validate(params: Map<String, Any?>, fields: List<Field>): List<String> {
        val problems = mutableListOf<String>()
        val allowed = fields.map { it.name }.toSet() + ENVELOPE_KEYS
        params.keys.filterNot { it in allowed }.sorted().takeIf { it.isNotEmpty() }?.let {
            problems += "unknown parameters: ${it.joinToString()}"
        }
        fields.forEach { field ->
            val value = params[field.name]
            when (field.kind) {
                Kind.TEXT -> {
                    when {
                        value == null -> if (field.required) problems += "${field.name} is required"
                        value !is String -> problems += "${field.name} must be a string"
                        value.isBlank() -> if (field.required) problems += "${field.name} is required"
                        value.trim().length > field.maxLength ->
                            problems += "${field.name} must be at most ${field.maxLength} characters"
                        value.any { it.isISOControl() } -> problems += "${field.name} contains control characters"
                    }
                }
                Kind.BOOLEAN -> if (value != null && value !is Boolean) problems += "${field.name} must be a boolean"
            }
        }
        return problems
    }

    /** Trims text, drops blank optional values and envelope keys. Assumes [validate] passed. */
    private fun normalize(params: Map<String, Any?>, fields: List<Field>): Map<String, Any?> {
        val out = linkedMapOf<String, Any?>()
        fields.forEach { field ->
            val value = params[field.name]
            when {
                value is String && value.isNotBlank() -> out[field.name] = value.trim()
                value is Boolean -> out[field.name] = value
            }
        }
        return out
    }

    private fun preview(entity: String, normalized: Map<String, Any?>, fields: List<Field>): List<PreviewChange> =
        fields.mapNotNull { field ->
            normalized[field.name]?.let { value ->
                PreviewChange(entity, field.name, null, value.toString(), "Set $entity.${field.name} on a new $entity")
            }
        }
}
