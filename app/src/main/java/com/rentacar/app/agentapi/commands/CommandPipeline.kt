package com.rentacar.app.agentapi.commands

import com.rentacar.app.agentapi.model.AgentAuthContext
import com.rentacar.app.agentapi.model.AgentError
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentReadOrWrite
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.registry.AgentCapabilityRegistry
import com.rentacar.app.agentapi.validation.AgentRequestValidator
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

sealed class CommandPrepareOutcome {
    data class Prepared(
        val command: PreparedCommand,
        val preview: CommandPreview,
        val confirmationToken: String
    ) : CommandPrepareOutcome()

    data class Rejected(val receipt: CommandReceipt) : CommandPrepareOutcome()
}

/**
 * Prepare -> validate -> authorize -> preview -> await confirmation -> commit -> verify -> audit.
 *
 * No implementation in this phase performs production writes.
 */
interface CommandPipeline {
    fun prepare(request: AgentRequest): CommandPrepareOutcome
    fun commit(commandId: String, confirmationToken: String?, auth: AgentAuthContext?): CommandReceipt
}

internal fun writeDisabledError(operationId: String, request: AgentRequest?): AgentError = AgentError(
    code = AgentErrorCode.WRITE_DISABLED,
    message = "Write operations are disabled",
    requestId = request?.requestId,
    correlationId = request?.correlationId,
    details = mapOf("operation" to operationId)
)

/** Rejects everything with WRITE_DISABLED. */
class DisabledWriteCommandPipeline(
    private val auditLog: CommandAuditLog? = null,
    private val clock: () -> Long = System::currentTimeMillis
) : CommandPipeline {
    override fun prepare(request: AgentRequest): CommandPrepareOutcome =
        CommandPrepareOutcome.Rejected(reject(request.operation, null, CommandPhase.PREPARE, request, request.auth))

    override fun commit(commandId: String, confirmationToken: String?, auth: AgentAuthContext?): CommandReceipt =
        reject("unknown", commandId, CommandPhase.COMMIT, null, auth)

    private fun reject(
        operationId: String,
        commandId: String?,
        phase: CommandPhase,
        request: AgentRequest?,
        auth: AgentAuthContext?
    ): CommandReceipt {
        val now = clock()
        val receipt = CommandReceipt(
            commandId = commandId,
            operationId = operationId,
            phase = phase,
            outcome = CommandOutcome.REJECTED,
            error = writeDisabledError(operationId, request),
            message = "Write operations are disabled",
            atEpochMs = now
        )
        auditLog?.append(
            CommandAuditRecord(
                auditId = "audit-${UUID.randomUUID()}", commandId = commandId, operationId = operationId,
                userUid = auth?.userUid, deviceId = auth?.deviceId, phase = CommandPhase.AUDIT,
                outcome = CommandOutcome.REJECTED, errorCode = AgentErrorCode.WRITE_DISABLED.name,
                detail = "phase=$phase", atEpochMs = now
            )
        )
        return receipt
    }
}

/**
 * Describes one future write operation that may be prepared/previewed. Validators and
 * previewers are pure functions over request parameters; they never touch storage.
 */
data class WriteCommandSpec(
    val operationId: String,
    val risk: CommandRisk,
    val requiredPermissions: Set<String> = setOf("AUTHENTICATED"),
    val validate: (Map<String, Any?>) -> List<String>,
    val preview: (Map<String, Any?>) -> List<PreviewChange>,
    /** Pure canonicalization applied after validation; the result is hashed, previewed-from and committed. */
    val normalize: (Map<String, Any?>) -> Map<String, Any?> = { it }
)

/** Effect of a command inside [InMemoryCommandSandbox]; never Room/Firestore. */
data class SandboxEntry(
    val commandId: String,
    val operationId: String,
    val userUid: String,
    val parameters: Map<String, Any?>,
    val appliedAtEpochMs: Long
)

/** In-memory-only stand-in for the data layer; the sole place a commit may land. */
class InMemoryCommandSandbox {
    private val entries = ConcurrentHashMap<String, SandboxEntry>()

    fun apply(command: PreparedCommand, nowEpochMs: Long): SandboxEntry =
        entries.computeIfAbsent(command.commandId) {
            SandboxEntry(command.commandId, command.operationId, command.userUid, command.parameters, nowEpochMs)
        }

    fun contains(commandId: String): Boolean = entries.containsKey(commandId)
    fun entries(): List<SandboxEntry> = entries.values.sortedBy { it.appliedAtEpochMs }
}

/**
 * Prepares and previews allowlisted future writes. It NEVER commits to production data:
 * [commit] is rejected with WRITE_DISABLED unless an [InMemoryCommandSandbox] was supplied,
 * in which case it only records into that sandbox.
 */
class PreparingWriteCommandPipeline(
    private val registry: AgentCapabilityRegistry,
    specs: List<WriteCommandSpec>,
    private val tokenService: CommandConfirmationTokenService,
    private val auditLog: CommandAuditLog = InMemoryCommandAuditLog(),
    private val sandbox: InMemoryCommandSandbox? = null,
    private val clock: () -> Long = System::currentTimeMillis,
    private val preparedTtlMs: Long = DEFAULT_PREPARED_TTL_MS
) : CommandPipeline {
    private val specsById = specs.associateBy { it.operationId }
    private val pending = ConcurrentHashMap<String, PreparedCommand>()

    init {
        specs.forEach { spec ->
            val def = registry.get(spec.operationId)
            require(def != null && def.readOrWrite == AgentReadOrWrite.WRITE) {
                "Spec '${spec.operationId}' must reference a registered WRITE operation"
            }
        }
    }

    override fun prepare(request: AgentRequest): CommandPrepareOutcome {
        val now = clock()
        val auth = request.auth
        fun reject(phase: CommandPhase, code: AgentErrorCode, message: String, details: Map<String, Any?> = emptyMap()) =
            CommandPrepareOutcome.Rejected(
                receipt(null, request.operation, phase, code, message, request, auth, now, details)
            )

        // PREPARE: operation must be an allowlisted, registered write.
        val spec = specsById[request.operation]
            ?: return reject(
                CommandPhase.PREPARE, AgentErrorCode.WRITE_DISABLED,
                "Operation '${request.operation}' is not enabled for command preparation"
            )

        // AUTHORIZE (identity must come from an authenticated context).
        val uid = auth?.userUid
        if (uid.isNullOrBlank()) {
            return reject(CommandPhase.AUTHORIZE, AgentErrorCode.UNAUTHORIZED, "Authenticated userUid is required")
        }
        val granted = auth.permissions.map { it.uppercase() }.toSet()
        val missing = spec.requiredPermissions.filter { it.uppercase() !in granted }
        if (missing.isNotEmpty()) {
            return reject(
                CommandPhase.AUTHORIZE, AgentErrorCode.FORBIDDEN,
                "Missing required permissions: ${missing.joinToString()}", mapOf("missing" to missing)
            )
        }

        // VALIDATE: same SQL / arbitrary-method screening as reads, then pure spec validators.
        AgentRequestValidator.detectForbiddenParameters(request.parameters)?.let { (code, message) ->
            return reject(CommandPhase.VALIDATE, code, message)
        }
        val problems = spec.validate(request.parameters)
        if (problems.isNotEmpty()) {
            return reject(
                CommandPhase.VALIDATE, AgentErrorCode.VALIDATION_FAILED,
                "Command validation failed: ${problems.joinToString("; ")}", mapOf("problems" to problems)
            )
        }
        val normalized = spec.normalize(request.parameters).toMap()

        val hash = PreparedCommand.hashOf(spec.operationId, uid, spec.risk, normalized)
        val command = PreparedCommand(
            commandId = "cmd-${UUID.randomUUID()}",
            operationId = spec.operationId,
            parameters = normalized,
            userUid = uid,
            deviceId = auth.deviceId,
            risk = spec.risk,
            idempotencyKey = request.idempotencyKey,
            preparedAtEpochMs = now,
            expiresAtEpochMs = now + preparedTtlMs,
            commandHash = hash
        )

        // PREVIEW (no mutation) then AWAIT_CONFIRMATION.
        val preview = CommandPreview(
            commandId = command.commandId,
            operationId = command.operationId,
            summary = "Preview of ${command.operationId} (not applied)",
            changes = spec.preview(normalized),
            risk = command.risk,
            requiresConfirmation = true,
            commandHash = command.commandHash,
            warnings = listOf("Preview only: no data has been changed")
        )
        pending[command.commandId] = command
        val token = tokenService.issue(command, preparedTtlMs).encode()
        audit(command.commandId, command.operationId, uid, auth.deviceId, CommandOutcome.PREPARED, null, "phase=${CommandPhase.AWAIT_CONFIRMATION}", now)
        return CommandPrepareOutcome.Prepared(command, preview, token)
    }

    override fun commit(commandId: String, confirmationToken: String?, auth: AgentAuthContext?): CommandReceipt {
        val now = clock()
        val command = pending[commandId]
            ?: return receipt(commandId, "unknown", CommandPhase.COMMIT, AgentErrorCode.NOT_FOUND, "Unknown or already consumed command", null, auth, now)
        fun reject(code: AgentErrorCode, message: String, phase: CommandPhase = CommandPhase.COMMIT) =
            receipt(commandId, command.operationId, phase, code, message, null, auth, now)

        if (auth?.userUid != command.userUid) {
            return reject(AgentErrorCode.FORBIDDEN, "Command belongs to a different user", CommandPhase.AUTHORIZE)
        }
        if (command.isExpired(now)) {
            pending.remove(commandId)
            return reject(AgentErrorCode.TIMEOUT, "Prepared command expired")
        }
        if (confirmationToken.isNullOrBlank()) {
            return reject(AgentErrorCode.CONFIRMATION_REQUIRED, "Confirmation token required", CommandPhase.AWAIT_CONFIRMATION)
        }
        val check = tokenService.verify(confirmationToken, command)
        if (check is ConfirmationCheck.Invalid) {
            return reject(AgentErrorCode.CONFIRMATION_REQUIRED, check.reason, CommandPhase.AWAIT_CONFIRMATION)
        }
        val target = sandbox
            ?: return reject(AgentErrorCode.WRITE_DISABLED, "Write operations are disabled; command was not committed")

        // Single use: consume before committing to the sandbox.
        if (pending.remove(commandId, command).not()) {
            return reject(AgentErrorCode.CONFLICT, "Command already consumed")
        }
        target.apply(command, now) // COMMIT (sandbox only)
        val verified = target.contains(command.commandId) // VERIFY
        val receipt = CommandReceipt(
            commandId = command.commandId,
            operationId = command.operationId,
            phase = CommandPhase.VERIFY,
            outcome = if (verified) CommandOutcome.SANDBOX_COMMITTED else CommandOutcome.REJECTED,
            productionWritePerformed = false,
            sandboxOnly = true,
            message = "Committed to in-memory sandbox only; no production data changed",
            atEpochMs = now
        )
        audit(command.commandId, command.operationId, command.userUid, command.deviceId, receipt.outcome, null, "sandbox commit verified=$verified", now)
        return receipt
    }

    private fun receipt(
        commandId: String?,
        operationId: String,
        phase: CommandPhase,
        code: AgentErrorCode,
        message: String,
        request: AgentRequest?,
        auth: AgentAuthContext?,
        now: Long,
        details: Map<String, Any?> = emptyMap()
    ): CommandReceipt {
        audit(commandId, operationId, auth?.userUid, auth?.deviceId, CommandOutcome.REJECTED, code.name, "phase=$phase", now)
        return CommandReceipt(
            commandId = commandId,
            operationId = operationId,
            phase = phase,
            outcome = CommandOutcome.REJECTED,
            error = AgentError(
                code = code, message = message, requestId = request?.requestId,
                correlationId = request?.correlationId, details = details
            ),
            message = message,
            atEpochMs = now
        )
    }

    private fun audit(
        commandId: String?, operationId: String, userUid: String?, deviceId: String?,
        outcome: CommandOutcome, errorCode: String?, detail: String, now: Long
    ) {
        auditLog.append(
            CommandAuditRecord(
                auditId = "audit-${UUID.randomUUID()}", commandId = commandId, operationId = operationId,
                userUid = userUid, deviceId = deviceId, phase = CommandPhase.AUDIT, outcome = outcome,
                errorCode = errorCode, detail = detail, atEpochMs = now
            )
        )
    }

    fun auditRecords(): List<CommandAuditRecord> = auditLog.records()

    companion object {
        const val DEFAULT_PREPARED_TTL_MS: Long = 5 * 60_000
    }
}
