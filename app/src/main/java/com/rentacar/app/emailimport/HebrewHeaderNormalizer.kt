package com.rentacar.app.emailimport

/**
 * Robust Hebrew header normalization for commission report tables.
 * Does not alter business cell values — headers only.
 */
object HebrewHeaderNormalizer {

    private val FORMAT_CHARS = Regex("[\\u200E\\u200F\\u200B\\u200C\\u200D\\uFEFF\\u202A-\\u202E]")

    fun normalize(value: String): String =
        value.trim()
            .replace(FORMAT_CHARS, "")
            .replace("\u00A0", " ")
            .replace("\u2007", " ")
            .replace("\u202F", " ")
            .replace("\"", "")
            .replace("״", "")
            .replace("׳", "")
            .replace("'", "")
            .replace("`", "")
            .replace("·", "")
            // Collapse duplicated final yod common in Shagrir HTML (לפניי → לפני)
            .replace("לפניי", "לפני")
            .replace(Regex("\\s+"), "")

    fun matches(a: String, b: String): Boolean =
        normalize(a) == normalize(b)

    fun findKey(headers: Collection<String>, expected: String, aliases: List<String> = emptyList()): String? {
        val targets = (listOf(expected) + aliases).map { normalize(it) }.toSet()
        return headers.firstOrNull { normalize(it) in targets }
    }
}
