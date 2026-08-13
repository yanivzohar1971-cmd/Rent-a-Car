package com.rentacar.app.mailbox

/**
 * Mailbox credentials for the application's single Gmail connection.
 * Never log or persist the app password via toString/debug JSON.
 */
data class MailboxCredentials(
    val emailAddress: String,
    val appPassword: String
) {
    override fun toString(): String =
        "MailboxCredentials(emailAddress=$emailAddress, appPassword=********)"

    fun maskedForDiagnostics(): Map<String, String> = mapOf(
        "emailAddress" to emailAddress,
        "appPassword" to "********",
        "hasAppPassword" to (appPassword.isNotBlank()).toString()
    )
}

enum class MailboxProvider {
    GMAIL_IMAP
}

sealed class MailboxConnectionResult {
    data object Success : MailboxConnectionResult()
    data class Failure(val error: MailboxError) : MailboxConnectionResult()
}

enum class MailboxError {
    NOT_CONFIGURED,
    INVALID_ACCOUNT,
    INVALID_APP_PASSWORD,
    AUTHENTICATION_FAILED,
    NETWORK_UNAVAILABLE,
    SSL_FAILURE,
    TIMEOUT,
    MAILBOX_UNAVAILABLE,
    UNKNOWN;

    fun hebrewMessage(): String = when (this) {
        NOT_CONFIGURED -> "תיבת המייל אינה מוגדרת"
        INVALID_ACCOUNT -> "כתובת Gmail אינה תקינה"
        INVALID_APP_PASSWORD -> "סיסמת אפליקציה אינה תקינה"
        AUTHENTICATION_FAILED -> "האימות לתיבת המייל נכשל"
        NETWORK_UNAVAILABLE -> "אין חיבור לרשת"
        SSL_FAILURE -> "שגיאת אבטחת חיבור (SSL)"
        TIMEOUT -> "תם הזמן המוקצב לחיבור לתיבת המייל"
        MAILBOX_UNAVAILABLE -> "תיבת המייל אינה זמינה"
        UNKNOWN -> "שגיאה לא ידועה בחיבור לתיבת המייל"
    }
}

/**
 * Replaceable mailbox transport. Future Gmail API client can implement the same contract.
 */
interface MailboxClient {
    val provider: MailboxProvider

    suspend fun testConnection(credentials: MailboxCredentials): MailboxConnectionResult

    suspend fun findMessagesBySender(
        credentials: MailboxCredentials,
        configuredSenderEmail: String,
        sinceEpochMillis: Long,
        limit: Int = 50
    ): MailboxSearchResult
}

data class MailboxSearchResult(
    val success: Boolean,
    val messages: List<MailboxMessageRef> = emptyList(),
    val scannedCount: Int = 0,
    val error: MailboxError? = null,
    val errorDetail: String? = null
)

data class MailboxMessageRef(
    val messageId: String?,
    val imapUid: Long?,
    val subject: String,
    val receivedAt: Long,
    val fromHeader: String?,
    val replyToHeader: String?,
    val folderName: String = "INBOX"
)

data class MailboxMessageContent(
    val ref: MailboxMessageRef,
    val htmlBody: String?,
    val plainBody: String?,
    val attachments: List<MailboxAttachment>
)

data class MailboxAttachment(
    val fileName: String,
    val mimeType: String?,
    val sizeBytes: Long,
    val bytes: ByteArray
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is MailboxAttachment) return false
        return fileName == other.fileName &&
            mimeType == other.mimeType &&
            sizeBytes == other.sizeBytes &&
            bytes.contentEquals(other.bytes)
    }

    override fun hashCode(): Int {
        var result = fileName.hashCode()
        result = 31 * result + (mimeType?.hashCode() ?: 0)
        result = 31 * result + sizeBytes.hashCode()
        result = 31 * result + bytes.contentHashCode()
        return result
    }

    override fun toString(): String =
        "MailboxAttachment(fileName=$fileName, mimeType=$mimeType, sizeBytes=$sizeBytes, bytes=[${bytes.size} bytes])"
}
