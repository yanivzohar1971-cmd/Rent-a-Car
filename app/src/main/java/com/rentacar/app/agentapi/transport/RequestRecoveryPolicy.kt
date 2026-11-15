package com.rentacar.app.agentapi.transport

import com.rentacar.app.agentapi.transport.remote.RemoteTransportResult

/** Whether we know the request was executed by the device. */
enum class ExecutionCertainty {
    /** Outcome not known (timeout, transport error, device vanished). The request may have run. */
    UNKNOWN,

    /** The device answered; the outcome is exactly what the response says. */
    CONFIRMED
}

enum class RecoveryDecision {
    /** Safe to resend automatically: idempotent, not expired, outcome unknown. */
    REPLAY_ALLOWED,

    /** Outcome already confirmed; use the recorded response, never resend. */
    ALREADY_CONFIRMED,

    /** Deadline passed; the request stays rejected and is never resurrected. */
    REJECT_EXPIRED,

    /** Non-idempotent and outcome unknown: needs a human / explicit read-back, never auto-replay. */
    REQUIRES_MANUAL_RECONCILIATION
}

/**
 * AGENT-106 recovery rules after a lost connection:
 *  1. Expired requests stay rejected (even for idempotent reads).
 *  2. Confirmed requests are never resent.
 *  3. Non-idempotent operations are never auto-replayed when the outcome is [ExecutionCertainty.UNKNOWN].
 *  4. Only idempotent, unexpired requests with unknown outcome may be replayed.
 */
object RequestRecoveryPolicy {

    fun decide(
        idempotent: Boolean,
        expiresAtEpochMs: Long?,
        nowEpochMs: Long,
        certainty: ExecutionCertainty
    ): RecoveryDecision = when {
        expiresAtEpochMs != null && nowEpochMs > expiresAtEpochMs -> RecoveryDecision.REJECT_EXPIRED
        certainty == ExecutionCertainty.CONFIRMED -> RecoveryDecision.ALREADY_CONFIRMED
        !idempotent -> RecoveryDecision.REQUIRES_MANUAL_RECONCILIATION
        else -> RecoveryDecision.REPLAY_ALLOWED
    }

    fun mayAutoReplay(
        idempotent: Boolean,
        expiresAtEpochMs: Long?,
        nowEpochMs: Long,
        certainty: ExecutionCertainty
    ): Boolean = decide(idempotent, expiresAtEpochMs, nowEpochMs, certainty) == RecoveryDecision.REPLAY_ALLOWED

    /** Only a delivered response confirms execution; every other result is conservatively UNKNOWN. */
    fun certaintyOf(result: RemoteTransportResult): ExecutionCertainty = when (result) {
        is RemoteTransportResult.Delivered -> ExecutionCertainty.CONFIRMED
        else -> ExecutionCertainty.UNKNOWN
    }
}
