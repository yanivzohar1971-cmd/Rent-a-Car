package com.rentacar.app.share

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SupplierCustomerTermsCloudCodecTest {

    @Test
    fun roundTrip_preservesCustomTermsAndStyle() {
        val payload = SupplierCustomerTermsCloudCodec.languagePayload(
            customized = true,
            terms = listOf(
                CustomerTermTemplate(
                    textTemplate = "Hold {HOLD_AMOUNT}",
                    enabled = true,
                    bold = true,
                    textColorArgb = 0xFFD32F2F.toInt(),
                    sortOrder = 0
                ),
                CustomerTermTemplate(
                    textTemplate = "Disabled",
                    enabled = false,
                    bold = false,
                    textColorArgb = null,
                    sortOrder = 1
                )
            )
        )
        val encoded = SupplierCustomerTermsCloudCodec.encode(he = payload, en = null)
        val decoded = SupplierCustomerTermsCloudCodec.decode(encoded)
        val he = decoded.languages.getValue("HE")
        assertTrue(he.customized)
        assertEquals("Hold {HOLD_AMOUNT}", he.terms[0].textTemplate)
        assertTrue(he.terms[0].bold)
        assertEquals(0xFFD32F2F.toInt(), he.terms[0].textColorArgb)
        assertFalse(he.terms[1].enabled)
        assertFalse(decoded.languages.getValue("EN").customized)
    }

    @Test
    fun legacyDocument_withoutFields_isSafe() {
        val decoded = SupplierCustomerTermsCloudCodec.decode(null)
        assertTrue(decoded.languages.isEmpty())
        val missing = SupplierCustomerTermsCloudCodec.decode(emptyMap<String, Any>())
        assertTrue(missing.languages.isEmpty())
    }

    @Test
    fun customizedEmpty_isDistinctFromMissing() {
        val encoded = SupplierCustomerTermsCloudCodec.encode(
            he = SupplierCustomerTermsCloudCodec.languagePayload(true, emptyList()),
            en = null
        )
        val he = SupplierCustomerTermsCloudCodec.decode(encoded).languages.getValue("HE")
        assertTrue(he.customized)
        assertTrue(he.terms.isEmpty())
    }
}
