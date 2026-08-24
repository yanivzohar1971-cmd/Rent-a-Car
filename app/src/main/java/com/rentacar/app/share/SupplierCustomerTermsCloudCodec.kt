package com.rentacar.app.share

/**
 * Serializes per-supplier customer terms into the supplier Firestore/backup document.
 *
 * Missing or null `customerTerms` means "use defaults" (legacy documents).
 * `customized = true` with an empty/all-disabled terms list is a real customization.
 */
object SupplierCustomerTermsCloudCodec {
    const val FIELD_CUSTOMER_TERMS = "customerTerms"

    data class LanguagePayload(
        val customized: Boolean,
        val terms: List<TermPayload>
    )

    data class TermPayload(
        val sortOrder: Int,
        val textTemplate: String,
        val enabled: Boolean,
        val bold: Boolean,
        val textColorArgb: Int?
    )

    data class DocumentPayload(
        val languages: Map<String, LanguagePayload>
    )

    fun encode(
        he: LanguagePayload?,
        en: LanguagePayload?
    ): Map<String, Any?> {
        val map = linkedMapOf<String, Any?>()
        map[ShareLanguage.HE.name] = encodeLanguage(he)
        map[ShareLanguage.EN.name] = encodeLanguage(en)
        return map
    }

    fun decode(raw: Any?): DocumentPayload {
        val languages = linkedMapOf<String, LanguagePayload>()
        val root = raw as? Map<*, *> ?: return DocumentPayload(emptyMap())
        for (lang in listOf(ShareLanguage.HE.name, ShareLanguage.EN.name)) {
            decodeLanguage(root[lang])?.let { languages[lang] = it }
        }
        return DocumentPayload(languages)
    }

    fun languagePayload(
        customized: Boolean,
        terms: List<CustomerTermTemplate>
    ): LanguagePayload = LanguagePayload(
        customized = customized,
        terms = terms.map { term ->
            TermPayload(
                sortOrder = term.sortOrder,
                textTemplate = term.textTemplate,
                enabled = term.enabled,
                bold = term.bold,
                textColorArgb = term.textColorArgb
            )
        }
    )

    fun toTemplates(payload: LanguagePayload): List<CustomerTermTemplate> =
        payload.terms.map {
            CustomerTermTemplate(
                textTemplate = it.textTemplate,
                enabled = it.enabled,
                bold = it.bold,
                textColorArgb = it.textColorArgb,
                sortOrder = it.sortOrder
            )
        }

    private fun encodeLanguage(payload: LanguagePayload?): Map<String, Any?> {
        if (payload == null || !payload.customized) {
            return mapOf(
                "customized" to false,
                "terms" to emptyList<Map<String, Any?>>()
            )
        }
        return mapOf(
            "customized" to true,
            "terms" to payload.terms.map { term ->
                mapOf(
                    "sortOrder" to term.sortOrder,
                    "textTemplate" to term.textTemplate,
                    "enabled" to term.enabled,
                    "bold" to term.bold,
                    "textColorArgb" to term.textColorArgb
                )
            }
        )
    }

    private fun decodeLanguage(raw: Any?): LanguagePayload? {
        if (raw == null) return null
        val map = raw as? Map<*, *> ?: return LanguagePayload(customized = false, terms = emptyList())
        val customized = when (val value = map["customized"]) {
            is Boolean -> value
            is Number -> value.toInt() != 0
            is String -> value.equals("true", ignoreCase = true)
            else -> false
        }
        val termsRaw = map["terms"] as? List<*> ?: emptyList<Any>()
        val terms = termsRaw.mapIndexedNotNull { index, item ->
            val termMap = item as? Map<*, *> ?: return@mapIndexedNotNull null
            TermPayload(
                sortOrder = (termMap["sortOrder"] as? Number)?.toInt() ?: index,
                textTemplate = termMap["textTemplate"] as? String ?: "",
                enabled = booleanOrDefault(termMap["enabled"], true),
                bold = booleanOrDefault(termMap["bold"], false),
                textColorArgb = (termMap["textColorArgb"] as? Number)?.toInt()
            )
        }
        return LanguagePayload(customized = customized, terms = terms)
    }

    private fun booleanOrDefault(value: Any?, default: Boolean): Boolean = when (value) {
        is Boolean -> value
        is Number -> value.toInt() != 0
        is String -> value.equals("true", ignoreCase = true)
        null -> default
        else -> default
    }
}
