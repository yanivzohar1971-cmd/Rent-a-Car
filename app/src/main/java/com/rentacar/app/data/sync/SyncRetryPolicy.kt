package com.rentacar.app.data.sync

import com.google.firebase.firestore.FirebaseFirestoreException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

/**
 * AGENT-112: the retry behavior `CloudDeltaSyncWorker` is MEANT to have, as a pure, tested helper.
 *
 * Known worker defect this documents (worker intentionally left untouched - it cannot be unit tested
 * without an Android Context and cloud writes must stay disabled in this task):
 * `syncSingleItem` catches every Throwable, calls `markFailed` and returns `false`, so the
 * transient-error branch in `syncSingleItemWithRetry` is unreachable: network blips are never retried
 * with backoff and never surface as `Result.retry()`. The future patch is to let transient errors
 * propagate out of `syncSingleItem` (rethrow when [isTransient]) and to return `Result.retry()` from
 * `doWork` when [shouldRetryWork] is true.
 *
 * This helper never touches Firestore or Room.
 */
class SyncRetryPolicy(
    val maxAttempts: Int = 3,
    private val baseDelayMs: Long = 100L
) {
    init {
        require(maxAttempts >= 1) { "maxAttempts must be >= 1" }
        require(baseDelayMs >= 0) { "baseDelayMs must be >= 0" }
    }

    sealed class Outcome<out T> {
        data class Success<T>(val value: T, val attempts: Int) : Outcome<T>()

        /** Non-transient error: retrying cannot help. Row should be marked FAILED. */
        data class PermanentFailure(val error: Throwable, val attempts: Int) : Outcome<Nothing>()

        /** Transient error persisted through every attempt: row stays dirty and the WORK must be retried. */
        data class TransientExhausted(val error: Throwable, val attempts: Int) : Outcome<Nothing>()
    }

    /** 100ms, 200ms, 300ms ... (linear), matching the worker's current `100 * attempt`. */
    fun backoffMs(attemptJustFailed: Int): Long = baseDelayMs * attemptJustFailed

    fun isTransient(e: Throwable): Boolean {
        var t: Throwable? = e
        var depth = 0
        while (t != null && depth < 5) {
            if (isTransientSingle(t)) return true
            t = t.cause?.takeIf { it !== t }
            depth++
        }
        return false
    }

    private fun isTransientSingle(e: Throwable): Boolean {
        if (e is CancellationException) return false
        val message = e.message?.lowercase().orEmpty()
        return e is java.net.SocketTimeoutException ||
            e is java.net.UnknownHostException ||
            e is java.net.ConnectException ||
            message.contains("network") ||
            message.contains("timeout") ||
            message.contains("unavailable") ||
            message.contains("deadline exceeded") ||
            (e is FirebaseFirestoreException &&
                (e.code == FirebaseFirestoreException.Code.UNAVAILABLE ||
                    e.code == FirebaseFirestoreException.Code.DEADLINE_EXCEEDED))
    }

    /**
     * Runs [block], retrying only transient errors up to [maxAttempts]. Coroutine cancellation is
     * always rethrown (never swallowed or retried).
     */
    suspend fun <T> execute(
        sleep: suspend (Long) -> Unit = { delay(it) },
        block: suspend () -> T
    ): Outcome<T> {
        var attempt = 0
        while (true) {
            attempt++
            try {
                return Outcome.Success(block(), attempt)
            } catch (c: CancellationException) {
                throw c
            } catch (t: Throwable) {
                if (!isTransient(t)) return Outcome.PermanentFailure(t, attempt)
                if (attempt >= maxAttempts) return Outcome.TransientExhausted(t, attempt)
                sleep(backoffMs(attempt))
            }
        }
    }

    companion object {
        /** True when at least one row ended with an exhausted transient error: the worker should return `Result.retry()`. */
        fun shouldRetryWork(outcomes: Collection<Outcome<*>>): Boolean =
            outcomes.any { it is Outcome.TransientExhausted }
    }
}
