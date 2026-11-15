package com.rentacar.app.agentapi.transport.remote

/**
 * AGENT-105 stub for a future outbound relay. It has NO network code: while the device is offline
 * it queues the request (bounded) and returns [RemoteTransportResult.DeviceUnavailable]; it never
 * reports delivery. Queued requests are exposed for inspection only and are not replayed here
 * (see [com.rentacar.app.agentapi.transport.RequestRecoveryPolicy]).
 */
class OutboundRelayTransport(
    private val deviceOnline: () -> Boolean = { false },
    private val maxQueueSize: Int = DEFAULT_MAX_QUEUE
) : RemoteDeviceTransport {
    private val lock = Any()
    private val queue = ArrayDeque<RemoteTransportRequest>()

    override val isConnected: Boolean get() = deviceOnline()

    override fun send(request: RemoteTransportRequest): RemoteTransportResult {
        if (isConnected) {
            return RemoteTransportResult.TransportError("Outbound relay delivery is not implemented")
        }
        synchronized(lock) {
            if (queue.size >= maxQueueSize) {
                return RemoteTransportResult.TransportError("Outbound relay queue is full")
            }
            queue.addLast(request)
        }
        return RemoteTransportResult.DeviceUnavailable
    }

    fun pendingCount(): Int = synchronized(lock) { queue.size }

    fun pendingRequestIds(): List<String> = synchronized(lock) { queue.map { it.requestId } }

    fun clearPending() = synchronized(lock) { queue.clear() }

    companion object {
        const val DEFAULT_MAX_QUEUE: Int = 100
    }
}
