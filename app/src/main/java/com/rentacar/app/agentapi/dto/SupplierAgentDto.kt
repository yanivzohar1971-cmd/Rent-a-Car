package com.rentacar.app.agentapi.dto

import com.rentacar.app.data.Supplier

/**
 * Minimized supplier projection for Agent API responses.
 * Excludes import plumbing and commission-report mailbox configuration.
 */
data class SupplierAgentDto(
    val id: Long,
    val name: String,
    val address: String? = null,
    val taxId: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val defaultHold: Int = 0,
    val fixedHold: Int? = null,
    val commissionDays1to6: Int? = null,
    val commissionDays7to23: Int? = null,
    val commissionDays24plus: Int? = null
)

object SupplierAgentDtoMapper {
    private val restrictedEntityFields = setOf(
        "commissionReportEmail",
        "commissionReportFormat",
        "importFunctionCode",
        "importTemplateId",
        "priceListImportFunctionCode",
        "activeTemplateId",
        "userUid"
    )

    fun toDto(supplier: Supplier): SupplierAgentDto = SupplierAgentDto(
        id = supplier.id,
        name = supplier.name,
        address = supplier.address,
        taxId = supplier.taxId,
        phone = supplier.phone,
        email = supplier.email,
        defaultHold = supplier.defaultHold,
        fixedHold = supplier.fixedHold,
        commissionDays1to6 = supplier.commissionDays1to6,
        commissionDays7to23 = supplier.commissionDays7to23,
        commissionDays24plus = supplier.commissionDays24plus
    )

    fun restrictedFieldNames(): Set<String> = restrictedEntityFields
}
