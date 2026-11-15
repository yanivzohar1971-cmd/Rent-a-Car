package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.cloud.CloudReadAllowlist
import com.rentacar.app.agentapi.cloud.CloudReadPort
import com.rentacar.app.agentapi.cloud.CloudReadResult
import com.rentacar.app.agentapi.dto.CustomerAgentDto
import com.rentacar.app.agentapi.dto.ReservationAgentDto
import com.rentacar.app.agentapi.dto.SupplierAgentDto
import com.rentacar.app.agentapi.execution.LocalReadSupport
import com.rentacar.app.agentapi.model.AgentPaginationMetadata
import com.rentacar.app.agentapi.model.AgentResultCompleteness

/**
 * ISOLATED TEST DOUBLE — NOT live Firebase, no network, no Firestore SDK.
 *
 * Serves deterministic per-uid data for the allowlisted cloud reads so the cloud executor and the
 * target router can be tested without any cloud project. Rows are only returned for the uid they
 * were seeded under.
 */
class InMemoryIsolatedCloudReadPort(
    override var activated: Boolean = true
) : CloudReadPort {
    /** When true, [read] behaves like a cloud outage (returns null). */
    var outage: Boolean = false
    var throwOnRead: Boolean = false
    var readCount: Int = 0
        private set

    private val suppliers = HashMap<String, MutableList<SupplierAgentDto>>()
    private val customers = HashMap<String, MutableList<CustomerAgentDto>>()
    private val reservations = HashMap<String, MutableList<ReservationAgentDto>>()

    fun seedSuppliers(uid: String, vararg rows: SupplierAgentDto) { suppliers.getOrPut(uid) { mutableListOf() }.addAll(rows) }
    fun seedCustomers(uid: String, vararg rows: CustomerAgentDto) { customers.getOrPut(uid) { mutableListOf() }.addAll(rows) }
    fun seedReservations(uid: String, vararg rows: ReservationAgentDto) { reservations.getOrPut(uid) { mutableListOf() }.addAll(rows) }

    override fun read(operation: String, uid: String, parameters: Map<String, Any?>): CloudReadResult? {
        readCount++
        if (!activated || outage) return null
        if (throwOnRead) error("isolated cloud port failure")
        if (!CloudReadAllowlist.isAllowed(operation)) return null
        val page = LocalReadSupport.PageParams(
            limit = (parameters["limit"] as? Number)?.toInt() ?: LocalReadSupport.DEFAULT_LIMIT,
            offset = (parameters["offset"] as? Number)?.toInt() ?: 0
        )
        val query = parameters["query"]?.toString()?.trim().orEmpty()
        return when (operation) {
            CloudReadAllowlist.SUPPLIER_LIST -> list(
                suppliers[uid].orEmpty()
                    .sortedWith(compareBy({ it.name.lowercase() }, { it.id }))
                    .filter { query.isEmpty() || it.name.contains(query, ignoreCase = true) },
                page
            )
            CloudReadAllowlist.SUPPLIER_GET -> get(suppliers[uid].orEmpty().firstOrNull { it.id == parameters["id"] })
            CloudReadAllowlist.CUSTOMER_LIST -> list(
                customers[uid].orEmpty()
                    .sortedBy { it.id }
                    .filter {
                        query.isEmpty() || "${it.firstName} ${it.lastName}".contains(query, ignoreCase = true) ||
                            it.phone.contains(query)
                    },
                page
            )
            CloudReadAllowlist.CUSTOMER_GET -> get(customers[uid].orEmpty().firstOrNull { it.id == parameters["id"] })
            CloudReadAllowlist.RESERVATION_LIST_MANAGE -> list(reservations[uid].orEmpty().sortedBy { it.id }, page)
            CloudReadAllowlist.RESERVATION_GET -> get(reservations[uid].orEmpty().firstOrNull { it.id == parameters["id"] })
            else -> null
        }
    }

    private fun <T> list(all: List<T>, page: LocalReadSupport.PageParams): CloudReadResult {
        val (slice, total, hasMore) = LocalReadSupport.paginate(all, page)
        return CloudReadResult(
            data = mapOf("items" to slice, "totalMatching" to total),
            completeness = if (hasMore) AgentResultCompleteness.PARTIAL else AgentResultCompleteness.COMPLETE,
            pagination = AgentPaginationMetadata(page.limit, page.offset, total, hasMore),
            warnings = listOf(ISOLATED_WARNING)
        )
    }

    private fun get(item: Any?): CloudReadResult =
        if (item == null) {
            CloudReadResult(notFound = true)
        } else {
            CloudReadResult(
                data = mapOf("item" to item),
                completeness = AgentResultCompleteness.COMPLETE,
                warnings = listOf(ISOLATED_WARNING)
            )
        }

    companion object {
        const val ISOLATED_WARNING = "ISOLATED in-memory cloud test data (not live Firebase)"

        const val UID = "cloud-user"
        const val OTHER_UID = "other-cloud-user"

        fun reservation(id: Long, supplierId: Long = 1, customerId: Long = 1) = ReservationAgentDto(
            id = id, customerId = customerId, supplierId = supplierId, branchId = 1, carTypeId = 1,
            dateFrom = 1_000, dateTo = 2_000, agreedPrice = 100.0 * id, kmIncluded = 100,
            requiredHoldAmount = 500, status = "CONFIRMED", createdAt = 1, updatedAt = 1
        )

        /** Three suppliers / customers / reservations for [UID], one of each for [OTHER_UID]. */
        fun withDeterministicFixtures(activated: Boolean = true) = InMemoryIsolatedCloudReadPort(activated).apply {
            seedSuppliers(
                UID,
                SupplierAgentDto(id = 2, name = "Beta Cloud Supplier"),
                SupplierAgentDto(id = 1, name = "Alpha Cloud Supplier"),
                SupplierAgentDto(id = 3, name = "Gamma Cloud Supplier")
            )
            seedSuppliers(OTHER_UID, SupplierAgentDto(id = 9, name = "Foreign Supplier"))
            seedCustomers(
                UID,
                CustomerAgentDto(1, "Dana", "Levi", "0501111111", createdAt = 1, updatedAt = 1),
                CustomerAgentDto(2, "Omer", "Cohen", "0502222222", createdAt = 1, updatedAt = 1),
                CustomerAgentDto(3, "Noa", "Mizrahi", "0503333333", createdAt = 1, updatedAt = 1)
            )
            seedCustomers(OTHER_UID, CustomerAgentDto(9, "Foreign", "Customer", "0509999999", createdAt = 1, updatedAt = 1))
            seedReservations(UID, reservation(1), reservation(2), reservation(3))
            seedReservations(OTHER_UID, reservation(9))
        }
    }
}
