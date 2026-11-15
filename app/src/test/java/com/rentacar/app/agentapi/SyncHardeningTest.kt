package com.rentacar.app.agentapi

import com.rentacar.app.data.sync.SyncQueueDeduper
import com.rentacar.app.data.sync.SyncQueueEntity
import com.rentacar.app.data.sync.SyncRetryPolicy
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

/** AGENT-112: sync queue dedupe + retry policy (pure helpers; cloud writes stay disabled). */
class SyncHardeningTest {
    private fun row(id: Long, type: String, entityId: Long, at: Long, dirty: Boolean = true, status: String? = null) =
        SyncQueueEntity(id = id, entityType = type, entityId = entityId, isDirty = dirty, lastDirtyAt = at, lastSyncStatus = status)

    // ---- SyncQueueDeduper ----

    @Test
    fun duplicatesCollapseToTheNewestLastDirtyAt() {
        val rows = listOf(
            row(1, "customer", 7, at = 100),
            row(2, "customer", 7, at = 300),
            row(3, "customer", 7, at = 200),
            row(4, "customer", 8, at = 150)
        )
        val result = SyncQueueDeduper.dedupe(rows)
        assertEquals(listOf(4L, 2L), result.kept.map { it.id }) // processing order: oldest lastDirtyAt first
        assertEquals(setOf(1L, 3L), result.redundant.map { it.id }.toSet())
        assertEquals(2, result.duplicatesRemoved)
    }

    @Test
    fun sameEntityIdInDifferentTypesIsNotADuplicate() {
        val rows = listOf(row(1, "customer", 5, 10), row(2, "supplier", 5, 20), row(3, "reservation", 5, 30))
        val result = SyncQueueDeduper.dedupe(rows)
        assertEquals(3, result.kept.size)
        assertTrue(result.redundant.isEmpty())
    }

    @Test
    fun tiesOnLastDirtyAtKeepTheLaterInsertedRow() {
        val result = SyncQueueDeduper.dedupe(listOf(row(5, "carSale", 1, 100), row(9, "carSale", 1, 100), row(7, "carSale", 1, 100)))
        assertEquals(listOf(9L), result.kept.map { it.id })
        assertEquals(setOf(5L, 7L), result.redundant.map { it.id }.toSet())
    }

    @Test
    fun newestRowWinsEvenWhenAnOlderRowHadFailed() {
        val rows = listOf(row(1, "payment", 3, 100, status = "FAILED"), row(2, "payment", 3, 200, status = null))
        assertEquals(listOf(2L), SyncQueueDeduper.collapse(rows).map { it.id })
    }

    @Test
    fun nonDirtyRowsAreIgnoredAndInputIsNotMutated() {
        val rows = listOf(row(1, "customer", 1, 100, dirty = false), row(2, "customer", 1, 50), row(3, "customer", 2, 60, dirty = false))
        val copy = rows.toList()
        val result = SyncQueueDeduper.dedupe(rows)
        assertEquals(listOf(2L), result.kept.map { it.id })
        assertTrue(result.redundant.isEmpty())
        assertEquals(copy, rows)
    }

    @Test
    fun emptyAndUniqueInputsAreUnchanged() {
        assertTrue(SyncQueueDeduper.dedupe(emptyList()).kept.isEmpty())
        val unique = listOf(row(1, "a", 1, 3), row(2, "a", 2, 1), row(3, "b", 1, 2))
        assertEquals(listOf(2L, 3L, 1L), SyncQueueDeduper.collapse(unique).map { it.id })
    }

    @Test
    fun dedupeIsIdempotent() {
        val rows = (1..20L).map { row(it, "customer", it % 4, it * 10) }
        val once = SyncQueueDeduper.collapse(rows)
        assertEquals(once, SyncQueueDeduper.collapse(once))
        assertEquals(4, once.size)
    }

    // ---- SyncRetryPolicy ----

    private val policy = SyncRetryPolicy(maxAttempts = 3, baseDelayMs = 100)

    @Test
    fun transientErrorsAreClassifiedIncludingWrappedCauses() {
        assertTrue(policy.isTransient(SocketTimeoutException("x")))
        assertTrue(policy.isTransient(UnknownHostException("firestore.googleapis.com")))
        assertTrue(policy.isTransient(IOException("Network is unreachable")))
        assertTrue(policy.isTransient(IllegalStateException("wrapper", IOException("deadline exceeded"))))
        // FirebaseFirestoreException (UNAVAILABLE / DEADLINE_EXCEEDED) is also transient in production code,
        // but it cannot be instantiated on the plain JVM (needs android.* at class init), so it is not unit-tested.
    }

    @Test
    fun permanentErrorsAreNotTransient() {
        assertFalse(policy.isTransient(IllegalArgumentException("bad data")))
        assertFalse(policy.isTransient(CancellationException("cancelled")))
    }

    @Test
    fun transientFailureThenSuccessRetriesWithBackoff() = runBlocking {
        var calls = 0
        val sleeps = mutableListOf<Long>()
        val outcome = policy.execute(sleep = { sleeps += it }) {
            if (++calls < 3) throw SocketTimeoutException("t") else "ok"
        }
        assertEquals(SyncRetryPolicy.Outcome.Success("ok", attempts = 3), outcome)
        assertEquals(listOf(100L, 200L), sleeps)
    }

    @Test
    fun permanentFailureIsNotRetried() = runBlocking {
        var calls = 0
        val sleeps = mutableListOf<Long>()
        val outcome = policy.execute(sleep = { sleeps += it }) {
            calls++
            throw IllegalArgumentException("invalid")
        }
        assertTrue(outcome is SyncRetryPolicy.Outcome.PermanentFailure)
        assertEquals(1, calls)
        assertTrue(sleeps.isEmpty())
    }

    @Test
    fun exhaustedTransientErrorsAreReportedSoTheWorkCanBeRetried() = runBlocking {
        var calls = 0
        val outcome = policy.execute(sleep = {}) {
            calls++
            throw UnknownHostException("offline")
        }
        assertTrue(outcome is SyncRetryPolicy.Outcome.TransientExhausted)
        assertEquals(3, (outcome as SyncRetryPolicy.Outcome.TransientExhausted).attempts)
        assertEquals(3, calls)

        assertTrue(SyncRetryPolicy.shouldRetryWork(listOf(SyncRetryPolicy.Outcome.Success(1, 1), outcome)))
        assertFalse(SyncRetryPolicy.shouldRetryWork(listOf(SyncRetryPolicy.Outcome.Success(1, 1), SyncRetryPolicy.Outcome.PermanentFailure(IllegalStateException(), 1))))
        assertFalse(SyncRetryPolicy.shouldRetryWork(emptyList()))
    }

    @Test
    fun cancellationIsAlwaysRethrownNeverSwallowedOrRetried() {
        var calls = 0
        try {
            runBlocking { policy.execute(sleep = {}) { calls++; throw CancellationException("stop") } }
            fail("cancellation must propagate")
        } catch (_: CancellationException) {
        }
        assertEquals(1, calls)
    }

    @Test
    fun maxAttemptsOfOneNeverRetries() = runBlocking {
        var calls = 0
        val outcome = SyncRetryPolicy(maxAttempts = 1).execute(sleep = {}) { calls++; throw SocketTimeoutException() }
        assertTrue(outcome is SyncRetryPolicy.Outcome.TransientExhausted)
        assertEquals(1, calls)
    }
}
