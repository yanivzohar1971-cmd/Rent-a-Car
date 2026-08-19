package com.rentacar.app.mailbox

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.io.OutputStream
import java.util.Properties
import javax.activation.DataHandler
import javax.activation.DataSource
import javax.mail.Part
import javax.mail.Session
import javax.mail.internet.MimeBodyPart
import javax.mail.internet.MimeMessage
import javax.mail.internet.MimeMultipart

class MailboxMimeExtractorTest {

    private val session: Session = Session.getInstance(Properties())

    private val reportHtml = """
        <table>
          <tr>
            <th>מספר הזמנה</th><th>עמלה</th><th>סהכ ימים לחישוב עמלות</th><th>שם מנוי</th>
            <th>מספר חשבונית</th><th>סה"כ הכנסה מהשכרה לפניי מע"מ</th><th>אחוז</th><th>שם סוכן</th>
          </tr>
          <tr><td>1</td><td>2</td><td>3</td><td>x</td><td>5</td><td>6</td><td>0.07</td><td>y</td></tr>
        </table>
    """.trimIndent()

    @Test
    fun collectsHtmlEvenWhenLogoPngPresent() {
        val logo = CountingDataSource(ByteArray(4096) { 1 }, "image/png", "logo.png")
        val mixed = MimeMultipart("related")
        mixed.addBodyPart(MimeBodyPart().apply { setContent("<p>hi</p>$reportHtml<img src=\"cid:logo\"/>", "text/html; charset=UTF-8") })
        mixed.addBodyPart(MimeBodyPart().apply {
            dataHandler = DataHandler(logo)
            setHeader("Content-Type", "image/png")
            setHeader("Content-Length", "4096")
            setDisposition(Part.INLINE)
            setContentID("<logo@shagrir>")
            fileName = "logo.png"
        })
        val msg = MimeMessage(session).apply { setContent(mixed) }
        msg.saveChanges()
        logo.openCount = 0
        val extracted = MailboxMimeExtractor.extract(msg, downloadBinaryPayloads = false)
        assertTrue(extracted.htmlParts.isNotEmpty())
        assertTrue(extracted.htmlParts.any { it.text.orEmpty().contains("מספר הזמנה") })
        assertTrue(extracted.inlineImages.isNotEmpty())
        assertEquals(0, logo.openCount)
    }

    @Test
    fun multipleHtmlPartsIncludingNonFirst() {
        val alt = MimeMultipart("alternative")
        alt.addBodyPart(MimeBodyPart().apply { setText("plain") })
        alt.addBodyPart(MimeBodyPart().apply { setContent("<p>first html no table</p>", "text/html; charset=UTF-8") })
        val mixed = MimeMultipart("mixed")
        mixed.addBodyPart(MimeBodyPart().apply { setContent(alt) })
        mixed.addBodyPart(MimeBodyPart().apply { setContent(reportHtml, "text/html; charset=UTF-8") })
        val msg = MimeMessage(session).apply { setContent(mixed) }
        msg.saveChanges()
        val extracted = MailboxMimeExtractor.extract(msg)
        assertTrue("html parts=${extracted.htmlParts.size} inventory=${extracted.inventory.map { it.mimeType }}", extracted.htmlParts.size >= 2)
        assertTrue(extracted.htmlParts.any { it.text.orEmpty().contains("מספר הזמנה") })
        assertFalse(extracted.htmlParts.first().text.orEmpty().contains("מספר הזמנה") && extracted.htmlParts.size == 1)
    }

    @Test
    fun nestedRfc822AttachmentHtmlIsCollected() {
        val inner = MimeMessage(session).apply {
            setContent(reportHtml, "text/html; charset=UTF-8")
        }
        inner.saveChanges()
        val wrapper = MimeBodyPart().apply {
            dataHandler = javax.activation.DataHandler(inner, "message/rfc822")
            setDisposition(Part.ATTACHMENT)
        }
        val mixed = MimeMultipart("mixed")
        mixed.addBodyPart(MimeBodyPart().apply { setContent("<p>fwd</p>", "text/html; charset=UTF-8") })
        mixed.addBodyPart(wrapper)
        val msg = MimeMessage(session).apply { setContent(mixed) }
        msg.saveChanges()
        val extracted = MailboxMimeExtractor.extract(msg, downloadBinaryPayloads = false)
        assertTrue(
            "parts=${extracted.htmlParts.map { it.mimePath to it.text?.take(40) }}",
            extracted.htmlParts.any { it.text.orEmpty().contains("מספר הזמנה") }
        )
        assertTrue(extracted.htmlParts.any { it.mimePath.contains("rfc822") || it.text.orEmpty().contains("עמלה") })
    }

    @Test
    fun imageBytesAreNotDownloadedForHtmlParsing() {
        val png = CountingDataSource(ByteArray(64_000) { 2 }, "image/png", "shot.png")
        val mixed = MimeMultipart("related")
        mixed.addBodyPart(MimeBodyPart().apply { setContent(reportHtml, "text/html; charset=UTF-8") })
        mixed.addBodyPart(MimeBodyPart().apply {
            dataHandler = DataHandler(png)
            setHeader("Content-Type", "image/png")
            setHeader("Content-Length", "64000")
            setDisposition(Part.INLINE)
        })
        val msg = MimeMessage(session).apply { setContent(mixed) }
        png.openCount = 0
        MailboxMimeExtractor.extract(msg, downloadBinaryPayloads = false)
        assertEquals("HTML parse must not open PNG InputStream", 0, png.openCount)
    }

    private class CountingDataSource(
        private val bytes: ByteArray,
        private val type: String,
        private val name: String
    ) : DataSource {
        var openCount: Int = 0
        override fun getInputStream(): InputStream {
            openCount++
            return ByteArrayInputStream(bytes)
        }
        override fun getOutputStream(): OutputStream = throw UnsupportedOperationException()
        override fun getContentType(): String = type
        override fun getName(): String = name
    }
}
