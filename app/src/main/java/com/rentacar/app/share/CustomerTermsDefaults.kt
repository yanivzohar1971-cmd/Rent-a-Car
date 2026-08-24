package com.rentacar.app.share

/**
 * Canonical default customer reservation terms.
 * Wording is preserved verbatim from the previous Screens.kt implementation,
 * with the credit-hold amount replaced by the {HOLD_AMOUNT} template token.
 */
object CustomerTermsDefaults {
    const val HEADING_HE = "תנאים והגבלות (יש להגיע עם):"
    const val HEADING_EN = "Terms & requirements (please bring):"

    val HEBREW_TEMPLATES: List<String> = listOf(
        "רישיון נהיגה מקורי בתוקף.",
        "תעודת זהות מקורית.",
        "כרטיס אשראי עם מסגרת פנויה (מינ׳ {HOLD_AMOUNT} ₪ או לפי מדיניות הספק). בעל הכרטיס צריך להיות נוכח.",
        "החברה אינה מתחייבת לדגם או צבע.",
        "אי הגעה בזמן הנקוב עלולה לגרום לביטול ההזמנה!"
    )

    val ENGLISH_TEMPLATES: List<String> = listOf(
        "Valid original driver's license.",
        "Original ID card.",
        "Credit card with available limit (min ₪{HOLD_AMOUNT} or per supplier policy). Cardholder must be present.",
        "We do not guarantee model or color.",
        "Late arrival/no-show may result in cancellation!"
    )

    fun heading(language: ShareLanguage): String = when (language) {
        ShareLanguage.HE -> HEADING_HE
        ShareLanguage.EN -> HEADING_EN
    }

    fun templates(language: ShareLanguage): List<String> = when (language) {
        ShareLanguage.HE -> HEBREW_TEMPLATES
        ShareLanguage.EN -> ENGLISH_TEMPLATES
    }

    fun terms(language: ShareLanguage): List<CustomerTermTemplate> =
        templates(language).mapIndexed { index, text ->
            CustomerTermTemplate(
                textTemplate = text,
                enabled = true,
                bold = false,
                textColorArgb = null,
                sortOrder = index
            )
        }
}

data class CustomerTermTemplate(
    val textTemplate: String,
    val enabled: Boolean = true,
    val bold: Boolean = false,
    val textColorArgb: Int? = null,
    val sortOrder: Int = 0
)

data class EffectiveCustomerTerms(
    val language: ShareLanguage,
    val customized: Boolean,
    val terms: List<CustomerTermTemplate>
) {
    companion object {
        fun defaults(language: ShareLanguage): EffectiveCustomerTerms =
            EffectiveCustomerTerms(
                language = language,
                customized = false,
                terms = CustomerTermsDefaults.terms(language)
            )
    }
}

object EffectiveCustomerTermsResolver {
    fun resolve(
        language: ShareLanguage,
        customized: Boolean,
        customRows: List<CustomerTermTemplate>
    ): EffectiveCustomerTerms {
        return if (customized) {
            EffectiveCustomerTerms(
                language = language,
                customized = true,
                terms = customRows.sortedBy { it.sortOrder }
            )
        } else {
            EffectiveCustomerTerms.defaults(language)
        }
    }
}
