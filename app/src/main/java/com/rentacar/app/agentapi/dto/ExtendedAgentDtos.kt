package com.rentacar.app.agentapi.dto

import com.rentacar.app.data.Agent
import com.rentacar.app.data.Branch
import com.rentacar.app.data.CarPublicationStatus
import com.rentacar.app.data.CarSale
import com.rentacar.app.data.Customer
import com.rentacar.app.data.Payment
import com.rentacar.app.data.Request
import com.rentacar.app.data.SupplierPriceListHeader

data class CarSaleAgentDto(
    val id: Long,
    val firstName: String,
    val lastName: String,
    val phone: String,
    val carTypeName: String,
    val saleDate: Long,
    val salePrice: Double,
    val commissionPrice: Double,
    val totalPaid: Double,
    val remaining: Double,
    val commissionStatus: String,
    val createdAt: Long,
    val updatedAt: Long,
    val brand: String?,
    val model: String?,
    val year: Int?,
    val mileageKm: Int?,
    val publicationStatus: String?,
    val licensePlatePartial: String?
)

fun CarSale.toAgentDto(totalPaid: Double = 0.0): CarSaleAgentDto {
    val totals = com.rentacar.app.data.CarSaleCommissionPaymentLogic
        .totals(commissionPrice, listOf(totalPaid))
    return CarSaleAgentDto(
        id, firstName, lastName, phone, carTypeName, saleDate, salePrice,
        commissionPrice, totals.totalPaid, totals.remaining,
        com.rentacar.app.data.CarSaleCommissionPaymentLogic
            .paymentStatus(commissionPrice, totals.totalPaid).name,
        createdAt, updatedAt, brand, model, year, mileageKm,
        CarPublicationStatus.fromString(publicationStatus).name,
        licensePlatePartial
    )
}

data class YardFleetAgentDto(
    val id: Long,
    val brand: String,
    val model: String,
    val year: Int?,
    val price: Int,
    val mileageKm: Int?,
    val status: String,
    val createdAt: Long,
    val licensePlatePartial: String?
)

fun CarSale.toYardAgentDto(): YardFleetAgentDto {
    val parts = carTypeName.trim().split(" ", limit = 2)
    val fallbackBrand = if (parts.size > 1) parts[0] else ""
    val fallbackModel = if (parts.size > 1) parts[1] else carTypeName
    return YardFleetAgentDto(
        id = id,
        brand = brand ?: fallbackBrand.ifBlank { "לא צוין" },
        model = model ?: fallbackModel.ifBlank { carTypeName },
        year = year,
        price = salePrice.toInt(),
        mileageKm = mileageKm,
        status = CarPublicationStatus.fromString(publicationStatus).name,
        createdAt = createdAt,
        licensePlatePartial = licensePlatePartial
    )
}

data class RequestAgentDto(
    val id: Long,
    val isPurchase: Boolean,
    val isQuote: Boolean,
    val firstName: String,
    val lastName: String,
    val phone: String,
    val carTypeName: String,
    val createdAt: Long
)
fun Request.toAgentDto() = RequestAgentDto(
    id, isPurchase, isQuote, firstName, lastName, phone, carTypeName, createdAt
)

data class AgentAgentDto(val id: Long, val name: String, val phone: String?, val email: String?, val active: Boolean)
fun Agent.toAgentDto() = AgentAgentDto(id, name, phone, email, active)

data class BranchAgentDto(
    val id: Long,
    val name: String,
    val address: String?,
    val city: String?,
    val street: String?,
    val phone: String?,
    val supplierId: Long
)
fun Branch.toAgentDto() = BranchAgentDto(id, name, address, city, street, phone, supplierId)

data class PriceListHeaderAgentDto(
    val id: Long,
    val supplierId: Long,
    val year: Int,
    val month: Int,
    val createdAt: Long,
    val isActive: Boolean,
    val sourceFileName: String?
)
fun SupplierPriceListHeader.toAgentDto() =
    PriceListHeaderAgentDto(id, supplierId, year, month, createdAt, isActive, sourceFileName)

data class PaymentAgentDto(
    val id: Long,
    val reservationId: Long,
    val amount: Double,
    val date: Long,
    val method: String,
    val note: String?
)
fun Payment.toAgentDto() = PaymentAgentDto(id, reservationId, amount, date, method, note)

fun Customer.toCustomerAgentDto(): CustomerAgentDto = CustomerAgentDtoMapper.toDto(this)
