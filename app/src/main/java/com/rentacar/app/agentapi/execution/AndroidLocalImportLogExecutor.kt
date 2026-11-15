package com.rentacar.app.agentapi.execution

import com.rentacar.app.agentapi.model.AgentOperationDefinition
import com.rentacar.app.agentapi.model.AgentPaginationMetadata
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
import com.rentacar.app.agentapi.ports.ImportLogReadPort
import com.rentacar.app.data.SupplierImportRun
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext

data class ImportRunAgentDto(
    val id: Long,
    val supplierId: Long,
    val importTimeEpochMs: Long,
    val fileName: String,
    val functionCode: Int,
    val year: Int,
    val month: Int,
    val rowsProcessed: Int,
    val rowsCreated: Int,
    val rowsUpdated: Int,
    val rowsClosed: Int,
    val rowsCancelled: Int,
    val rowsSkipped: Int,
    val success: Boolean,
    val errorMessage: String?
)

fun SupplierImportRun.toAgentDto() = ImportRunAgentDto(
    id = id,
    supplierId = supplierId,
    importTimeEpochMs = importTime,
    fileName = fileName,
    functionCode = functionCode,
    year = year,
    month = month,
    rowsProcessed = rowsProcessed,
    rowsCreated = rowsCreated,
    rowsUpdated = rowsUpdated,
    rowsClosed = rowsClosed,
    rowsCancelled = rowsCancelled,
    rowsSkipped = rowsSkipped,
    success = success,
    errorMessage = errorMessage?.take(500)
)

/** Local read executor for import.log.list (run headers only; no entries, no file hash). */
class AndroidLocalImportLogExecutor(
    private val port: ImportLogReadPort,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    fun execute(request: AgentRequest, definition: AgentOperationDefinition): AgentResponse {
        LocalReadSupport.authorize(request, definition)?.let { return LocalReadSupport.failure(request, it) }
        LocalReadSupport.validateLocalOrAutoTarget(request, "import log reads")?.let {
            return LocalReadSupport.failure(request, it)
        }
        LocalReadSupport.rejectUnknownParams(request, setOf("supplierId", "query", "limit", "offset"))?.let {
            return LocalReadSupport.failure(request, it)
        }
        val supplierRaw = request.parameters["supplierId"]
        val supplierId = LocalReadSupport.parseOptionalPositiveLong(supplierRaw)
        if (supplierRaw != null && supplierId == null) {
            return LocalReadSupport.invalidArgument(request, "supplierId must be a positive integer")
        }
        val page = LocalReadSupport.parsePagination(request).getOrElse {
            return LocalReadSupport.invalidArgument(request, it.message ?: "Invalid pagination")
        }
        val query = request.parameters["query"]?.toString()?.trim().orEmpty()
        return try {
            val uid = request.auth!!.userUid!!
            val rows = runBlocking { withContext(ioDispatcher) { port.runs(uid, supplierId) } }
                .filter { query.isEmpty() || it.fileName.contains(query, ignoreCase = true) }
                .map { it.toAgentDto() }
            val (items, total, more) = LocalReadSupport.paginate(rows, page)
            LocalReadSupport.success(
                request,
                mapOf("items" to items, "totalMatching" to total),
                listOf("Read from local Room import log; sync freshness is unknown"),
                AgentPaginationMetadata(page.limit, page.offset, total, more)
            )
        } catch (_: Throwable) {
            LocalReadSupport.internalError(request, "Import log read failed")
        }
    }
}
