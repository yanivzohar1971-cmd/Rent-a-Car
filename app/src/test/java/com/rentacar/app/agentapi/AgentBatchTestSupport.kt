package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.execution.agentLocalAuth
import com.rentacar.app.agentapi.model.AgentExecutionTarget
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.reservation.ReservationReadPort
import com.rentacar.app.agentapi.supplier.SupplierReadPort
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.Supplier

internal const val BATCH_UID = "batch-user"

internal fun batchRequest(
    operation: String,
    parameters: Map<String, Any?> = emptyMap(),
    target: AgentExecutionTarget = AgentExecutionTarget.ANDROID_LOCAL
) = AgentRequest(
    apiVersion = AgentApiVersions.API_VERSION,
    operation = operation,
    requestId = "test-$operation",
    target = target,
    parameters = parameters,
    auth = agentLocalAuth(BATCH_UID)
)

internal object EmptySupplierPort : SupplierReadPort {
    override suspend fun listForUser(userUid: String): List<Supplier> = emptyList()
    override suspend fun getByIdForUser(id: Long, userUid: String): Supplier? = null
}

internal object EmptyReservationPort : ReservationReadPort {
    override suspend fun listForUser(userUid: String): List<Reservation> = emptyList()
    override suspend fun getByIdForUser(id: Long, userUid: String): Reservation? = null
}
