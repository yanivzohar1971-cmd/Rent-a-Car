package com.rentacar.app.agentapi.customer

import com.rentacar.app.data.Customer
import com.rentacar.app.data.CustomerRepository
import kotlinx.coroutines.flow.first

/**
 * Read-only port over the existing customer repository.
 * Keeps Agent API free of Room/DAO coupling while reusing production data access.
 *
 * Implementations must enforce the caller's UID / account scope — never return
 * cross-user rows.
 */
interface CustomerReadPort {
    /**
     * All customers for the user (active + inactive), matching
     * [CustomerRepository.listAllForUser] / CustomersListScreen empty-query path.
     */
    suspend fun listForUser(userUid: String): List<Customer>

    /**
     * Active-only search matching [CustomerRepository.searchForUser]
     * (firstName/lastName/phone/tzId/email LIKE).
     */
    suspend fun searchForUser(query: String, userUid: String): List<Customer>

    suspend fun getByIdForUser(id: Long, userUid: String): Customer?
}

/**
 * Repository-backed [CustomerReadPort] using existing Room UID scoping.
 */
class RepositoryCustomerReadPort(
    private val repository: CustomerRepository
) : CustomerReadPort {
    override suspend fun listForUser(userUid: String): List<Customer> =
        repository.listAllForUser(userUid).first()

    override suspend fun searchForUser(query: String, userUid: String): List<Customer> =
        repository.searchForUser(query, userUid).first()

    override suspend fun getByIdForUser(id: Long, userUid: String): Customer? =
        repository.getByIdForUser(id, userUid).first()
}
