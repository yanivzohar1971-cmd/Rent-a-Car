package com.rentacar.app.agentapi.supplier

import com.rentacar.app.data.Supplier
import com.rentacar.app.data.SupplierRepository
import kotlinx.coroutines.flow.first

/**
 * Read-only port over the existing supplier repository.
 * Keeps Agent API free of Room/DAO coupling while reusing production data access.
 */
interface SupplierReadPort {
    suspend fun listForUser(userUid: String): List<Supplier>
    suspend fun getByIdForUser(id: Long, userUid: String): Supplier?
}

class RepositorySupplierReadPort(
    private val repository: SupplierRepository
) : SupplierReadPort {
    override suspend fun listForUser(userUid: String): List<Supplier> =
        repository.listForUser(userUid).first()

    override suspend fun getByIdForUser(id: Long, userUid: String): Supplier? =
        repository.getByIdForUser(id, userUid).first()
}
