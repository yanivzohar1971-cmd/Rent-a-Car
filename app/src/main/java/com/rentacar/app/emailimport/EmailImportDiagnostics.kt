package com.rentacar.app.emailimport

import com.rentacar.app.mailbox.MailboxProvider

/**
 * Sanitized diagnostics for email commission import (debug / UI).
 * Never includes App Password or raw report payloads.
 */
data class EmailImportDiagnostics(
    val mailboxConnectionOk: Boolean? = null,
    val supplierName: String? = null,
    val supplierId: Long? = null,
    val configuredSender: String? = null,
    val reportFormat: String? = null,
    val messagesScanned: Int = 0,
    val matchingMessages: Int = 0,
    val senderMatchType: String? = null,
    val htmlTablesFound: Int? = null,
    val parsedRows: Int? = null,
    val invalidRows: Int? = null,
    val attachmentsFound: Int? = null,
    val xlsxAttachmentsFound: Int? = null,
    val duplicate: Boolean = false,
    val mailboxProvider: String = MailboxProvider.GMAIL_IMAP.name,
    val notes: List<String> = emptyList()
) {
    fun toSanitizedMap(): Map<String, Any?> = mapOf(
        "mailboxConnectionOk" to mailboxConnectionOk,
        "supplierName" to supplierName,
        "supplierId" to supplierId,
        "configuredSender" to configuredSender,
        "reportFormat" to reportFormat,
        "messagesScanned" to messagesScanned,
        "matchingMessages" to matchingMessages,
        "senderMatchType" to senderMatchType,
        "htmlTablesFound" to htmlTablesFound,
        "parsedRows" to parsedRows,
        "invalidRows" to invalidRows,
        "attachmentsFound" to attachmentsFound,
        "xlsxAttachmentsFound" to xlsxAttachmentsFound,
        "duplicate" to duplicate,
        "mailboxProvider" to mailboxProvider,
        "notes" to notes
    )
}
