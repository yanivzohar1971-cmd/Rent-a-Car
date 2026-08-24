package com.rentacar.app.share

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TemplateResolverInsertTokenTest {

    @Test
    fun wordWord_getsSpacesOnBothSides() {
        assertInsertion("שלוםעולם", 4, "CUSTOMER", "שלום {CUSTOMER} עולם")
        assertInsertion("HelloWorld", 5, "CUSTOMER", "Hello {CUSTOMER} World")
    }

    @Test
    fun existingSpaceBeforeOnly_noDuplicateBefore() {
        assertInsertion("שלום עולם", 5, "CUSTOMER", "שלום {CUSTOMER} עולם")
    }

    @Test
    fun existingSpaceAfterOnly_noDuplicateAfter() {
        assertInsertion("שלום עולם", 4, "CUSTOMER", "שלום {CUSTOMER} עולם")
    }

    @Test
    fun spacesOnBothSides_unchangedSingleSpacing() {
        val result = TemplateResolver.insertToken("שלום  עולם", "CUSTOMER", 5, 5)
        assertEquals("שלום {CUSTOMER} עולם", result.text)
    }

    @Test
    fun startOfText_trailingSpaceBeforeWord() {
        val result = TemplateResolver.insertToken("שלום", "CUSTOMER", 0, 0)
        assertEquals("{CUSTOMER} שלום", result.text)
        assertEquals("{CUSTOMER} ".length, result.cursor)
    }

    @Test
    fun endOfText_leadingSpaceAfterWord() {
        val result = TemplateResolver.insertToken("שלום", "CUSTOMER", 4, 4)
        assertEquals("שלום {CUSTOMER}", result.text)
        assertEquals("שלום {CUSTOMER}".length, result.cursor)
    }

    @Test
    fun beforePeriod_noTrailingSpace() {
        val result = TemplateResolver.insertToken("מחיר:.", "PRICE", 5, 5)
        assertEquals("מחיר: {PRICE}.", result.text)
        assertEquals("מחיר: {PRICE}".length, result.cursor)
    }

    @Test
    fun beforeComma_noTrailingSpace() {
        val result = TemplateResolver.insertToken("לקוח:, נא להגיע", "CUSTOMER", 5, 5)
        assertEquals("לקוח: {CUSTOMER}, נא להגיע", result.text)
        assertEquals("לקוח: {CUSTOMER}".length, result.cursor)
    }

    @Test
    fun afterColon_spaceBeforeToken() {
        val result = TemplateResolver.insertToken("מחיר:", "PRICE", 5, 5)
        assertEquals("מחיר: {PRICE}", result.text)
        assertEquals("מחיר: {PRICE}".length, result.cursor)
    }

    @Test
    fun insideParentheses_noExtraSpaces() {
        val result = TemplateResolver.insertToken("()", "CUSTOMER", 1, 1)
        assertEquals("({CUSTOMER})", result.text)
        assertEquals("({CUSTOMER}".length, result.cursor)
    }

    @Test
    fun multilineBoundary_doesNotAddSpaceAcrossNewline() {
        val result = TemplateResolver.insertToken("foo\nbar", "CUSTOMER", 3, 3)
        assertEquals("foo {CUSTOMER}\nbar", result.text)
        assertEquals("foo {CUSTOMER}".length, result.cursor)
        val afterBreak = TemplateResolver.insertToken("foo\nbar", "CUSTOMER", 4, 4)
        assertEquals("foo\n{CUSTOMER} bar", afterBreak.text)
    }

    @Test
    fun selectedTextReplacement_usesCharsOutsideRange() {
        val result = TemplateResolver.insertToken("Hello selected words world", "CUSTOMER", 6, 20)
        assertEquals("Hello {CUSTOMER} world", result.text)
        assertEquals("Hello {CUSTOMER}".length, result.cursor)
    }

    @Test
    fun cursorAfterInsertedToken_whenNoTrailingSpace() {
        val result = TemplateResolver.insertToken("Price:.", "PRICE", 6, 6)
        assertEquals("Price: {PRICE}.", result.text)
        assertEquals("Price: {PRICE}".length, result.cursor)
    }

    @Test
    fun cursorAfterAutomaticallyInsertedTrailingSpace() {
        val result = TemplateResolver.insertToken("Helloworld", "CUSTOMER", 5, 5)
        assertEquals("Hello {CUSTOMER} world", result.text)
        assertEquals("Hello {CUSTOMER} ".length, result.cursor)
        assertTrue(result.text[result.cursor] == 'w')
    }

    @Test
    fun noTrailingSpaceBeforePunctuation() {
        val result = TemplateResolver.insertToken("מחיר:.", "PRICE", 5, 5)
        assertEquals("מחיר: {PRICE}.", result.text)
        assertEquals('.', result.text[result.cursor])
    }

    @Test
    fun hebrewText_creditHoldCanary() {
        val source = "יש להגיע עם מסגרתשל לפחות"
        val offset = "יש להגיע עם מסגרת".length
        val result = TemplateResolver.insertToken(source, "HOLD_AMOUNT", offset, offset)
        assertEquals("יש להגיע עם מסגרת {HOLD_AMOUNT} של לפחות", result.text)
        assertEquals("יש להגיע עם מסגרת {HOLD_AMOUNT} ".length, result.cursor)
    }

    @Test
    fun englishText_wordBoundaries() {
        val result = TemplateResolver.insertToken("priceis", "PRICE", 5, 5)
        assertEquals("price {PRICE} is", result.text)
    }

    @Test
    fun numbersAdjacentToToken_getSeparatingSpaces() {
        val result = TemplateResolver.insertToken("12345", "HOLD_AMOUNT", 2, 2)
        assertEquals("12 {HOLD_AMOUNT} 345", result.text)
        assertEquals("12 {HOLD_AMOUNT} ".length, result.cursor)
    }

    @Test
    fun emptyTextField_insertsBareToken() {
        val result = TemplateResolver.insertToken("", "CUSTOMER", 0, 0)
        assertEquals("{CUSTOMER}", result.text)
        assertEquals("{CUSTOMER}".length, result.cursor)
    }

    @Test
    fun repeatedTokenInsertion_addsSingleSeparatingSpace() {
        val first = TemplateResolver.insertToken("", "CUSTOMER", 0, 0)
        val second = TemplateResolver.insertToken(first.text, "CUSTOMER", first.cursor, first.cursor)
        assertEquals("{CUSTOMER} {CUSTOMER}", second.text)
        assertEquals("{CUSTOMER} {CUSTOMER}".length, second.cursor)
        val betweenWord = TemplateResolver.insertToken("Hello {CUSTOMER}world", "SUPPLIER", 16, 16)
        assertEquals("Hello {CUSTOMER} {SUPPLIER} world", betweenWord.text)
    }

    @Test
    fun wrappedTokenAndBareToken_produceSameOutput() {
        val a = TemplateResolver.insertToken("ab", "BRANCH", 1, 1)
        val b = TemplateResolver.insertToken("ab", "{BRANCH}", 1, 1)
        assertEquals(a.text, b.text)
        assertEquals(a.cursor, b.cursor)
    }

    @Test
    fun collapsedCursor_atBeginning() {
        val result = insertAt("after", 0, 0, "HOLD_AMOUNT")
        assertEquals("{HOLD_AMOUNT} after", result.text)
        assertEquals("{HOLD_AMOUNT} ".length, result.cursor)
    }

    @Test
    fun collapsedCursor_inMiddle() {
        val result = insertAt("Hello world", 6, 6, "HOLD_AMOUNT")
        assertEquals("Hello {HOLD_AMOUNT} world", result.text)
        assertEquals("Hello {HOLD_AMOUNT} ".length, result.cursor)
    }

    @Test
    fun collapsedCursor_atEnd() {
        val result = insertAt("Please arrive ", 14, 14, "CUSTOMER")
        assertEquals("Please arrive {CUSTOMER}", result.text)
        assertEquals("Please arrive {CUSTOMER}".length, result.cursor)
    }

    @Test
    fun selectedTextReplacement_usesCurrentTextFieldSelection() {
        val text = "Please bring OLD VALUE tomorrow"
        val start = text.indexOf("OLD VALUE")
        val end = start + "OLD VALUE".length
        val result = insertAt(text, start, end, "HOLD_AMOUNT")
        assertEquals("Please bring {HOLD_AMOUNT} tomorrow", result.text)
        assertEquals("Please bring {HOLD_AMOUNT}".length, result.cursor)
    }

    @Test
    fun reversedSelection_stillReplacesTheSameRange() {
        val result = insertAt("aaXXXbb", 5, 2, "PRICE")
        assertEquals("aa {PRICE} bb", result.text)
    }

    @Test
    fun hebrewCursorBetweenWords_holdAmountCanary() {
        val before = "יש להגיע עם מסגרת "
        val after = "של לפחות"
        val result = insertAt(before + after, before.length, before.length, "HOLD_AMOUNT")
        assertEquals("יש להגיע עם מסגרת {HOLD_AMOUNT} של לפחות", result.text)
        assertEquals("יש להגיע עם מסגרת {HOLD_AMOUNT} ".length, result.cursor)
    }

    private fun insertAt(
        text: String,
        selectionStart: Int,
        selectionEnd: Int,
        token: String
    ) = TemplateResolver.insertToken(
        text,
        token,
        minOf(selectionStart, selectionEnd),
        maxOf(selectionStart, selectionEnd)
    )

    private fun assertInsertion(text: String, offset: Int, token: String, expected: String) {
        val result = TemplateResolver.insertToken(text, token, offset, offset)
        assertEquals(expected, result.text)
    }
}
