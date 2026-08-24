package com.rentacar.app.share

/**
 * Pure text wrapping / pagination used by PDF and image renderers.
 * Measure function is injected so unit tests do not need Android Canvas.
 */
object ShareTextLayout {
    data class PageSpec(
        val contentHeight: Float,
        val lineHeight: Float
    )

    fun wrapLine(text: String, maxWidth: Float, measure: (String) -> Float): List<String> {
        if (maxWidth <= 0f) return listOf(text)
        if (text.isEmpty()) return listOf("")
        return text.split('\n').flatMap { paragraph ->
            wrapParagraph(paragraph, maxWidth, measure)
        }
    }

    fun wrapLines(
        lines: List<StyledShareLine>,
        maxWidth: Float,
        measure: (text: String, bold: Boolean) -> Float
    ): List<StyledShareLine> {
        return lines.flatMap { line ->
            wrapLine(line.text, maxWidth) { measure(it, line.bold) }.map { wrapped ->
                line.copy(text = wrapped)
            }
        }
    }

    fun paginate(
        lines: List<StyledShareLine>,
        firstPage: PageSpec,
        additionalPage: PageSpec = firstPage
    ): List<List<StyledShareLine>> {
        if (lines.isEmpty()) return listOf(emptyList())
        val pages = mutableListOf<MutableList<StyledShareLine>>()
        var current = mutableListOf<StyledShareLine>()
        var used = 0f
        var spec = firstPage
        fun startNewPage() {
            if (current.isNotEmpty() || pages.isEmpty()) {
                pages.add(current)
            }
            current = mutableListOf()
            used = 0f
            spec = additionalPage
        }
        for (line in lines) {
            val extraLines = line.text.split('\n').size.coerceAtLeast(1)
            val needed = spec.lineHeight * extraLines
            if (current.isNotEmpty() && used + needed > spec.contentHeight) {
                startNewPage()
            }
            current.add(line)
            used += needed
        }
        if (current.isNotEmpty() || pages.isEmpty()) {
            pages.add(current)
        }
        return pages
    }

    private fun wrapParagraph(paragraph: String, maxWidth: Float, measure: (String) -> Float): List<String> {
        if (paragraph.isEmpty()) return listOf("")
        if (measure(paragraph) <= maxWidth) return listOf(paragraph)
        val words = paragraph.split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (words.isEmpty()) return listOf("")
        val lines = mutableListOf<String>()
        var current = ""
        for (word in words) {
            val candidate = if (current.isEmpty()) word else "$current $word"
            if (measure(candidate) <= maxWidth) {
                current = candidate
            } else {
                if (current.isNotEmpty()) {
                    lines.add(current)
                    current = ""
                }
                if (measure(word) <= maxWidth) {
                    current = word
                } else {
                    lines.addAll(splitOversized(word, maxWidth, measure))
                }
            }
        }
        if (current.isNotEmpty()) lines.add(current)
        return lines.ifEmpty { listOf("") }
    }

    private fun splitOversized(word: String, maxWidth: Float, measure: (String) -> Float): List<String> {
        val chunks = mutableListOf<String>()
        var remaining = word
        while (remaining.isNotEmpty()) {
            if (measure(remaining) <= maxWidth) {
                chunks.add(remaining)
                break
            }
            var lo = 1
            var hi = remaining.length
            var fit = 1
            while (lo <= hi) {
                val mid = (lo + hi) / 2
                if (measure(remaining.substring(0, mid)) <= maxWidth) {
                    fit = mid
                    lo = mid + 1
                } else {
                    hi = mid - 1
                }
            }
            chunks.add(remaining.substring(0, fit))
            remaining = remaining.substring(fit)
        }
        return chunks
    }
}
