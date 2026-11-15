package com.rentacar.app.agentapi.transport

sealed class ReplayDecision {
    /** First time this key was seen; caller must execute and then call [ReplayGuard.complete]. */
    object Fresh : ReplayDecision()

    /** Same idempotencyKey + same request fingerprint: answer from cache. */
    data class CachedReplay(val response: AgentGatewayResponse) : ReplayDecision()

    /** Key seen before and it may not be re-executed. */
    data class Rejected(val reason: String) : ReplayDecision()
}

/** Remembers recent request ids / idempotency keys for a TTL window. */
interface ReplayGuard {
    fun begin(
        scope: String,
        requestId: String,
        idempotencyKey: String?,
        fingerprint: String
    ): ReplayDecision

    fun complete(
        scope: String,
        requestId: String,
        idempotencyKey: String?,
        response: AgentGatewayResponse
    )
}

/**
 * In-memory replay guard.
 *
 * Rules:
 *  - repeated idempotencyKey with the same fingerprint -> cached response (replayed = true);
 *  - idempotencyKey reused with a different fingerprint -> rejected;
 *  - repeated requestId (without a matching idempotency hit) -> rejected;
 *  - entries expire after [ttlMs]; the table is bounded by [maxEntries].
 */
class InMemoryReplayGuard(
    private val ttlMs: Long = DEFAULT_TTL_MS,
    private val maxEntries: Int = DEFAULT_MAX_ENTRIES,
    private val clock: () -> Long = System::currentTimeMillis
) : ReplayGuard {
    private class Entry(
        val seenAtEpochMs: Long,
        val fingerprint: String,
        var response: AgentGatewayResponse? = null
    )

    private val lock = Any()
    private val requestIds = LinkedHashMap<String, Entry>()
    private val idempotencyKeys = LinkedHashMap<String, Entry>()

    override fun begin(
        scope: String,
        requestId: String,
        idempotencyKey: String?,
        fingerprint: String
    ): ReplayDecision = synchronized(lock) {
        val now = clock()
        evict(now)
        if (idempotencyKey != null) {
            val existing = idempotencyKeys["$scope|$idempotencyKey"]
            if (existing != null) {
                val cached = existing.response
                return@synchronized when {
                    existing.fingerprint != fingerprint ->
                        ReplayDecision.Rejected("idempotencyKey was already used with a different request")
                    cached == null ->
                        ReplayDecision.Rejected("A request with this idempotencyKey is still in flight")
                    else -> ReplayDecision.CachedReplay(cached.copy(replayed = true))
                }
            }
        }
        if (requestIds.containsKey("$scope|$requestId")) {
            return@synchronized ReplayDecision.Rejected("requestId was already used (replay)")
        }
        val entry = Entry(now, fingerprint)
        requestIds["$scope|$requestId"] = entry
        if (idempotencyKey != null) idempotencyKeys["$scope|$idempotencyKey"] = entry
        ReplayDecision.Fresh
    }

    override fun complete(
        scope: String,
        requestId: String,
        idempotencyKey: String?,
        response: AgentGatewayResponse
    ) {
        synchronized(lock) {
            requestIds["$scope|$requestId"]?.response = response
        }
    }

    fun size(): Int = synchronized(lock) { requestIds.size }

    private fun evict(now: Long) {
        fun prune(map: LinkedHashMap<String, Entry>) {
            val iterator = map.entries.iterator()
            while (iterator.hasNext()) {
                val e = iterator.next()
                // Insertion order == age order: stop at the first live entry within bounds.
                if (now - e.value.seenAtEpochMs >= ttlMs || map.size > maxEntries) iterator.remove()
                else break
            }
        }
        prune(requestIds)
        prune(idempotencyKeys)
    }

    companion object {
        const val DEFAULT_TTL_MS: Long = 5 * 60_000
        const val DEFAULT_MAX_ENTRIES: Int = 10_000
    }
}
