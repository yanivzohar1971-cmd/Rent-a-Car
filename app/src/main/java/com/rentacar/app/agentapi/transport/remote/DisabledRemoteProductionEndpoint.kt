package com.rentacar.app.agentapi.transport.remote

/** AGENT-105: the production remote endpoint does not exist yet; every send fails. */
object DisabledRemoteProductionEndpoint : RemoteDeviceTransport {
    const val MESSAGE: String = "production remote endpoint disabled"

    override val isConnected: Boolean = false

    override fun send(request: RemoteTransportRequest): RemoteTransportResult =
        RemoteTransportResult.TransportError(MESSAGE)
}
