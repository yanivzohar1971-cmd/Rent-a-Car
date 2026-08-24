package com.rentacar.app.data

import com.rentacar.app.data.auth.CurrentUserProvider
import com.rentacar.app.data.sync.SyncDirtyMarker
import com.rentacar.app.share.CustomerTermTemplate
import com.rentacar.app.share.EffectiveCustomerTerms
import com.rentacar.app.share.EffectiveCustomerTermsResolver
import com.rentacar.app.share.ShareLanguage
import com.rentacar.app.share.SupplierCustomerTermsCloudCodec
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine

class CustomerTermsRepository(
    private val dao: SupplierCustomerTermDao,
    private val syncDirtyMarker: SyncDirtyMarker? = null
) {
    private fun uid(): String = CurrentUserProvider.requireCurrentUid()

    fun observeEffectiveTerms(supplierId: Long, language: ShareLanguage): Flow<EffectiveCustomerTerms> {
        val currentUid = uid()
        val lang = language.name
        return combine(
            dao.observeCustomization(supplierId, lang, currentUid),
            dao.observeTerms(supplierId, lang, currentUid)
        ) { customization, rows ->
            EffectiveCustomerTermsResolver.resolve(
                language = language,
                customized = customization != null,
                customRows = rows.map { it.toTemplate() }
            )
        }
    }

    suspend fun getEffectiveTerms(supplierId: Long, language: ShareLanguage): EffectiveCustomerTerms {
        val currentUid = uid()
        val lang = language.name
        val customized = dao.getCustomization(supplierId, lang, currentUid) != null
        val rows = dao.getTerms(supplierId, lang, currentUid)
        return EffectiveCustomerTermsResolver.resolve(
            language = language,
            customized = customized,
            customRows = rows.map { it.toTemplate() }
        )
    }

    suspend fun saveTerms(
        supplierId: Long,
        language: ShareLanguage,
        terms: List<CustomerTermTemplate>
    ) {
        val currentUid = uid()
        val cleaned = terms
            .map { it.copy(textTemplate = it.textTemplate.trim()) }
            .filter { it.textTemplate.isNotEmpty() }
            .mapIndexed { index, term -> term.copy(sortOrder = index) }
        dao.replaceLanguageSet(
            supplierId = supplierId,
            language = language.name,
            currentUid = currentUid,
            terms = cleaned.map { it.toEntity(supplierId, language.name, currentUid) }
        )
        syncDirtyMarker?.markSupplierDirty(supplierId)
    }

    suspend fun resetToDefaults(supplierId: Long, language: ShareLanguage) {
        val currentUid = uid()
        dao.clearCustomizationForLanguage(supplierId, language.name, currentUid)
        syncDirtyMarker?.markSupplierDirty(supplierId)
    }

    suspend fun getCloudPayload(supplierId: Long): Map<String, Any?> {
        val currentUid = uid()
        return SupplierCustomerTermsCloudCodec.encode(
            he = languagePayload(supplierId, ShareLanguage.HE, currentUid),
            en = languagePayload(supplierId, ShareLanguage.EN, currentUid)
        )
    }

    suspend fun restoreFromCloudPayload(
        supplierId: Long,
        raw: Any?,
        userUid: String = uid()
    ) {
        val document = SupplierCustomerTermsCloudCodec.decode(raw)
        if (document.languages.isEmpty()) return
        for (language in listOf(ShareLanguage.HE, ShareLanguage.EN)) {
            val payload = document.languages[language.name] ?: continue
            if (!payload.customized) {
                dao.clearCustomizationForLanguage(supplierId, language.name, userUid)
                continue
            }
            val templates = SupplierCustomerTermsCloudCodec.toTemplates(payload)
            dao.replaceLanguageSet(
                supplierId = supplierId,
                language = language.name,
                currentUid = userUid,
                terms = templates.map { it.toEntity(supplierId, language.name, userUid) }
            )
        }
    }

    suspend fun getAllTermsForUser(userUid: String = uid()): List<SupplierCustomerTerm> =
        dao.getAllForUser(userUid)

    suspend fun getAllCustomizationsForUser(userUid: String = uid()): List<SupplierCustomerTermsCustomization> =
        dao.getAllCustomizationsForUser(userUid)

    suspend fun importTerm(term: SupplierCustomerTerm) {
        dao.insert(term)
    }

    suspend fun importCustomization(row: SupplierCustomerTermsCustomization) {
        dao.insertCustomization(row)
    }

    private suspend fun languagePayload(
        supplierId: Long,
        language: ShareLanguage,
        currentUid: String
    ): SupplierCustomerTermsCloudCodec.LanguagePayload {
        val customized = dao.getCustomization(supplierId, language.name, currentUid) != null
        val terms = dao.getTerms(supplierId, language.name, currentUid).map { it.toTemplate() }
        return SupplierCustomerTermsCloudCodec.languagePayload(customized, terms)
    }

    private fun SupplierCustomerTerm.toTemplate(): CustomerTermTemplate = CustomerTermTemplate(
        textTemplate = textTemplate,
        enabled = enabled,
        bold = bold,
        textColorArgb = textColorArgb,
        sortOrder = sortOrder
    )

    private fun CustomerTermTemplate.toEntity(
        supplierId: Long,
        language: String,
        userUid: String
    ): SupplierCustomerTerm {
        val now = System.currentTimeMillis()
        return SupplierCustomerTerm(
            id = 0,
            supplierId = supplierId,
            language = language,
            sortOrder = sortOrder,
            textTemplate = textTemplate,
            enabled = enabled,
            bold = bold,
            textColorArgb = textColorArgb,
            createdAt = now,
            updatedAt = now,
            userUid = userUid
        )
    }
}
