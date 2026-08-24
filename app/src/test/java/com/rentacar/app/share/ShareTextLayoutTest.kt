package com.rentacar.app.share

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ShareTextLayoutTest {

    @Test
    fun wrapsLongLineByWidth() {
        val wrapped = ShareTextLayout.wrapLine("one two three four", maxWidth = 10f) { text -> text.length.toFloat() }
        assertTrue(wrapped.size >= 2)
        wrapped.forEach { line -> assertTrue(line.length <= 10) }
    }

    @Test
    fun preservesExplicitNewlines() {
        val wrapped = ShareTextLayout.wrapLine("hello\nworld", maxWidth = 100f) { it.length.toFloat() }
        assertEquals(listOf("hello", "world"), wrapped)
    }

    @Test
    fun emptyLine_isPreserved() {
        val wrapped = ShareTextLayout.wrapLine("", maxWidth = 100f) { it.length.toFloat() }
        assertEquals(listOf(""), wrapped)
    }

    @Test
    fun paginate_createsAdditionalPages() {
        val lines = (1..10).map { StyledShareLine("line $it") }
        val pages = ShareTextLayout.paginate(
            lines,
            ShareTextLayout.PageSpec(contentHeight = 30f, lineHeight = 10f)
        )
        assertEquals(4, pages.size)
        assertEquals(3, pages[0].size)
        assertEquals(1, pages.last().size)
    }

    @Test
    fun wrapKeepsBoldAndColor() {
        val wrapped = ShareTextLayout.wrapLines(
            listOf(StyledShareLine("alpha beta gamma", bold = true, colorArgb = 123)),
            maxWidth = 8f
        ) { text, _ -> text.length.toFloat() }
        assertTrue(wrapped.size > 1)
        wrapped.forEach {
            assertTrue(it.bold)
            assertEquals(123, it.colorArgb)
        }
    }
}
