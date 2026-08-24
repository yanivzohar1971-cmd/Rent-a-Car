package com.rentacar.app.share

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CustomerReservationShareTest {

    private val defaultHe = EffectiveCustomerTerms.defaults(ShareLanguage.HE)
    private val defaultEn = EffectiveCustomerTerms.defaults(ShareLanguage.EN)

    @Test
    fun defaultHebrewTerms_usedWhenNotCustomized() {
        val resolved = EffectiveCustomerTermsResolver.resolve(ShareLanguage.HE, customized = false, customRows = emptyList())
        assertFalse(resolved.customized)
        assertEquals(CustomerTermsDefaults.HEBREW_TEMPLATES, resolved.terms.map { it.textTemplate })
    }

    @Test
    fun defaultEnglishTerms_usedWhenNotCustomized() {
        val resolved = EffectiveCustomerTermsResolver.resolve(ShareLanguage.EN, customized = false, customRows = emptyList())
        assertFalse(resolved.customized)
        assertEquals(CustomerTermsDefaults.ENGLISH_TEMPLATES, resolved.terms.map { it.textTemplate })
    }

    @Test
    fun holdAmount_resolvesFromReservation() {
        val text = compose(hold = 4500, terms = defaultHe).toPlainText()
        assertTrue(text.contains("4,500"))
        assertFalse(text.contains("{HOLD_AMOUNT}"))
    }

    @Test
    fun differentReservations_produceDifferentHoldValues() {
        val a = compose(hold = 2000, terms = defaultHe).toPlainText()
        val b = compose(hold = 6000, terms = defaultHe).toPlainText()
        assertTrue(a.contains("2,000"))
        assertTrue(b.contains("6,000"))
        assertFalse(a.contains("6,000"))
        assertFalse(b.contains("2,000"))
    }

    @Test
    fun customerTerms_doNotHardcode2000() {
        CustomerTermsDefaults.HEBREW_TEMPLATES.forEach { assertFalse(it.contains("2,000")) }
        CustomerTermsDefaults.ENGLISH_TEMPLATES.forEach {
            assertFalse(it.contains("2,000"))
            assertFalse(it.contains("2000"))
        }
        val rendered = compose(hold = 4500, terms = defaultHe).toPlainText()
        assertFalse(rendered.contains("2,000"))
        assertFalse(rendered.contains("2000"))
    }

    @Test
    fun customTerms_overrideDefaults() {
        val custom = EffectiveCustomerTerms(
            language = ShareLanguage.HE,
            customized = true,
            terms = listOf(CustomerTermTemplate("תנאי מותאם {HOLD_AMOUNT}", enabled = true, sortOrder = 0))
        )
        val text = compose(hold = 3000, terms = custom).toPlainText()
        assertTrue(text.contains("1. תנאי מותאם 3,000"))
        assertFalse(text.contains("רישיון נהיגה"))
    }

    @Test
    fun customHebrew_doesNotAffectEnglishDefaults() {
        val he = EffectiveCustomerTermsResolver.resolve(
            ShareLanguage.HE,
            customized = true,
            customRows = listOf(CustomerTermTemplate("רק עברית", enabled = true))
        )
        val en = EffectiveCustomerTermsResolver.resolve(ShareLanguage.EN, customized = false, customRows = emptyList())
        assertEquals("רק עברית", he.terms.single().textTemplate)
        assertEquals(CustomerTermsDefaults.ENGLISH_TEMPLATES, en.terms.map { it.textTemplate })
    }

    @Test
    fun customEnglish_doesNotAffectHebrewDefaults() {
        val en = EffectiveCustomerTermsResolver.resolve(
            ShareLanguage.EN,
            customized = true,
            customRows = listOf(CustomerTermTemplate("English only", enabled = true))
        )
        val he = EffectiveCustomerTermsResolver.resolve(ShareLanguage.HE, customized = false, customRows = emptyList())
        assertEquals("English only", en.terms.single().textTemplate)
        assertEquals(CustomerTermsDefaults.HEBREW_TEMPLATES, he.terms.map { it.textTemplate })
    }

    @Test
    fun disabledTerms_areOmittedWithoutNumberingGaps() {
        val terms = EffectiveCustomerTerms(
            language = ShareLanguage.HE,
            customized = true,
            terms = listOf(
                CustomerTermTemplate("ראשון", enabled = true, sortOrder = 0),
                CustomerTermTemplate("מושבת", enabled = false, sortOrder = 1),
                CustomerTermTemplate("שלישי", enabled = true, sortOrder = 2)
            )
        )
        val rendered = CustomerReservationComposer.renderTerms(terms, TemplateResolutionContext())
        assertEquals(listOf("1. ראשון", "2. שלישי"), rendered.map { it.text })
    }

    @Test
    fun reordering_changesOutputOrder() {
        val before = EffectiveCustomerTerms(
            language = ShareLanguage.EN,
            customized = true,
            terms = listOf(
                CustomerTermTemplate("A", enabled = true, sortOrder = 0),
                CustomerTermTemplate("B", enabled = true, sortOrder = 1)
            )
        )
        val after = EffectiveCustomerTerms(
            language = ShareLanguage.EN,
            customized = true,
            terms = listOf(
                CustomerTermTemplate("B", enabled = true, sortOrder = 0),
                CustomerTermTemplate("A", enabled = true, sortOrder = 1)
            )
        )
        assertEquals(listOf("1. A", "2. B"), CustomerReservationComposer.renderTerms(before, TemplateResolutionContext()).map { it.text })
        assertEquals(listOf("1. B", "2. A"), CustomerReservationComposer.renderTerms(after, TemplateResolutionContext()).map { it.text })
    }

    @Test
    fun addedTerms_areRendered() {
        val terms = EffectiveCustomerTerms(
            language = ShareLanguage.EN,
            customized = true,
            terms = CustomerTermsDefaults.terms(ShareLanguage.EN) +
                CustomerTermTemplate("Bring a helmet.", enabled = true, sortOrder = 5)
        )
        val text = compose(hold = 2000, language = ShareLanguage.EN, terms = terms).toPlainText()
        assertTrue(text.contains("6. Bring a helmet."))
    }

    @Test
    fun deletedTerms_disappear() {
        val terms = EffectiveCustomerTerms(
            language = ShareLanguage.EN,
            customized = true,
            terms = listOf(CustomerTermTemplate("Only remaining", enabled = true, sortOrder = 0))
        )
        val text = compose(hold = 1000, language = ShareLanguage.EN, terms = terms).toPlainText()
        assertTrue(text.contains("1. Only remaining"))
        assertFalse(text.contains("Valid original"))
    }

    @Test
    fun boldAndColor_surviveIntoStyledLines() {
        val terms = EffectiveCustomerTerms(
            language = ShareLanguage.EN,
            customized = true,
            terms = listOf(
                CustomerTermTemplate("Bold one", enabled = true, bold = true, textColorArgb = 0xFFD32F2F.toInt(), sortOrder = 0)
            )
        )
        val line = CustomerReservationComposer.renderTerms(terms, TemplateResolutionContext()).single()
        assertTrue(line.bold)
        assertEquals(0xFFD32F2F.toInt(), line.colorArgb)
        assertEquals("1. Bold one", line.text)
    }

    @Test
    fun plainText_stripsStylingMetadata() {
        val terms = EffectiveCustomerTerms(
            language = ShareLanguage.EN,
            customized = true,
            terms = listOf(
                CustomerTermTemplate("Clean", enabled = true, bold = true, textColorArgb = 0xFF1565C0.toInt())
            )
        )
        val text = compose(hold = 1, language = ShareLanguage.EN, terms = terms).toPlainText()
        assertTrue(text.contains("1. Clean"))
        assertFalse(text.contains("<b>"))
        assertFalse(text.contains("#1565C0"))
        assertFalse(text.contains("bold=true"))
    }

    @Test
    fun unknownToken_doesNotCrash() {
        val terms = EffectiveCustomerTerms(
            language = ShareLanguage.EN,
            customized = true,
            terms = listOf(CustomerTermTemplate("See {UNKNOWN_TOKEN} please", enabled = true))
        )
        val text = compose(hold = 100, language = ShareLanguage.EN, terms = terms).toPlainText()
        assertTrue(text.contains("{UNKNOWN_TOKEN}"))
    }

    @Test
    fun resetSemantics_useDefaultsWhenNotCustomized() {
        val afterReset = EffectiveCustomerTermsResolver.resolve(ShareLanguage.HE, customized = false, customRows = emptyList())
        assertEquals(5, afterReset.terms.size)
        assertTrue(afterReset.terms[2].textTemplate.contains("{HOLD_AMOUNT}"))
    }

    @Test
    fun customizedAllDisabled_doesNotFallBackToDefaults() {
        val resolved = EffectiveCustomerTermsResolver.resolve(
            language = ShareLanguage.HE,
            customized = true,
            customRows = listOf(
                CustomerTermTemplate("מוסתר", enabled = false, sortOrder = 0)
            )
        )
        val rendered = CustomerReservationComposer.renderTerms(resolved, TemplateResolutionContext())
        assertTrue(resolved.customized)
        assertTrue(rendered.isEmpty())
        assertFalse(resolved.terms.any { it.textTemplate.contains("רישיון נהיגה") })
    }

    @Test
    fun reservationDetailsText_containsCustomerTerms() {
        val doc = compose(hold = 2500, terms = defaultHe)
        val text = doc.toPlainText()
        assertTrue(text.contains(CustomerTermsDefaults.HEADING_HE))
        assertTrue(text.contains("1. רישיון נהיגה"))
        assertTrue(text.contains("2,500"))
    }

    @Test
    fun reservationDetailsPdfAndImage_useSameResolvedTermsAsText() {
        val doc = compose(hold = 2500, terms = defaultHe)
        val textTerms = doc.terms.map { it.text }
        assertEquals(textTerms, doc.toStyledLines().filter { it.text.matches(Regex("^\\d+\\..*")) }.map { it.text })
        assertTrue(textTerms[2].contains("2,500"))
        assertFalse(textTerms.any { it.contains("2,000") && !it.contains("2,500") })
    }

    @Test
    fun createEditAndDetails_produceIdenticalCustomerTerms() {
        val factsA = facts(hold = 4000, reservationId = null)
        val factsB = facts(hold = 4000, reservationId = 99L)
        val termsA = CustomerReservationComposer.compose(factsA, defaultHe).terms.map { it.text }
        val termsB = CustomerReservationComposer.compose(factsB, defaultHe).terms.map { it.text }
        assertEquals(termsA, termsB)
    }

    @Test
    fun supplierNameBranchCustomerPriceCarType_resolve() {
        val terms = EffectiveCustomerTerms(
            language = ShareLanguage.HE,
            customized = true,
            terms = listOf(
                CustomerTermTemplate(
                    "ספק {SUPPLIER}, סניף {BRANCH}, לקוח {CUSTOMER}, מחיר {PRICE}, רכב {CAR_TYPE}, מסגרת {HOLD_AMOUNT}",
                    enabled = true
                )
            )
        )
        val text = CustomerReservationComposer.compose(
            facts(hold = 4500).copy(
                supplierName = "אלדן",
                branchName = "תל אביב",
                customerFirstName = "דן",
                customerLastName = "כהן",
                agreedPrice = 1200.0,
                carType = "מאזדה 3"
            ),
            terms
        ).toPlainText()
        assertTrue(text.contains("אלדן"))
        assertTrue(text.contains("תל אביב"))
        assertTrue(text.contains("דן כהן"))
        assertTrue(text.contains("1,200 ₪"))
        assertTrue(text.contains("מאזדה 3"))
        assertTrue(text.contains("4,500"))
    }

    @Test
    fun sameVariable_canAppearMoreThanOnce() {
        val terms = EffectiveCustomerTerms(
            language = ShareLanguage.EN,
            customized = true,
            terms = listOf(CustomerTermTemplate("{SUPPLIER} and again {SUPPLIER}", enabled = true))
        )
        val rendered = CustomerReservationComposer.renderTerms(terms, facts(1, ShareLanguage.EN).toResolutionContext())
        assertEquals("1. Hertz and again Hertz", rendered.single().text)
    }

    @Test
    fun missingSourceData_resolvesEmptyWithoutCrash() {
        val terms = EffectiveCustomerTerms(
            language = ShareLanguage.EN,
            customized = true,
            terms = listOf(CustomerTermTemplate("X{SUPPLIER}Y{BRANCH}Z", enabled = true))
        )
        val text = CustomerReservationComposer.compose(
            ReservationShareFacts(language = ShareLanguage.EN, requiredHoldAmount = 1),
            terms
        ).toPlainText()
        assertTrue(text.contains("1. XYZ"))
    }

    @Test
    fun tokenInsertion_holdAmountAtRequestedOffset() {
        val result = TemplateResolver.insertToken("limit of  at pickup", "HOLD_AMOUNT", 9, 9)
        assertEquals("limit of {HOLD_AMOUNT} at pickup", result.text)
        assertEquals(22, result.cursor)
    }

    @Test
    fun tokenInsertion_priceAtRequestedOffset() {
        val result = TemplateResolver.insertToken("price is  now", "PRICE", 9, 9)
        assertEquals("price is {PRICE} now", result.text)
        assertEquals(16, result.cursor)
    }

    @Test
    fun tokenInsertion_atOffsetZero() {
        val result = TemplateResolver.insertToken("after", TemplateVariableRegistry.HOLD_AMOUNT, 0, 0)
        assertEquals("{HOLD_AMOUNT} after", result.text)
        assertEquals("{HOLD_AMOUNT} ".length, result.cursor)
    }

    @Test
    fun tokenInsertion_happensAtCursor() {
        val result = TemplateResolver.insertToken("Hello world", "HOLD_AMOUNT", 6, 6)
        assertEquals("Hello {HOLD_AMOUNT} world", result.text)
        assertEquals("Hello {HOLD_AMOUNT} ".length, result.cursor)
    }

    @Test
    fun tokenInsertion_atEnd() {
        val text = "Please arrive "
        val result = TemplateResolver.insertToken(text, TemplateVariableRegistry.CUSTOMER, text.length, text.length)
        assertEquals("Please arrive {CUSTOMER}", result.text)
        assertEquals("Please arrive {CUSTOMER}".length, result.cursor)
    }

    @Test
    fun tokenInsertion_cursorEndsAfterToken() {
        val result = TemplateResolver.insertToken("ab", "BRANCH", 1, 1)
        assertEquals("a {BRANCH} b", result.text)
        assertEquals("a {BRANCH} ".length, result.cursor)
    }

    @Test
    fun tokenInsertion_replacesSelection() {
        val result = TemplateResolver.insertToken("aaXXXbb", "PRICE", 2, 5)
        assertEquals("aa {PRICE} bb", result.text)
        assertEquals("aa {PRICE} ".length, result.cursor)
    }

    @Test
    fun variableSelector_comesFromCentralRegistry() {
        val he = TemplateVariableRegistry.selectorLabels(ShareLanguage.HE)
        val en = TemplateVariableRegistry.selectorLabels(ShareLanguage.EN)
        assertEquals(TemplateVariableRegistry.ALL.map { it.token }, he.map { it.first })
        assertEquals(TemplateVariableRegistry.ALL.map { it.token }, en.map { it.first })
        assertEquals(
            listOf("מסגרת אשראי", "ספק", "סניף", "לקוח", "מחיר", "סוג רכב"),
            he.map { it.second }
        )
        assertEquals(
            listOf("Credit Hold", "Supplier", "Branch", "Customer", "Price", "Car Type"),
            en.map { it.second }
        )
        assertEquals(
            TemplateVariableIconKind.entries.toSet(),
            TemplateVariableRegistry.ALL.map { it.iconKind }.toSet()
        )
        assertEquals(6, he.size)
    }

    @Test
    fun newSupplierWithoutCustomization_returnsCanonicalDefaults() {
        val he = EffectiveCustomerTermsResolver.resolve(ShareLanguage.HE, customized = false, customRows = emptyList())
        val en = EffectiveCustomerTermsResolver.resolve(ShareLanguage.EN, customized = false, customRows = emptyList())
        assertFalse(he.customized)
        assertFalse(en.customized)
        assertEquals(CustomerTermsDefaults.HEBREW_TEMPLATES, he.terms.map { it.textTemplate })
        assertEquals(CustomerTermsDefaults.ENGLISH_TEMPLATES, en.terms.map { it.textTemplate })
        assertEquals(5, he.terms.size)
        assertEquals(5, en.terms.size)
    }

    @Test
    fun coerceInsertionOffset_emptyAndBounds() {
        assertEquals(0, TemplateResolver.coerceInsertionOffset(5, 0))
        assertEquals(0, TemplateResolver.coerceInsertionOffset(-1, 4))
        assertEquals(4, TemplateResolver.coerceInsertionOffset(99, 4))
        assertEquals(2, TemplateResolver.coerceInsertionOffset(2, 4))
    }

    private fun compose(
        hold: Int,
        language: ShareLanguage = ShareLanguage.HE,
        terms: EffectiveCustomerTerms = if (language == ShareLanguage.HE) defaultHe else defaultEn
    ): ReservationShareDocument = CustomerReservationComposer.compose(facts(hold, language), terms)

    private fun facts(hold: Int, language: ShareLanguage = ShareLanguage.HE, reservationId: Long? = 12L) =
        ReservationShareFacts(
            isQuote = false,
            reservationId = reservationId,
            customerFirstName = "Dana",
            customerLastName = "Levi",
            customerPhone = "0500000000",
            fromDate = "01/01/2026",
            toDate = "05/01/2026",
            fromTime = "10:00",
            toTime = "10:00",
            days = 4,
            supplierName = "Hertz",
            branchName = "TLV",
            carType = "Mazda",
            agreedPrice = 1000.0,
            kmIncluded = 250,
            requiredHoldAmount = hold,
            language = language
        )
}
