package com.rentacar.app.agentapi.commands

import com.rentacar.app.agentapi.model.AgentError
import java.security.MessageDigest

/** Confirmation strength a command needs before it may ever be committed. */
enum class CommandRisk {
    NONE,
    SOFT,
    HARD,
    CRITICAL
}

/** Ordered lifecycle of a write command. COMMIT/VERIFY never touch production data in this phase. */
enum class CommandPhase {
    PREPARE,
    VALIDATE,
    AUTHORIZE,
    PREVIEW,
    AWAIT_CONFIRMATION,
    COMMIT,
    VERIFY,
    AUDIT
}

/** A validated, authorized command waiting for confirmation. Immutable. */
data class PreparedCommand(
    val commandId: String,
    val operationId: String,
    val parameters: Map<String, Any?>,
    val userUid: String,
    val deviceId: String?,
    val risk: CommandRisk,
    val idempotencyKey: String?,
    val preparedAtEpochMs: Long,
    val expiresAtEpochMs: Long,
    /** SHA-256 over operation, user, risk and canonical parameters. */
    val commandHash: String
) {
    fun isExpired(nowEpochMs: Long): Boolean = nowEpochMs >= expiresAtEpochMs

    companion object {
        fun hashOf(operationId: String, userUid: String, risk: CommandRisk, parameters: Map<String, Any?>): String {
            val canonical = listOf(operationId, userUid, risk.name, canonicalize(parameters)).joinToString("\n")
            return MessageDigest.getInstance("SHA-256")
                .digest(canonical.toByteArray(Charsets.UTF_8))
                .joinToString("") { "%02x".format(it) }
        }

        internal fun canonicalize(value: Any?): String = when (value) {
            is Map<*, *> -> value.entries
                .sortedBy { it.key.toString() }
                .joinToString(",", "{", "}") { "${it.key}:${canonicalize(it.value)}" }
            is Iterable<*> -> value.joinToString(",", "[", "]") { canonicalize(it) }
            is Number -> if (value.toDouble() % 1.0 == 0.0) value.toLong().toString() else value.toString()
            else -> value.toString()
        }
    }
}

data class PreviewChange(
    val entity: String,
    val field: String?,
    val before: String?,
    val after: String?,
    val description: String
)

/** Human-readable effect of a prepared command. Producing it never mutates anything. */
data class CommandPreview(
    val commandId: String,
    val operationId: String,
    val summary: String,
    val changes: List<PreviewChange>,
    val risk: CommandRisk,
    val requiresConfirmation: Boolean,
    val commandHash: String,
    val warnings: List<String> = emptyList()
)

enum class CommandOutcome {
    REJECTED,
    PREPARED,
    SANDBOX_COMMITTED,
    /** AGENT-111: committed to the local Room database in the AgentDev build only (never production). */
    ROOM_COMMITTED
}

data class CommandReceipt(
    val commandId: String?,
    val operationId: String,
    val phase: CommandPhase,
    val outcome: CommandOutcome,
    /** Always false: no code path writes production data. */
    val productionWritePerformed: Boolean = false,
    val sandboxOnly: Boolean = false,
    /** AGENT-111: true only for a real Room commit performed under [AgentDevWriteGate]. */
    val developmentOnly: Boolean = false,
    val error: AgentError? = null,
    val message: String,
    val atEpochMs: Long,
    /** Set for [CommandOutcome.ROOM_COMMITTED]: the entity written (type + local id). */
    val committedEntityType: String? = null,
    val committedEntityId: Long? = null,
    /** True when an idempotent replay returned the original result without writing again. */
    val idempotentReplay: Boolean = false
)

data class CommandAuditRecord(
    val auditId: String,
    val commandId: String?,
    val operationId: String,
    val userUid: String?,
    val deviceId: String?,
    val phase: CommandPhase,
    val outcome: CommandOutcome,
    val errorCode: String?,
    val detail: String,
    val atEpochMs: Long,
    /** AGENT-111 safety flags; production is always false. */
    val productionWritePerformed: Boolean = false,
    val sandboxOnly: Boolean = false,
    val developmentOnly: Boolean = false
)

interface CommandAuditLog {
    fun append(record: CommandAuditRecord)
    fun records(): List<CommandAuditRecord>
}

class InMemoryCommandAuditLog : CommandAuditLog {
    private val entries = java.util.concurrent.CopyOnWriteArrayList<CommandAuditRecord>()
    override fun append(record: CommandAuditRecord) {
        entries.add(record)
    }

    override fun records(): List<CommandAuditRecord> = entries.toList()
}
