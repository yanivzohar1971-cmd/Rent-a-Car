package com.rentacar.app.agentapi.transport.remote

import com.rentacar.app.agentapi.gateway.LoopbackGatewayRouter

/**
 * AGENT-105 (development / tests only): thin adapter that sends requests straight into a
 * [LoopbackGatewayRouter] (the `adb forward` loopback path). No network code.
 *
 * Status mapping: 401/403 -> Unauthorized, 408/504 -> Timeout, 5xx -> TransportError,
 * everything else -> Delivered (the body carries the Agent API outcome).
 */
class LoopbackAdbDevTransport(
    private val router: LoopbackGatewayRouter,
    private val connected: () -> Boolean = { true }
) : RemoteDeviceTransport {

    override val isConnected: Boolean get() = connected()

    override fun send(request: RemoteTransportRequest): RemoteTransportResult {
        if (!isConnected) return RemoteTransportResult.DeviceUnavailable
        val result = try {
            router.handle(request.method, request.path, request.headers, request.body)
        } catch (t: Throwable) {
            return RemoteTransportResult.TransportError("Loopback router failed: ${t.javaClass.simpleName}")
        }
        return when (result.status) {
            401, 403 -> RemoteTransportResult.Unauthorized
            408, 504 -> RemoteTransportResult.Timeout
            in 500..599 -> RemoteTransportResult.TransportError("Gateway returned HTTP ${result.status}")
            else -> RemoteTransportResult.Delivered(result.body)
        }
    }
}
