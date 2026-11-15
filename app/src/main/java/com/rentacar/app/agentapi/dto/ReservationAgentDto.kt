package com.rentacar.app.agentapi.dto

import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus

/**
 * Minimized reservation projection for Agent API.
 *
 * Identifier semantics (do not conflate):
 * - [id]: internal Room PK
 * - [supplierOrderNumber]: supplier-facing order number
 * - [externalContractNumber]: external contract / reconciliation id
 *
 * Excludes [Reservation.notes] (may contain sensitive card fragments) and [Reservation.userUid].
 */
data class ReservationAgentDto(
    val id: Long,
    val customerId: Long,
    val supplierId: Long,
    val branchId: Long,
    val carTypeId: Long,
    val carTypeName: String? = null,
    val agentId: Long? = null,
    val dateFrom: Long,
    val dateTo: Long,
    val actualReturnDate: Long? = null,
    val includeVat: Boolean = true,
    val vatPercentAtCreation: Double? = null,
    val airportMode: Boolean = false,
    val agreedPrice: Double,
    val kmIncluded: Int,
    val requiredHoldAmount: Int,
    val periodTypeDays: Int = 1,
    val commissionPercentUsed: Double? = null,
    val status: String,
    val isClosed: Boolean = false,
    val isQuote: Boolean = false,
    val supplierOrderNumber: String? = null,
    val externalContractNumber: String? = null,
    val createdAt: Long,
    val updatedAt: Long
)

object ReservationAgentDtoMapper {
    private val restrictedEntityFields = setOf(
        "notes",
        "userUid",
        "user_uid"
    )

    fun toDto(reservation: Reservation): ReservationAgentDto = ReservationAgentDto(
        id = reservation.id,
        customerId = reservation.customerId,
        supplierId = reservation.supplierId,
        branchId = reservation.branchId,
        carTypeId = reservation.carTypeId,
        carTypeName = reservation.carTypeName,
        agentId = reservation.agentId,
        dateFrom = reservation.dateFrom,
        dateTo = reservation.dateTo,
        actualReturnDate = reservation.actualReturnDate,
        includeVat = reservation.includeVat,
        vatPercentAtCreation = reservation.vatPercentAtCreation,
        airportMode = reservation.airportMode,
        agreedPrice = reservation.agreedPrice,
        kmIncluded = reservation.kmIncluded,
        requiredHoldAmount = reservation.requiredHoldAmount,
        periodTypeDays = reservation.periodTypeDays,
        commissionPercentUsed = reservation.commissionPercentUsed,
        status = reservation.status.name,
        isClosed = reservation.isClosed,
        isQuote = reservation.isQuote,
        supplierOrderNumber = reservation.supplierOrderNumber,
        externalContractNumber = reservation.externalContractNumber,
        createdAt = reservation.createdAt,
        updatedAt = reservation.updatedAt
    )

    fun restrictedFieldNames(): Set<String> = restrictedEntityFields

    fun parseStatus(raw: String): ReservationStatus? =
        ReservationStatus.entries.firstOrNull { it.name.equals(raw.trim(), ignoreCase = true) }
}
