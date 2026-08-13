package com.rentacar.app.emailimport

import org.jsoup.Jsoup

/**
 * Lightweight, sanitized presence probe for Shagrir commission markers in HTML.
 * Never returns customer row values — only booleans, counts, and short header snippets.
 */
data class HtmlCommissionPresenceResult(
    val htmlLength: Int,
    val tableCount: Int,
    val imageTagCount: Int,
    val cidReferenceCount: Int,
    val maxTableColumns: Int,
    val maxTableRows: Int,
    val keywordHits: Map<String, Boolean>,
    val anyRequiredHeaderTextPresent: Boolean,
    val sampleNonEmptyCellSnippets: List<String>
)

object HtmlCommissionPresenceProbe {

    private val KEYWORDS = listOf(
        "מספרהזמנה" to "order",
        "הזמנה" to "orderLoose",
        "עמלה" to "commission",
        "עמלות" to "commissions",
        "חשבונית" to "invoice",
        "שםמנוי" to "subscriber",
        "מנוי" to "subscriberLoose",
        "הכנסהמהשכרה" to "revenue",
        "שםסוכן" to "agent",
        "אחוז" to "percent"
    )

    fun probe(htmlParts: List<String>): HtmlCommissionPresenceResult {
        var tableCount = 0
        var imageTagCount = 0
        var cidCount = 0
        var maxCols = 0
        var maxRows = 0
        val snippets = mutableListOf<String>()
        val combinedNorm = StringBuilder()

        htmlParts.forEach { html ->
            val doc = Jsoup.parse(html)
            val visibleText = doc.body()?.text().orEmpty()
            combinedNorm.append(HebrewHeaderNormalizer.normalize(visibleText))
            imageTagCount += doc.select("img").size
            cidCount += Regex("""cid:([^"'>\s]+)""", RegexOption.IGNORE_CASE)
                .findAll(html).count()
            val tables = doc.select("table")
            tableCount += tables.size
            tables.forEach { table ->
                val rows = table.select("> tr, > thead > tr, > tbody > tr, > tfoot > tr")
                maxRows = maxOf(maxRows, rows.size)
                rows.take(16).forEach { tr ->
                    val cells = tr.select("> th, > td").map { it.text().replace('\u00A0', ' ').trim() }
                    maxCols = maxOf(maxCols, cells.size)
                    cells.filter { it.isNotBlank() }.take(2).forEach { cell ->
                        if (snippets.size < 24) {
                            snippets += cell.take(40)
                        }
                    }
                }
            }
        }

        val normAll = combinedNorm.toString()
        val hits = KEYWORDS.associate { (needle, key) ->
            key to normAll.contains(needle)
        }
        val requiredPresent = listOf("order", "commission", "invoice", "subscriber", "revenue", "agent", "percent")
            .count { hits[it] == true } >= 4

        return HtmlCommissionPresenceResult(
            htmlLength = htmlParts.sumOf { it.length },
            tableCount = tableCount,
            imageTagCount = imageTagCount,
            cidReferenceCount = cidCount,
            maxTableColumns = maxCols,
            maxTableRows = maxRows,
            keywordHits = hits,
            anyRequiredHeaderTextPresent = requiredPresent,
            sampleNonEmptyCellSnippets = snippets.distinct().take(16)
        )
    }
}
