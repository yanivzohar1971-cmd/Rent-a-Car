package com.rentacar.app.share

import java.util.Locale

enum class TemplateVariableIconKind {
    CREDIT_HOLD,
    SUPPLIER,
    BRANCH,
    CUSTOMER,
    PRICE,
    CAR_TYPE
}

data class TemplateVariable(
    val token: String,
    val displayNameHe: String,
    val displayNameEn: String,
    val iconKind: TemplateVariableIconKind,
    val resolve: (TemplateResolutionContext) -> String
) {
    val wrappedToken: String get() = "{$token}"

    fun displayName(language: ShareLanguage): String = when (language) {
        ShareLanguage.HE -> displayNameHe
        ShareLanguage.EN -> displayNameEn
    }
}

data class TemplateResolutionContext(
    val language: ShareLanguage = ShareLanguage.HE,
    val holdAmount: Int? = null,
    val supplierName: String? = null,
    val branchName: String? = null,
    val customerName: String? = null,
    val price: Double? = null,
    val carType: String? = null
)

object TemplateVariableRegistry {
    const val HOLD_AMOUNT = "HOLD_AMOUNT"
    const val SUPPLIER = "SUPPLIER"
    const val BRANCH = "BRANCH"
    const val CUSTOMER = "CUSTOMER"
    const val PRICE = "PRICE"
    const val CAR_TYPE = "CAR_TYPE"

    val ALL: List<TemplateVariable> = listOf(
        TemplateVariable(
            token = HOLD_AMOUNT,
            displayNameHe = "מסגרת אשראי",
            displayNameEn = "Credit Hold",
            iconKind = TemplateVariableIconKind.CREDIT_HOLD,
            resolve = { ctx -> formatAmount(ctx.holdAmount) }
        ),
        TemplateVariable(
            token = SUPPLIER,
            displayNameHe = "ספק",
            displayNameEn = "Supplier",
            iconKind = TemplateVariableIconKind.SUPPLIER,
            resolve = { ctx -> ctx.supplierName.orEmpty() }
        ),
        TemplateVariable(
            token = BRANCH,
            displayNameHe = "סניף",
            displayNameEn = "Branch",
            iconKind = TemplateVariableIconKind.BRANCH,
            resolve = { ctx -> ctx.branchName.orEmpty() }
        ),
        TemplateVariable(
            token = CUSTOMER,
            displayNameHe = "לקוח",
            displayNameEn = "Customer",
            iconKind = TemplateVariableIconKind.CUSTOMER,
            resolve = { ctx -> ctx.customerName.orEmpty() }
        ),
        TemplateVariable(
            token = PRICE,
            displayNameHe = "מחיר",
            displayNameEn = "Price",
            iconKind = TemplateVariableIconKind.PRICE,
            resolve = { ctx -> formatPrice(ctx.price, ctx.language) }
        ),
        TemplateVariable(
            token = CAR_TYPE,
            displayNameHe = "סוג רכב",
            displayNameEn = "Car Type",
            iconKind = TemplateVariableIconKind.CAR_TYPE,
            resolve = { ctx -> ctx.carType.orEmpty() }
        )
    )

    fun find(token: String): TemplateVariable? = ALL.firstOrNull { it.token == token }

    fun selectorLabels(language: ShareLanguage): List<Pair<String, String>> =
        ALL.map { it.token to it.displayName(language) }

    fun values(context: TemplateResolutionContext): Map<String, String> =
        ALL.associate { it.token to it.resolve(context) }

    fun formatAmount(amount: Int?): String {
        if (amount == null) return ""
        return "%,d".format(Locale.US, amount)
    }

    fun formatPrice(price: Double?, language: ShareLanguage): String {
        if (price == null) return ""
        val amount = formatAmount(price.toInt())
        return when (language) {
            ShareLanguage.HE -> "$amount ₪"
            ShareLanguage.EN -> "₪$amount"
        }
    }
}

object TemplateResolver {
    private val TOKEN_REGEX = Regex("\\{([A-Z][A-Z0-9_]*)\\}")

    fun resolve(template: String, values: Map<String, String>): String {
        if (template.isEmpty()) return template
        return TOKEN_REGEX.replace(template) { match ->
            val token = match.groupValues[1]
            values[token] ?: match.value
        }
    }

    fun resolve(template: String, context: TemplateResolutionContext): String {
        return resolve(template, TemplateVariableRegistry.values(context))
    }

    fun insertToken(text: String, token: String, selectionStart: Int, selectionEnd: Int): TokenInsertionResult {
        val wrapped = if (token.startsWith("{") && token.endsWith("}")) token else "{$token}"
        val rawStart = coerceInsertionOffset(selectionStart, text.length)
        val rawEnd = coerceInsertionOffset(selectionEnd, text.length)
        val start = minOf(rawStart, rawEnd)
        val end = maxOf(rawStart, rawEnd)
        val before = text.getOrNull(start - 1)
        val after = text.getOrNull(end)
        val prefix = if (needsSpaceBefore(before)) " " else ""
        val suffix = if (needsSpaceAfter(after)) " " else ""
        val insertion = prefix + wrapped + suffix
        val newText = text.replaceRange(start, end, insertion)
        val cursor = start + insertion.length
        return TokenInsertionResult(text = newText, cursor = cursor)
    }

    internal fun needsSpaceBefore(before: Char?): Boolean {
        if (before == null || before.isWhitespace()) return false
        if (isOpeningPunctuation(before) || isQuote(before)) return false
        return true
    }

    internal fun needsSpaceAfter(after: Char?): Boolean {
        if (after == null || after.isWhitespace()) return false
        if (isClosingPunctuation(after) || isQuote(after)) return false
        return true
    }

    private fun isOpeningPunctuation(ch: Char): Boolean = ch in OPENING_PUNCTUATION

    private fun isClosingPunctuation(ch: Char): Boolean = ch in CLOSING_PUNCTUATION

    private fun isQuote(ch: Char): Boolean = ch in QUOTE_PUNCTUATION

    private val OPENING_PUNCTUATION = charArrayOf('(', '[', '{', '«', '“', '„')
    private val CLOSING_PUNCTUATION = charArrayOf('.', ',', ':', ';', '!', '?', ')', ']', '}', '»', '”')
    private val QUOTE_PUNCTUATION = charArrayOf('"', '\'', '׳', '״')

    fun coerceInsertionOffset(offset: Int, textLength: Int): Int {
        if (textLength <= 0) return 0
        return offset.coerceIn(0, textLength)
    }
}

data class TokenInsertionResult(
    val text: String,
    val cursor: Int
)
