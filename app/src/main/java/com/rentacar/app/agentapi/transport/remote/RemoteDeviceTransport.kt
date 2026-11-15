package com.rentacar.app.agentapi.transport.remote

/**
 * AGENT-105: request handed to a [RemoteDeviceTransport]. HTTP-shaped so the loopback router can
 * serve it unchanged. [headers] may carry a Bearer token and is therefore hidden from [toString].
 */
class RemoteTransportRequest(
    val requestId: String,
    val method: String,
    val path: String,
    val headers: Map<String, String> = emptyMap(),
    val body: String? = null,
    /** True only for side-effect-free requests; non-idempotent requests are never auto-replayed. */
    val idempotent: Boolean = false,
    val timeoutMs: Long = DEFAULT_TIMEOUT_MS
) {
    override fun toString(): String =
        "RemoteTransportRequest(requestId=$requestId, method=$method, path=$path, idempotent=$idempotent)"

    companion object {
        const val DEFAULT_TIMEOUT_MS: Long = 10_000
    }
}

/**
 * Outcome of sending a request to a device. A transport never fabricates success: anything other
 * than [Delivered] means the device did not (verifiably) answer.
 */
sealed class RemoteTransportResult {
    /** The device answered; [responseJson] is its raw body (which may itself describe an error). */
    data class Delivered(val responseJson: String) : RemoteTransportResult()

    /** The device is offline / not reachable. The request was not delivered. */
    object DeviceUnavailable : RemoteTransportResult() {
        override fun toString(): String = "DeviceUnavailable"
    }

    /** No answer in time. The execution outcome is UNKNOWN. */
    object Timeout : RemoteTransportResult() {
        override fun toString(): String = "Timeout"
    }

    /** The device rejected the credentials. */
    object Unauthorized : RemoteTransportResult() {
        override fun toString(): String = "Unauthorized"
    }

    data class TransportError(val message: String) : RemoteTransportResult()
}

interface RemoteDeviceTransport {
    val isConnected: Boolean
    fun send(request: RemoteTransportRequest): RemoteTransportResult
}
