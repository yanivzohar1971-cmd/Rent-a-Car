package com.rentacar.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface SupplierCustomerTermDao {
    @Query(
        """
        SELECT * FROM supplier_customer_term
        WHERE supplier_id = :supplierId AND language = :language AND user_uid = :currentUid
        ORDER BY sort_order ASC, id ASC
        """
    )
    fun observeTerms(supplierId: Long, language: String, currentUid: String): Flow<List<SupplierCustomerTerm>>

    @Query(
        """
        SELECT * FROM supplier_customer_term
        WHERE supplier_id = :supplierId AND language = :language AND user_uid = :currentUid
        ORDER BY sort_order ASC, id ASC
        """
    )
    suspend fun getTerms(supplierId: Long, language: String, currentUid: String): List<SupplierCustomerTerm>

    @Query(
        """
        SELECT * FROM supplier_customer_term
        WHERE supplier_id = :supplierId AND user_uid = :currentUid
        ORDER BY language ASC, sort_order ASC, id ASC
        """
    )
    suspend fun getAllTermsForSupplier(supplierId: Long, currentUid: String): List<SupplierCustomerTerm>

    @Query(
        """
        SELECT * FROM supplier_customer_term
        WHERE user_uid = :currentUid
        ORDER BY supplier_id ASC, language ASC, sort_order ASC
        """
    )
    suspend fun getAllForUser(currentUid: String): List<SupplierCustomerTerm>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(term: SupplierCustomerTerm): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(terms: List<SupplierCustomerTerm>): List<Long>

    @Query(
        """
        DELETE FROM supplier_customer_term
        WHERE supplier_id = :supplierId AND language = :language AND user_uid = :currentUid
        """
    )
    suspend fun deleteTermsForLanguage(supplierId: Long, language: String, currentUid: String): Int

    @Query(
        """
        DELETE FROM supplier_customer_term
        WHERE supplier_id = :supplierId AND user_uid = :currentUid
        """
    )
    suspend fun deleteAllTermsForSupplier(supplierId: Long, currentUid: String): Int

    @Query(
        """
        SELECT * FROM supplier_customer_terms_customization
        WHERE supplier_id = :supplierId AND language = :language AND user_uid = :currentUid
        LIMIT 1
        """
    )
    fun observeCustomization(
        supplierId: Long,
        language: String,
        currentUid: String
    ): Flow<SupplierCustomerTermsCustomization?>

    @Query(
        """
        SELECT * FROM supplier_customer_terms_customization
        WHERE supplier_id = :supplierId AND language = :language AND user_uid = :currentUid
        LIMIT 1
        """
    )
    suspend fun getCustomization(
        supplierId: Long,
        language: String,
        currentUid: String
    ): SupplierCustomerTermsCustomization?

    @Query(
        """
        SELECT * FROM supplier_customer_terms_customization
        WHERE supplier_id = :supplierId AND user_uid = :currentUid
        """
    )
    suspend fun getCustomizationsForSupplier(
        supplierId: Long,
        currentUid: String
    ): List<SupplierCustomerTermsCustomization>

    @Query(
        """
        SELECT * FROM supplier_customer_terms_customization
        WHERE user_uid = :currentUid
        """
    )
    suspend fun getAllCustomizationsForUser(currentUid: String): List<SupplierCustomerTermsCustomization>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCustomization(row: SupplierCustomerTermsCustomization): Long

    @Query(
        """
        DELETE FROM supplier_customer_terms_customization
        WHERE supplier_id = :supplierId AND language = :language AND user_uid = :currentUid
        """
    )
    suspend fun deleteCustomization(supplierId: Long, language: String, currentUid: String): Int

    @Query(
        """
        DELETE FROM supplier_customer_terms_customization
        WHERE supplier_id = :supplierId AND user_uid = :currentUid
        """
    )
    suspend fun deleteAllCustomizationsForSupplier(supplierId: Long, currentUid: String): Int

    @Transaction
    suspend fun replaceLanguageSet(
        supplierId: Long,
        language: String,
        currentUid: String,
        terms: List<SupplierCustomerTerm>,
        now: Long = System.currentTimeMillis()
    ) {
        deleteTermsForLanguage(supplierId, language, currentUid)
        if (terms.isNotEmpty()) {
            val normalized = terms.mapIndexed { index, term ->
                term.copy(
                    id = 0,
                    supplierId = supplierId,
                    language = language,
                    sortOrder = index,
                    userUid = currentUid,
                    updatedAt = now,
                    createdAt = if (term.createdAt == 0L) now else term.createdAt
                )
            }
            insertAll(normalized)
        }
        val existing = getCustomization(supplierId, language, currentUid)
        insertCustomization(
            SupplierCustomerTermsCustomization(
                id = existing?.id ?: 0,
                supplierId = supplierId,
                language = language,
                updatedAt = now,
                userUid = currentUid
            )
        )
    }

    @Transaction
    suspend fun clearCustomizationForLanguage(
        supplierId: Long,
        language: String,
        currentUid: String
    ) {
        deleteTermsForLanguage(supplierId, language, currentUid)
        deleteCustomization(supplierId, language, currentUid)
    }

    @Transaction
    suspend fun clearAllForSupplier(supplierId: Long, currentUid: String) {
        deleteAllTermsForSupplier(supplierId, currentUid)
        deleteAllCustomizationsForSupplier(supplierId, currentUid)
    }
}
