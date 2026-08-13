package com.rentacar.app.emailimport

import com.rentacar.app.emailimport.debug.EmailImportDebugSession
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
    val notes: List<String> = emptyList(),
    val sessionId: String? = null,
    val failureStage: String? = null,
    val failureExceptionClass: String? = null,
    val failureMessage: String? = null,
    val failureCauseClass: String? = null,
    val searchWindowDescription: String? = null,
    val candidateMessages: Int? = null,
    val debugJsonAvailable: Boolean = false
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
        "notes" to notes,
        "sessionId" to sessionId,
        "failureStage" to failureStage,
        "failureExceptionClass" to failureExceptionClass,
        "failureMessage" to failureMessage,
        "failureCauseClass" to failureCauseClass,
        "searchWindowDescription" to searchWindowDescription,
        "candidateMessages" to candidateMessages
    )

    companion object {
        fun fromSession(
            session: EmailImportDebugSession,
            notes: List<String> = emptyList()
        ): EmailImportDiagnostics = EmailImportDiagnostics(
            mailboxConnectionOk = session.connectionSucceeded,
            supplierName = session.supplierName,
            supplierId = session.supplierId,
            configuredSender = session.configuredSender,
            reportFormat = session.reportFormat,
            messagesScanned = session.messagesScanned,
            matchingMessages = session.matchingMessages,
            senderMatchType = session.senderMatchType,
            htmlTablesFound = session.tablesFound,
            parsedRows = session.parsedRows,
            invalidRows = session.rejectedRows,
            duplicate = session.duplicateDetected,
            notes = notes,
            sessionId = session.sessionId,
            failureStage = session.failureStage?.name,
            failureExceptionClass = session.failureExceptionClass,
            failureMessage = session.failureMessage,
            failureCauseClass = session.failureCauseClass,
            searchWindowDescription = session.searchQueryDescription,
            candidateMessages = session.candidateMessages,
            debugJsonAvailable = true
        )
    }
}
