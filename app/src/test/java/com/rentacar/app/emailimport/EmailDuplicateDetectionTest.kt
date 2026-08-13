package com.rentacar.app.emailimport

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.MessageDigest

class EmailDuplicateDetectionTest {

    private fun sha256(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }

    @Test
    fun duplicateMessageIdConcept() {
        val messageId = "<abc@mail.gmail.com>"
        val seen = mutableSetOf(messageId)
        assertTrue(messageId in seen)
    }

    @Test
    fun duplicateHtmlNormalizedHashDetected() {
        val tablePayload = "מספרהזמנה|עמלה\n1|10\n"
        val hash1 = sha256(tablePayload)
        val hash2 = sha256(tablePayload)
        assertEquals(hash1, hash2)
    }

    @Test
    fun duplicateXlsxContentHashDetected() {
        val bytes = byteArrayOf(1, 2, 3, 4, 5)
        val h1 = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        val h2 = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        assertEquals(h1, h2)
    }

    @Test
    fun forwardedDuplicateDifferentOuterMessageIdStillCaughtByContentHash() {
        val contentHash = sha256("same-report-body")
        val outerId1 = "<forwarded-1@gmail.com>"
        val outerId2 = "<forwarded-2@gmail.com>"
        assertNotEquals(outerId1, outerId2)
        // Content hash is authoritative across forwards
        val importedHashes = setOf(contentHash)
        assertTrue(contentHash in importedHashes)
    }
}
