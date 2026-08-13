package com.rentacar.app.emailimport

enum class SenderMatchType {
    DIRECT_FROM,
    REPLY_TO,
    FORWARDED_FROM,
    /** Server BODY hit only — not yet verified as a real forwarded From header. */
    SERVER_BODY_CANDIDATE,
    NONE
}

data class SenderMatchResult(
    val matched: Boolean,
    val matchType: SenderMatchType,
    val configuredEmail: String,
    val matchedEmail: String?,
    val outerFrom: String?,
    val diagnosticNote: String? = null
)

/**
 * Resolves original sender from direct headers and common forwarded-message structures.
 */
object ForwardedSenderResolver {

    private val FORWARDED_FROM_PATTERNS = listOf(
        // Require line-start From/מאת/Sender inside recognizable forward/quote structure
        Regex("""(?im)^[-_]{2,}\s*Forwarded message\s*[-_]{2,}[\s\S]*?^From:\s*(.+)$"""),
        Regex("""(?im)^Begin forwarded message:[\s\S]*?^From:\s*(.+)$"""),
        Regex("""(?im)^[-]+\s*Original Message\s*[-]+[\s\S]*?^From:\s*(.+)$"""),
        Regex("""(?im)^From:\s*(.+)$"""),
        Regex("""(?im)^Sender:\s*(.+)$"""),
        Regex("""(?im)^מאת:\s*(.+)$""")
    )

    fun resolveMatch(
        configuredSenderEmail: String,
        fromHeader: String?,
        replyToHeader: String?,
        plainBody: String?,
        htmlBody: String?
    ): SenderMatchResult {
        val configured = EmailAddressNormalizer.normalize(configuredSenderEmail)
            ?: return SenderMatchResult(
                matched = false,
                matchType = SenderMatchType.NONE,
                configuredEmail = configuredSenderEmail,
                matchedEmail = null,
                outerFrom = fromHeader,
                diagnosticNote = "configured sender invalid"
            )

        val fromNorm = EmailAddressNormalizer.normalize(fromHeader)
        if (fromNorm != null && fromNorm == configured) {
            return SenderMatchResult(
                matched = true,
                matchType = SenderMatchType.DIRECT_FROM,
                configuredEmail = configured,
                matchedEmail = fromNorm,
                outerFrom = fromHeader
            )
        }

        val replyNorm = EmailAddressNormalizer.normalize(replyToHeader)
        if (replyNorm != null && replyNorm == configured) {
            return SenderMatchResult(
                matched = true,
                matchType = SenderMatchType.REPLY_TO,
                configuredEmail = configured,
                matchedEmail = replyNorm,
                outerFrom = fromHeader
            )
        }

        // Strict: only forwarded-header fields — never arbitrary body email occurrences.
        val forwardedCandidates = mutableListOf<String>()
        forwardedCandidates += extractForwardedFrom(plainBody)
        forwardedCandidates += extractForwardedFrom(htmlBody?.let { stripHtmlToText(it) })

        val hit = forwardedCandidates
            .mapNotNull { EmailAddressNormalizer.normalize(it) }
            .firstOrNull { it == configured }

        if (hit != null) {
            return SenderMatchResult(
                matched = true,
                matchType = SenderMatchType.FORWARDED_FROM,
                configuredEmail = configured,
                matchedEmail = hit,
                outerFrom = fromHeader,
                diagnosticNote = "outer_from=${EmailAddressNormalizer.normalize(fromHeader)}"
            )
        }

        return SenderMatchResult(
            matched = false,
            matchType = SenderMatchType.NONE,
            configuredEmail = configured,
            matchedEmail = null,
            outerFrom = fromHeader,
            diagnosticNote = "no match against configured sender"
        )
    }

    fun extractForwardedFrom(text: String?): List<String> {
        if (text.isNullOrBlank()) return emptyList()
        val results = mutableListOf<String>()
        for (pattern in FORWARDED_FROM_PATTERNS) {
            pattern.findAll(text).forEach { m ->
                val g = m.groupValues.getOrNull(1)?.trim()
                if (!g.isNullOrBlank()) results += g
            }
        }
        return results
    }

    private fun stripHtmlToText(html: String): String =
        html
            .replace(Regex("(?i)<br\\s*/?>"), "\n")
            .replace(Regex("(?i)</p>"), "\n")
            .replace(Regex("(?i)</div>"), "\n")
            .replace(Regex("<[^>]+>"), " ")
            .replace("&nbsp;", " ")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&amp;", "&")
            .replace(Regex("\\s+\n"), "\n")
}
