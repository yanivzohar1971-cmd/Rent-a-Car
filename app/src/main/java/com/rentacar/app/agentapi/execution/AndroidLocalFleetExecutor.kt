package com.rentacar.app.agentapi.execution

import com.rentacar.app.agentapi.dto.toYardAgentDto
import com.rentacar.app.agentapi.model.AgentOperationDefinition
import com.rentacar.app.agentapi.model.AgentPaginationMetadata
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
import com.rentacar.app.agentapi.ports.FleetReadPort
import com.rentacar.app.data.CarPublicationStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext

class AndroidLocalFleetExecutor(
    private val port: FleetReadPort,
    private val ioDispatcher: kotlinx.coroutines.CoroutineDispatcher = Dispatchers.IO
) {
    fun execute(request: AgentRequest, definition: AgentOperationDefinition): AgentResponse {
        LocalReadSupport.authorize(request, definition)?.let { return LocalReadSupport.failure(request, it) }
        LocalReadSupport.validateLocalOrAutoTarget(request, "fleet reads")?.let {
            return LocalReadSupport.failure(request, it)
        }
        return try {
            runBlocking { withContext(ioDispatcher) { read(request) } }
        } catch (_: Throwable) {
            LocalReadSupport.internalError(request, "Fleet read failed")
        }
    }

    private suspend fun read(request: AgentRequest): AgentResponse {
        val allowed = setOf("query", "status", "limit", "offset")
        LocalReadSupport.rejectUnknownParams(request, allowed)?.let {
            return LocalReadSupport.failure(request, it)
        }
        val page = LocalReadSupport.parsePagination(request).getOrElse {
            return LocalReadSupport.invalidArgument(request, it.message ?: "Invalid pagination")
        }
        val status = request.parameters["status"]?.toString()?.uppercase()
        if (status != null && status !in setOf("DRAFT", "HIDDEN", "PUBLISHED")) {
            return LocalReadSupport.invalidArgument(request, "status must be DRAFT, HIDDEN, or PUBLISHED")
        }
        val query = request.parameters["query"]?.toString()?.trim().orEmpty()
        val filtered = port.fleet(request.auth!!.userUid!!).filter {
            val actualStatus = CarPublicationStatus.fromString(it.publicationStatus).name
            (status == null || actualStatus == status) &&
                (query.isEmpty() || listOfNotNull(
                    it.brand, it.model, it.carTypeName, it.licensePlatePartial
                ).any { value -> value.contains(query, true) })
        }
        val (slice, total, more) = LocalReadSupport.paginate(filtered, page)
        return LocalReadSupport.success(
            request,
            mapOf("items" to slice.map { it.toYardAgentDto() }, "totalMatching" to total),
            listOf("Read from local Room using auth userUid; sync freshness is unknown"),
            AgentPaginationMetadata(page.limit, page.offset, total, more)
        )
    }
}
