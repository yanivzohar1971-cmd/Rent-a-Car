package com.rentacar.app.emailimport

/**
 * Normalizes email addresses for comparison.
 * Case-insensitive; trims whitespace; unwraps display-name / angle-bracket forms.
 */
object EmailAddressNormalizer {

    private val ANGLE_BRACKET = Regex("""<\s*([^<>@\s]+@[^<>@\s]+)\s*>""")
    private val BARE_EMAIL = Regex("""[A-Za-z0-9._%+\-']+[A-Za-z0-9._%+\-']*@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}""")

    fun normalize(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val trimmed = raw.trim()
        val fromBrackets = ANGLE_BRACKET.find(trimmed)?.groupValues?.getOrNull(1)
        val candidate = (fromBrackets ?: trimmed)
            .trim()
            .trim('"')
            .trim('\'')
            .trim()
        val email = if ('@' in candidate && ' ' !in candidate) {
            candidate
        } else {
            BARE_EMAIL.find(candidate)?.value ?: return null
        }
        return email.lowercase()
    }

    fun equalsNormalized(a: String?, b: String?): Boolean {
        val na = normalize(a) ?: return false
        val nb = normalize(b) ?: return false
        return na == nb
    }

    fun isSyntacticallyValid(raw: String?): Boolean {
        if (raw.isNullOrBlank()) return false
        val n = normalize(raw) ?: return false
        return n.contains('@') && n.substringAfter('@').contains('.')
    }

    fun extractAll(text: String?): List<String> {
        if (text.isNullOrBlank()) return emptyList()
        return BARE_EMAIL.findAll(text)
            .map { it.value.lowercase() }
            .distinct()
            .toList()
    }
}
