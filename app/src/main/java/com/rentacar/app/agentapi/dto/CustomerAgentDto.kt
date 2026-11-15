package com.rentacar.app.agentapi.dto

import com.rentacar.app.data.Customer

/**
 * Minimized customer projection for Agent API.
 *
 * Identifier semantics (do not conflate):
 * - [id]: internal Room PK
 * - [phone]: contact phone (not a primary key)
 * - National ID ([Customer.tzId]) is intentionally excluded
 *
 * Excludes sensitive/personal fields: [Customer.tzId], [Customer.address], [Customer.userUid].
 */
data class CustomerAgentDto(
    val id: Long,
    val firstName: String,
    val lastName: String,
    val phone: String,
    val email: String? = null,
    val isCompany: Boolean = false,
    val active: Boolean = true,
    val createdAt: Long,
    val updatedAt: Long
)

object CustomerAgentDtoMapper {
    private val restrictedEntityFields = setOf(
        "tzId",
        "address",
        "userUid",
        "user_uid"
    )

    fun toDto(customer: Customer): CustomerAgentDto = CustomerAgentDto(
        id = customer.id,
        firstName = customer.firstName,
        lastName = customer.lastName,
        phone = customer.phone,
        email = customer.email,
        isCompany = customer.isCompany,
        active = customer.active,
        createdAt = customer.createdAt,
        updatedAt = customer.updatedAt
    )

    fun restrictedFieldNames(): Set<String> = restrictedEntityFields
}
