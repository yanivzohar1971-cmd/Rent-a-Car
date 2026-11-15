package com.rentacar.app.agentapi.ports

import com.rentacar.app.data.ImportLogDao
import com.rentacar.app.data.SupplierImportRun

/**
 * Read-only access to supplier import run headers (import.log.list).
 * Entry rows (which carry contract numbers/amounts) are intentionally not exposed.
 */
interface ImportLogReadPort {
    /** Runs for the user, optionally scoped to a supplier. Always uid-scoped. */
    suspend fun runs(userUid: String, supplierId: Long?): List<SupplierImportRun>
}

/**
 * DAO-backed port. [supplierIds] resolves supplier ids owned by the uid so the
 * existing uid-scoped DAO query can be reused without new Room queries.
 */
class DaoImportLogReadPort(
    private val importLogDao: ImportLogDao,
    private val supplierIds: suspend (userUid: String) -> List<Long>
) : ImportLogReadPort {
    override suspend fun runs(userUid: String, supplierId: Long?): List<SupplierImportRun> {
        val ids = supplierId?.let(::listOf) ?: supplierIds(userUid)
        return ids.flatMap { importLogDao.getRunsForSupplier(it, userUid) }
            .sortedByDescending { it.importTime }
    }
}
