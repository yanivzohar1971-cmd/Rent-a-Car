package com.rentacar.app.agentapi.execution

import com.rentacar.app.agentapi.model.AgentOperationDefinition
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
import com.rentacar.app.agentapi.ports.ReportingReadPort
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext

class AndroidLocalReportingExecutor(
    private val port: ReportingReadPort,
    private val ioDispatcher: kotlinx.coroutines.CoroutineDispatcher = Dispatchers.IO
) {
    fun execute(request: AgentRequest, definition: AgentOperationDefinition): AgentResponse {
        LocalReadSupport.authorize(request, definition)?.let { return LocalReadSupport.failure(request, it) }
        LocalReadSupport.validateLocalOrAutoTarget(request, "reporting reads")?.let {
            return LocalReadSupport.failure(request, it)
        }
        LocalReadSupport.rejectUnknownParams(request, setOf("supplierId", "year", "month"))?.let {
            return LocalReadSupport.failure(request, it)
        }
        val supplierId = LocalReadSupport.parseRequiredPositiveLong(request.parameters["supplierId"])
            ?: return LocalReadSupport.invalidArgument(request, "supplierId must be a positive integer")
        val year = number(request.parameters["year"])
            ?: return LocalReadSupport.invalidArgument(request, "year must be an integer")
        val month = number(request.parameters["month"])
            ?: return LocalReadSupport.invalidArgument(request, "month must be an integer")
        if (year !in 2020..2100 || month !in 1..12) {
            return LocalReadSupport.invalidArgument(request, "year or month is out of range")
        }
        return try {
            val report = runBlocking {
                withContext(ioDispatcher) {
                    port.monthlyReport(request.auth!!.userUid!!, supplierId, year, month)
                }
            }
            LocalReadSupport.success(
                request, mapOf("report" to report),
                listOf("Read from local Room with explicit auth userUid; sync freshness is unknown")
            )
        } catch (_: Throwable) {
            LocalReadSupport.internalError(request, "Monthly report read failed")
        }
    }

    private fun number(raw: Any?): Int? = when (raw) {
        is Number -> raw.toInt()
        is String -> raw.toIntOrNull()
        else -> null
    }
}
