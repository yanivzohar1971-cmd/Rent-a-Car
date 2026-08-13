package com.rentacar.app.emailimport

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EmailAddressNormalizerTest {

    @Test
    fun normalizesDisplayNameAngleBrackets() {
        assertEquals(
            "assaft@shagrir.co.il",
            EmailAddressNormalizer.normalize("אסף תמיר <assaft@shagrir.co.il>")
        )
    }

    @Test
    fun caseInsensitive() {
        assertTrue(
            EmailAddressNormalizer.equalsNormalized(
                "AssafT@Shagrir.co.il",
                "assaft@shagrir.co.il"
            )
        )
    }

    @Test
    fun trimsWhitespace() {
        assertEquals(
            "commissions@example.co.il",
            EmailAddressNormalizer.normalize("  commissions@example.co.il  ")
        )
    }

    @Test
    fun rejectsBlank() {
        assertNull(EmailAddressNormalizer.normalize("   "))
        assertFalse(EmailAddressNormalizer.isSyntacticallyValid(null))
    }

    @Test
    fun validatesSyntax() {
        assertTrue(EmailAddressNormalizer.isSyntacticallyValid("assaft@shagrir.co.il"))
        assertFalse(EmailAddressNormalizer.isSyntacticallyValid("not-an-email"))
    }
}
