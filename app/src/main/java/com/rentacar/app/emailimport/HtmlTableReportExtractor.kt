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
    val rawHeaderCells: List<String>
)

data class HtmlTableExtractionResult(
    val tables: List<ExtractedHtmlTable>,
    val selectedTable: ExtractedHtmlTable?,
    val errors: List<String> = emptyList()
)

/**
 * Extracts HTML tables from email body using Jsoup (not regex).
 */
class HtmlTableReportExtractor {

    fun extract(html: String?, requiredHeaders: List<String>, headerAliases: Map<String, List<String>> = emptyMap()): HtmlTableExtractionResult {
        if (html.isNullOrBlank()) {
            return HtmlTableExtractionResult(
                tables = emptyList(),
                selectedTable = null,
                errors = listOf("לא נמצאה טבלת HTML בגוף המייל")
            )
        }
        val doc = Jsoup.parse(html)
        val tableElements = doc.select("table")
        if (tableElements.isEmpty()) {
            return HtmlTableExtractionResult(
                tables = emptyList(),
                selectedTable = null,
                errors = listOf("לא נמצאה טבלת HTML בגוף המייל")
            )
        }

        val tables = tableElements.mapIndexed { index, table -> parseTable(index, table) }
        val selected = tables.firstOrNull { table ->
            requiredHeaders.all { required ->
                HebrewHeaderNormalizer.findKey(
                    headers = table.headers,
                    expected = required,
                    aliases = headerAliases[required].orEmpty()
                ) != null
            }
        }

        return if (selected == null) {
            HtmlTableExtractionResult(
                tables = tables,
                selectedTable = null,
                errors = listOf("לא זוהתה טבלת דוח עמלות עם העמודות הנדרשות")
            )
        } else {
            HtmlTableExtractionResult(tables = tables, selectedTable = selected)
        }
    }

    private fun parseTable(index: Int, table: Element): ExtractedHtmlTable {
        val rows = mutableListOf<List<String>>()
        val trs: Elements = table.select("tr")
        for (tr in trs) {
            val cells = tr.select("th, td").map { cellText(it) }
            if (cells.any { it.isNotBlank() }) {
                rows += cells
            }
        }
        if (rows.isEmpty()) {
            return ExtractedHtmlTable(index, emptyList(), emptyList(), emptyList())
        }
        val header = rows.first()
        val dataRows = rows.drop(1).map { cellValues ->
            HtmlTableRow(
                cells = cellValues.map { raw ->
                    HtmlTableCell(rawText = raw, normalizedText = normalizeCell(raw))
                }
            )
        }
        return ExtractedHtmlTable(
            index = index,
            headers = header.map { it.trim() },
            rows = dataRows,
            rawHeaderCells = header
        )
    }

    private fun cellText(el: Element): String {
        // Preserve visible text; Jsoup decodes entities (&nbsp; etc.)
        return el.text()
            .replace('\u00A0', ' ')
            .trim()
    }

    private fun normalizeCell(raw: String): String =
        raw.replace('\u00A0', ' ').trim().replace(Regex("\\s+"), " ")
}
