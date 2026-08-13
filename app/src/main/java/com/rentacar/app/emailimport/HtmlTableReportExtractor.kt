package com.rentacar.app.emailimport

import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import org.jsoup.select.Elements

data class HtmlTableCell(
    val rawText: String,
    val normalizedText: String
)

data class HtmlTableRow(
    val cells: List<HtmlTableCell>
)

data class ExtractedHtmlTable(
    val index: Int,
    val headers: List<String>,
    val rows: List<HtmlTableRow>,
    val rawHeaderCells: List<String>,
    val htmlPartIndex: Int = 0,
    val headerRowIndex: Int = 0,
    val columnCount: Int = headers.size,
    val matchedRequiredHeaders: List<String> = emptyList(),
    val missingRequiredHeaders: List<String> = emptyList(),
    val score: Int = 0
)

data class HtmlTableExtractionResult(
    val tables: List<ExtractedHtmlTable>,
    val selectedTable: ExtractedHtmlTable?,
    val errors: List<String> = emptyList(),
    val selectedHtmlPartIndex: Int? = null,
    val selectedHeaderRowIndex: Int? = null
)

/**
 * Extracts HTML tables from one or more email HTML parts using Jsoup.
 * - Does not assume first row is the header
 * - Does not mix nested-table rows into a parent table
 * - Scores candidates by required Shagrir headers
 */
class HtmlTableReportExtractor(
    private val maxHeaderProbeRows: Int = 8
) {

    fun extract(
        html: String?,
        requiredHeaders: List<String>,
        headerAliases: Map<String, List<String>> = emptyMap()
    ): HtmlTableExtractionResult =
        extractFromHtmlParts(
            htmlParts = listOfNotNull(html?.takeIf { it.isNotBlank() }),
            requiredHeaders = requiredHeaders,
            headerAliases = headerAliases
        )

    fun extractFromHtmlParts(
        htmlParts: List<String>,
        requiredHeaders: List<String>,
        headerAliases: Map<String, List<String>> = emptyMap()
    ): HtmlTableExtractionResult {
        if (htmlParts.isEmpty()) {
            return HtmlTableExtractionResult(
                tables = emptyList(),
                selectedTable = null,
                errors = listOf("לא נמצאה טבלת HTML בגוף המייל")
            )
        }

        val allCandidates = mutableListOf<ExtractedHtmlTable>()
        htmlParts.forEachIndexed { partIndex, html ->
            val doc = Jsoup.parse(html)
            val tableElements = doc.select("table")
            tableElements.forEachIndexed { tableIndex, table ->
                allCandidates += analyzeTable(
                    htmlPartIndex = partIndex,
                    tableIndex = tableIndex,
                    table = table,
                    requiredHeaders = requiredHeaders,
                    headerAliases = headerAliases
                )
            }
        }

        if (allCandidates.isEmpty()) {
            return HtmlTableExtractionResult(
                tables = emptyList(),
                selectedTable = null,
                errors = listOf("לא נמצאה טבלת HTML בגוף המייל")
            )
        }

        val selected = allCandidates
            .filter { it.missingRequiredHeaders.isEmpty() && it.matchedRequiredHeaders.size == requiredHeaders.size }
            .maxByOrNull { it.score }
            ?: allCandidates.maxByOrNull { it.score }

        return if (selected == null || selected.missingRequiredHeaders.isNotEmpty()) {
            val best = selected ?: allCandidates.maxByOrNull { it.matchedRequiredHeaders.size }
            val missing = best?.missingRequiredHeaders.orEmpty()
            val missingMsg = if (missing.isNotEmpty()) {
                "נמצאה טבלה אך חסרות העמודות: ${missing.joinToString(", ")}"
            } else {
                "לא זוהתה טבלת דוח עמלות עם העמודות הנדרשות"
            }
            HtmlTableExtractionResult(
                tables = allCandidates,
                selectedTable = null,
                errors = listOf(missingMsg),
                selectedHtmlPartIndex = best?.htmlPartIndex,
                selectedHeaderRowIndex = best?.headerRowIndex
            )
        } else {
            HtmlTableExtractionResult(
                tables = allCandidates,
                selectedTable = selected,
                selectedHtmlPartIndex = selected.htmlPartIndex,
                selectedHeaderRowIndex = selected.headerRowIndex
            )
        }
    }

    private fun analyzeTable(
        htmlPartIndex: Int,
        tableIndex: Int,
        table: Element,
        requiredHeaders: List<String>,
        headerAliases: Map<String, List<String>>
    ): ExtractedHtmlTable {
        val rawRows = directRows(table).mapNotNull { tr ->
            val cells = tr.select("> th, > td").map { cellText(it) }
            if (cells.any { it.isNotBlank() }) cells else null
        }
        if (rawRows.isEmpty()) {
            return ExtractedHtmlTable(
                index = tableIndex,
                headers = emptyList(),
                rows = emptyList(),
                rawHeaderCells = emptyList(),
                htmlPartIndex = htmlPartIndex
            )
        }

        var best: ExtractedHtmlTable? = null
        val probeLimit = minOf(maxHeaderProbeRows, rawRows.size)
        for (headerIdx in 0 until probeLimit) {
            val header = rawRows[headerIdx]
            val matched = mutableListOf<String>()
            val missing = mutableListOf<String>()
            for (required in requiredHeaders) {
                val key = HebrewHeaderNormalizer.findKey(
                    headers = header,
                    expected = required,
                    aliases = headerAliases[required].orEmpty()
                )
                if (key == null) missing += required else matched += required
            }
            val dataRows = rawRows.drop(headerIdx + 1)
            val score = scoreCandidate(
                matchedCount = matched.size,
                missingCount = missing.size,
                columnCount = header.size,
                requiredCount = requiredHeaders.size,
                followingDataRows = dataRows.size,
                header = header
            )
            val candidate = ExtractedHtmlTable(
                index = tableIndex,
                headers = header.map { it.trim() },
                rows = dataRows.map { cells ->
                    HtmlTableRow(
                        cells = cells.map { raw ->
                            HtmlTableCell(rawText = raw, normalizedText = normalizeCell(raw))
                        }
                    )
                },
                rawHeaderCells = header,
                htmlPartIndex = htmlPartIndex,
                headerRowIndex = headerIdx,
                columnCount = header.size,
                matchedRequiredHeaders = matched,
                missingRequiredHeaders = missing,
                score = score
            )
            if (best == null || candidate.score > best.score) {
                best = candidate
            }
            // Perfect match — stop probing deeper title rows
            if (missing.isEmpty() && matched.size == requiredHeaders.size) break
        }
        return best ?: ExtractedHtmlTable(
            index = tableIndex,
            headers = emptyList(),
            rows = emptyList(),
            rawHeaderCells = emptyList(),
            htmlPartIndex = htmlPartIndex
        )
    }

    private fun scoreCandidate(
        matchedCount: Int,
        missingCount: Int,
        columnCount: Int,
        requiredCount: Int,
        followingDataRows: Int,
        header: List<String>
    ): Int {
        var score = matchedCount * 12
        score -= missingCount * 8
        if (columnCount in (requiredCount - 1)..(requiredCount + 2)) score += 4
        if (followingDataRows >= 2) score += 3
        if (followingDataRows >= 10) score += 2
        val nonBlank = header.count { it.isNotBlank() }
        if (nonBlank <= 1) score -= 12
        if (nonBlank < columnCount / 2) score -= 4
        return score
    }

    /** Only direct table rows — do not inherit nested table rows. */
    private fun directRows(table: Element): Elements {
        val rows = Elements()
        for (child in table.children()) {
            when (child.tagName().lowercase()) {
                "tr" -> rows.add(child)
                "thead", "tbody", "tfoot" -> {
                    for (grand in child.children()) {
                        if (grand.tagName().equals("tr", ignoreCase = true)) rows.add(grand)
                    }
                }
            }
        }
        return rows
    }

    private fun cellText(el: Element): String =
        el.text()
            .replace('\u00A0', ' ')
            .trim()

    private fun normalizeCell(raw: String): String =
        raw.replace('\u00A0', ' ').trim().replace(Regex("\\s+"), " ")
}
