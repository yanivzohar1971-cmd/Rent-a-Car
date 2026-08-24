package com.rentacar.app.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Per-supplier customer reservation terms. Presence of customization is stored
 * separately so "customized with every term disabled" is not confused with
 * "never customized" (which falls back to application defaults).
 */
@Entity(
    tableName = "supplier_customer_term",
    indices = [
        Index(value = ["supplier_id", "language", "user_uid", "sort_order"]),
        Index(value = ["supplier_id", "language", "user_uid"]),
        Index(value = ["supplier_id"]),
        Index(value = ["user_uid"])
    ],
    foreignKeys = [
        ForeignKey(
            entity = Supplier::class,
            parentColumns = ["id"],
            childColumns = ["supplier_id"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class SupplierCustomerTerm(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "supplier_id") val supplierId: Long,
    val language: String,
    @ColumnInfo(name = "sort_order") val sortOrder: Int,
    @ColumnInfo(name = "text_template") val textTemplate: String,
    val enabled: Boolean = true,
    val bold: Boolean = false,
    @ColumnInfo(name = "text_color_argb") val textColorArgb: Int? = null,
    @ColumnInfo(name = "created_at") val createdAt: Long = System.currentTimeMillis(),
    @ColumnInfo(name = "updated_at") val updatedAt: Long = System.currentTimeMillis(),
    @ColumnInfo(name = "user_uid") val userUid: String? = null
)

/**
 * Marker row: if a language row exists for a supplier, that language is customized
 * even when every term is disabled or the terms list is empty.
 */
@Entity(
    tableName = "supplier_customer_terms_customization",
    indices = [
        Index(
            value = ["supplier_id", "language", "user_uid"],
            unique = true
        ),
        Index(value = ["supplier_id"]),
        Index(value = ["user_uid"])
    ],
    foreignKeys = [
        ForeignKey(
            entity = Supplier::class,
            parentColumns = ["id"],
            childColumns = ["supplier_id"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class SupplierCustomerTermsCustomization(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "supplier_id") val supplierId: Long,
    val language: String,
    @ColumnInfo(name = "updated_at") val updatedAt: Long = System.currentTimeMillis(),
    @ColumnInfo(name = "user_uid") val userUid: String? = null
)
