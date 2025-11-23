package com.rentacar.app.data

import kotlin.text.Regex

/**
 * Shared utilities for parsing and normalizing price list group/class data.
 * Used both at import time (Excel → DB) and at UI display time (safety net for legacy data).
 */

val hebrewRegex = Regex("[א-ת]")

/**
 * Extract Hebrew semantic group name from carGroupName/carGroupCode.
 * Returns the Hebrew part if found, null otherwise.
 */
fun extractHebrewGroupName(
    carGroupName: String?,
    carGroupCode: String?
): String? {
    val raw = carGroupName?.trim().takeUnless { it.isNullOrBlank() }
        ?: carGroupCode?.trim().takeUnless { it.isNullOrBlank() }
        ?: return null

    val parts = raw.split('-')
    if (parts.size >= 2) {
        val left = parts[0].trim()
        val right = parts[1].trim()
        val leftHasHebrew = hebrewRegex.containsMatchIn(left)
        val rightHasHebrew = hebrewRegex.containsMatchIn(right)

        return when {
            leftHasHebrew && !rightHasHebrew -> left
            rightHasHebrew && !leftHasHebrew -> right
            leftHasHebrew && rightHasHebrew  -> right // arbitrary but stable
            else                             -> raw
        }
    }

    // No dash -> if it has Hebrew, use it; otherwise null
    return if (hebrewRegex.containsMatchIn(raw)) raw else null
}

/**
 * Normalize the source string for class parsing by:
 * - Converting exotic dashes to plain '-'
 * - Collapsing whitespace
 */
fun normalizeClassSource(
    carGroupName: String?,
    carGroupCode: String?
): String {
    val raw = buildString {
        if (!carGroupCode.isNullOrBlank()) append(carGroupCode).append(' ')
        if (!carGroupName.isNullOrBlank()) append(carGroupName)
    }

    if (raw.isBlank()) return ""

    return raw
        // normalize exotic dashes to a plain '-'
        .replace('–', '-')
        .replace('־', '-') // Hebrew maqaf
        .replace('—', '-')
        // collapse whitespace
        .replace(Regex("\\s+"), " ")
        .trim()
}

private val classPatternDash = Regex(
    pattern = "\\b([A-Za-z])\\b\\s*[- ]\\s*(\\d{2,4}(?:/\\d{2,4})?)",
    option = RegexOption.IGNORE_CASE
)

private val classPatternLetterThenDigits = Regex(
    pattern = "\\b([A-Za-z])\\b\\s+(\\d{2,4}(?:/\\d{2,4})?)",
    option = RegexOption.IGNORE_CASE
)

private val classPatternDigitsThenLetterInParens = Regex(
    pattern = "(\\d{2,4}).*?\\(([A-Za-z])\\)",
    option = RegexOption.IGNORE_CASE
)

private val classPatternLetterNearDigits = Regex(
    pattern = "([A-Za-z]).*?(\\d{2,4})",
    option = RegexOption.IGNORE_CASE
)

/**
 * Template-based parsing of class info from messy group code/name strings.
 *
 * Returns:
 *  - first  = uppercase letter (A/B/C/...)
 *  - second = "LETTER CODE" (for UI), e.g. "G 106", "B 100/101"
 */
fun parseClassInfo(
    carGroupName: String?,
    carGroupCode: String?
): Pair<String?, String?> {
    val source = normalizeClassSource(carGroupName, carGroupCode)
    if (source.isEmpty()) return null to null

    // 1) TEMPLATE: "G - 106", "G-106", "B 100/101"
    classPatternDash.find(source)?.let { m ->
        val letter = m.groupValues[1].uppercase()
        val code = m.groupValues[2]
        return letter to "$letter $code"
    }

    // 2) TEMPLATE: "G 106", "B 100/101" (no dash)
    classPatternLetterThenDigits.find(source)?.let { m ->
        val letter = m.groupValues[1].uppercase()
        val code = m.groupValues[2]
        return letter to "$letter $code"
    }

    // 3) TEMPLATE: "106 - ... (G)" → digits followed by letter in parentheses
    classPatternDigitsThenLetterInParens.find(source)?.let { m ->
        val digits = m.groupValues[1]
        val letter = m.groupValues[2].uppercase()
        return letter to "$letter $digits"
    }

    // 4) TEMPLATE: generic "letter somewhere near digits", for future typos like:
    //    "קבוצת מנהלים G-106", "G 106 מנהלים", etc.
    classPatternLetterNearDigits.find(source)?.let { m ->
        val letter = m.groupValues[1].uppercase()
        val digits = m.groupValues[2]
        return letter to "$letter $digits"
    }

    // 5) Fallback: no class recognized
    return null to null
}

/**
 * Expand a "letter + code pattern" into individual variant codes, for future data processing.
 *
 * Example:
 *   expandClassVariants("B", "100/101") -> ["B 100", "B 101"]
 *   expandClassVariants("G", "106")     -> ["G 106"]
 *
 * Currently NOT used in this screen's UI or filtering, but provided for future logic.
 */
@Suppress("unused")
fun expandClassVariants(
    letter: String?,
    rawCode: String?
): List<String> {
    if (letter.isNullOrBlank() || rawCode.isNullOrBlank()) return emptyList()
    return rawCode
        .split('/')
        .mapNotNull { part ->
            val p = part.trim()
            if (p.isEmpty()) null else "$letter $p"
        }
}

