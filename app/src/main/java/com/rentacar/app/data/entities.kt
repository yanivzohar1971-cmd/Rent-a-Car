package com.rentacar.app.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.ColumnInfo
import androidx.room.ForeignKey

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
    val updatedAt: Long = System.currentTimeMillis(),
    @ColumnInfo(name = "user_uid") val userUid: String? = null
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
    @ColumnInfo(name = "import_template_id") val importTemplateId: Long? = null,
    // Price list import function code (100, 101...) - determines which price list import strategy to use
    @ColumnInfo(name = "price_list_import_function_code") val priceListImportFunctionCode: Int? = null,
    @ColumnInfo(name = "user_uid") val userUid: String? = null
)

@Entity(indices = [Index(value = ["supplierId"])])
data class Branch(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val address: String? = null,
    val city: String? = null,
    val street: String? = null,
    val phone: String? = null,
    val supplierId: Long,
    @ColumnInfo(name = "user_uid") val userUid: String? = null
)

@Entity
data class CarType(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    @ColumnInfo(name = "user_uid") val userUid: String? = null
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
    val updatedAt: Long = System.currentTimeMillis(),
    @ColumnInfo(name = "user_uid") val userUid: String? = null
)

@Entity
data class Payment(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val reservationId: Long,
    val amount: Double,
    val date: Long,
    val method: String,
    val note: String? = null,
    @ColumnInfo(name = "user_uid") val userUid: String? = null
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
    val holderTz: String? = null,
    @ColumnInfo(name = "user_uid") val userUid: String? = null
)

@Entity
data class CommissionRule(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val minDays: Int,
    val maxDays: Int?,
    val percent: Double,
    @ColumnInfo(name = "user_uid") val userUid: String? = null
)

@Entity
data class Agent(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val phone: String? = null,
    val email: String? = null,
    val active: Boolean = true,
    @ColumnInfo(name = "user_uid") val userUid: String? = null
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
    val createdAt: Long = System.currentTimeMillis(),
    @ColumnInfo(name = "user_uid") val userUid: String? = null
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
    val updatedAt: Long = System.currentTimeMillis(),
    @ColumnInfo(name = "user_uid") val userUid: String? = null,
    // New fields for Yard fleet management (backward compatible - all nullable)
    val brand: String? = null,
    val model: String? = null,
    val year: Int? = null,
    val mileageKm: Int? = null,
    @ColumnInfo(name = "publication_status") val publicationStatus: String? = null, // CarPublicationStatus.value
    @ColumnInfo(name = "images_json") val imagesJson: String? = null, // JSON array of CarImage
    // CarListing V2 fields (all nullable for backward compatibility)
    // Context / ownership
    @ColumnInfo(name = "role_context") val roleContext: String? = null, // RoleContext enum name
    @ColumnInfo(name = "sale_owner_type") val saleOwnerType: String? = null, // SaleOwnerType enum name
    // Catalog linkage (graph IDs - optional for now)
    @ColumnInfo(name = "brand_id") val brandId: String? = null,
    @ColumnInfo(name = "model_family_id") val modelFamilyId: String? = null,
    @ColumnInfo(name = "generation_id") val generationId: String? = null,
    @ColumnInfo(name = "variant_id") val variantId: String? = null,
    @ColumnInfo(name = "engine_id") val engineId: String? = null,
    @ColumnInfo(name = "transmission_id") val transmissionId: String? = null,
    // Engine-related snapshot (optional)
    @ColumnInfo(name = "engine_displacement_cc") val engineDisplacementCc: Int? = null,
    @ColumnInfo(name = "engine_power_hp") val enginePowerHp: Int? = null,
    @ColumnInfo(name = "fuel_type") val fuelType: String? = null, // FuelType enum name
    // Gearbox-related snapshot (optional)
    @ColumnInfo(name = "gearbox_type") val gearboxType: String? = null, // GearboxType enum name
    @ColumnInfo(name = "gear_count") val gearCount: Int? = null,
    // Additional car details (optional)
    @ColumnInfo(name = "hand_count") val handCount: Int? = null, // מספר יד
    @ColumnInfo(name = "body_type") val bodyType: String? = null, // BodyType enum name
    @ColumnInfo(name = "ac") val ac: Boolean? = null,
    @ColumnInfo(name = "ownership_details") val ownershipDetails: String? = null, // e.g. "ליסינג פרטי"
    @ColumnInfo(name = "license_plate_partial") val licensePlatePartial: String? = null,
    @ColumnInfo(name = "vin_last_digits") val vinLastDigits: String? = null,
    @ColumnInfo(name = "color") val color: String? = null
)

@Entity(tableName = "supplier_price_list_header")
data class SupplierPriceListHeader(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    @ColumnInfo(name = "supplier_id")
    val supplierId: Long,
    val year: Int,
    val month: Int,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "is_active")
    val isActive: Boolean = true,
    @ColumnInfo(name = "source_file_name")
    val sourceFileName: String? = null,
    val notes: String? = null,
    @ColumnInfo(name = "user_uid") val userUid: String? = null
)

@Entity(
    tableName = "supplier_price_list_item",
    foreignKeys = [
        androidx.room.ForeignKey(
            entity = SupplierPriceListHeader::class,
            parentColumns = ["id"],
            childColumns = ["header_id"],
            onDelete = androidx.room.ForeignKey.CASCADE
        )
    ],
    indices = [
        Index(value = ["header_id"]),
        Index(value = ["supplier_id"])
    ]
)
data class SupplierPriceListItem(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    @ColumnInfo(name = "header_id")
    val headerId: Long,
    @ColumnInfo(name = "supplier_id")
    val supplierId: Long,

    @ColumnInfo(name = "car_group_code")
    val carGroupCode: String?,
    @ColumnInfo(name = "car_group_name")
    val carGroupName: String?,

    val manufacturer: String?,
    val model: String?,

    // NIS prices
    @ColumnInfo(name = "daily_price_nis")
    val dailyPriceNis: Double?,
    @ColumnInfo(name = "weekly_price_nis")
    val weeklyPriceNis: Double?,
    @ColumnInfo(name = "monthly_price_nis")
    val monthlyPriceNis: Double?,

    // USD prices
    @ColumnInfo(name = "daily_price_usd")
    val dailyPriceUsd: Double?,
    @ColumnInfo(name = "weekly_price_usd")
    val weeklyPriceUsd: Double?,
    @ColumnInfo(name = "monthly_price_usd")
    val monthlyPriceUsd: Double?,

    // Shabbat insurance
    @ColumnInfo(name = "shabbat_insurance_nis")
    val shabbatInsuranceNis: Double?,
    @ColumnInfo(name = "shabbat_insurance_usd")
    val shabbatInsuranceUsd: Double?,

    // Included km
    @ColumnInfo(name = "included_km_per_day")
    val includedKmPerDay: Int?,
    @ColumnInfo(name = "included_km_per_week")
    val includedKmPerWeek: Int?,
    @ColumnInfo(name = "included_km_per_month")
    val includedKmPerMonth: Int?,

    // Extra km
    @ColumnInfo(name = "extra_km_price_nis")
    val extraKmPriceNis: Double?,
    @ColumnInfo(name = "extra_km_price_usd")
    val extraKmPriceUsd: Double?,

    // Deductible
    @ColumnInfo(name = "deductible_nis")
    val deductibleNis: Double?,
    @ColumnInfo(name = "user_uid") val userUid: String? = null
)

