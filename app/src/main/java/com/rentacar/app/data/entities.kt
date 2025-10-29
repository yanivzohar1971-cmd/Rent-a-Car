package com.rentacar.app.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.ColumnInfo

@Entity
data class Customer(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val firstName: String,
    val lastName: String,
    val phone: String,
    val tzId: String? = null,
    val address: String? = null,
    val email: String? = null,
    val isCompany: Boolean = false,
    val active: Boolean = true,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)

@Entity(indices = [Index(value = ["name"], unique = true)])
data class Supplier(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val address: String? = null,
    val taxId: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val defaultHold: Int = 2000,
    val fixedHold: Int? = null,
    // Commission settings per supplier (percent values like 15,10,7)
    val commissionDays1to6: Int? = null,
    val commissionDays7to23: Int? = null,
    val commissionDays24plus: Int? = null,
    // Active template for monthly imports
    val activeTemplateId: Long? = null,
    // Import function code (1, 2, 3...) - determines which sync strategy to use
    @ColumnInfo(name = "import_function_code") val importFunctionCode: Int? = null,
    // Import template ID - which SupplierTemplate to use for parsing Excel
    @ColumnInfo(name = "import_template_id") val importTemplateId: Long? = null
)

@Entity(indices = [Index(value = ["supplierId"])])
data class Branch(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val address: String? = null,
    val city: String? = null,
    val street: String? = null,
    val phone: String? = null,
    val supplierId: Long
)

@Entity
data class CarType(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String
)

enum class ReservationStatus { Draft, SentToSupplier, SentToCustomer, Confirmed, Paid, Cancelled }

@Entity
data class Reservation(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
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
    @ColumnInfo(defaultValue = "1") val periodTypeDays: Int = 1, // 1,7,24,30
    val commissionPercentUsed: Double? = null,
    val status: ReservationStatus = ReservationStatus.Draft,
    val isClosed: Boolean = false,
    val supplierOrderNumber: String? = null,
    val externalContractNumber: String? = null,  // Supplier's contract number for reconciliation
    val notes: String? = null,
    // true = quote reservation, false = regular reservation
    val isQuote: Boolean = false,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)

@Entity
data class Payment(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val reservationId: Long,
    val amount: Double,
    val date: Long,
    val method: String,
    val note: String? = null
)

@Entity
data class CardStub(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val reservationId: Long,
    val brand: String,
    val last4: String,
    val expMonth: Int? = null,
    val expYear: Int? = null,
    val holderFirstName: String? = null,
    val holderLastName: String? = null,
    val holderTz: String? = null
)

@Entity
data class CommissionRule(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val minDays: Int,
    val maxDays: Int?,
    val percent: Double
)

@Entity
data class Agent(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val phone: String? = null,
    val email: String? = null,
    val active: Boolean = true
)

@Entity
data class Request(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    // true = purchase request, false = rental request
    val isPurchase: Boolean = false,
    // true = quote request, false = regular rental request
    val isQuote: Boolean = false,
    val firstName: String,
    val lastName: String,
    val phone: String,
    val carTypeName: String,
    val createdAt: Long = System.currentTimeMillis()
)


@Entity
data class CarSale(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val firstName: String,
    val lastName: String,
    val phone: String,
    val carTypeName: String,
    val saleDate: Long,
    val salePrice: Double,
    val commissionPrice: Double,
    val notes: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)

