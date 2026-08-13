package com.rentacar.app.emailimport.debug

import android.util.Log
import com.google.gson.GsonBuilder
import com.rentacar.app.BuildConfig
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList

enum class EmailImportDebugStage {
    START,
    SUPPLIER_CONFIG,
    CREDENTIAL_LOAD,
    NETWORK_CHECK,
    IMAP_CREATE,
    IMAP_CONNECT_START,
    IMAP_CONNECT_SUCCESS,
    IMAP_CONNECT_FAILURE,
    FOLDER_OPEN_START,
    FOLDER_OPEN_SUCCESS,
    FOLDER_OPEN_FAILURE,
    SEARCH_WINDOW,
    SEARCH_BUILD,
    SEARCH_START,
    SEARCH_PROGRESS,
    SEARCH_RESULT,
    SERVER_SEARCH_DIRECT_START,
    SERVER_SEARCH_DIRECT_RESULT,
    SERVER_SEARCH_REPLY_TO_START,
    SERVER_SEARCH_REPLY_TO_RESULT,
    SERVER_SEARCH_BODY_START,
    SERVER_SEARCH_BODY_RESULT,
    SERVER_SEARCH_MERGED,
    SERVER_SEARCH_FALLBACK,
    CANDIDATE_LOCAL_VALIDATION,
    CANDIDATE_PREVIEW_START,
    SELECTED_MESSAGE_FETCH_START,
    SELECTED_MESSAGE_FETCH_SUCCESS,
    MIME_PARSE_START,
    MIME_PARSE_SUCCESS,
    RECONCILIATION_START,
    RECONCILIATION_SUCCESS,
    CANDIDATE_PREVIEW_FAILURE,
    CANDIDATE_PREVIEW_COMPLETE,
    MESSAGE_LOAD,
    MESSAGE_FROM,
    MESSAGE_REPLY_TO,
    FORWARDED_FROM,
    SENDER_MATCH,
    MIME_PARSE,
    MIME_TREE,
    MIME_HTML_PART,
    MIME_INLINE_IMAGE,
    HTML_FOUND,
    HTML_PART_SCAN,
    TABLE_SCAN,
    TABLE_FOUND,
    TABLE_HEADER_CANDIDATE,
    TABLE_SCORE,
    TABLE_SELECTED,
    REQUIRED_HEADER_MATCH,
    REQUIRED_HEADER_MISSING,
    TABLE_ROW_PARSE_START,
    TABLE_ROW_PARSE_FAILURE,
    TABLE_PARSE,
    TABLE_PARSE_SUCCESS,
    TABLE_PARSE_FAILURE,
    ROW_NORMALIZE,
    DUPLICATE_CHECK,
    IMPORT_READY,
    ERROR,
    COMPLETE
}

enum class EmailImportDebugStatus {
    INFO,
    SUCCESS,
    FAILURE,
    WARNING
}

data class EmailImportDebugEvent(
    val timestampMs: Long = System.currentTimeMillis(),
    val sessionId: String,
    val stage: EmailImportDebugStage,
    val status: EmailImportDebugStatus,
    val message: String,
    val metadata: Map<String, Any?> = emptyMap()
)

/**
 * In-memory debug session for one "חפש דוח במייל" attempt.
 * Never stores secrets (App Password, tokens, raw MIME).
 */
class EmailImportDebugSession private constructor(
    val sessionId: String,
    val startedAtMs: Long = System.currentTimeMillis()
) {
    private val events = CopyOnWriteArrayList<EmailImportDebugEvent>()
    @Volatile var failureStage: EmailImportDebugStage? = null
    @Volatile var failureExceptionClass: String? = null
    @Volatile var failureMessage: String? = null
    @Volatile var failureCauseClass: String? = null

    // Snapshot fields filled as the pipeline progresses
    @Volatile var supplierId: Long? = null
    @Volatile var supplierName: String? = null
    @Volatile var configuredSender: String? = null
    @Volatile var reportFormat: String? = null
    @Volatile var credentialsConfigured: Boolean? = null
    @Volatile var appPasswordLength: Int? = null
    @Volatile var mailboxHost: String = "imap.gmail.com"
    @Volatile var mailboxPort: Int = 993
    @Volatile var connectionAttempted: Boolean = false
    @Volatile var connectionSucceeded: Boolean? = null
    @Volatile var folderName: String = "INBOX"
    @Volatile var searchQueryDescription: String? = null
    @Volatile var searchWindowStartMs: Long? = null
    @Volatile var searchWindowEndMs: Long? = null
    @Volatile var folderMessageCount: Int? = null
    @Volatile var messagesScanned: Int = 0
    @Volatile var candidateMessages: Int = 0
    @Volatile var matchingMessages: Int = 0
    @Volatile var senderMatchType: String? = null
    @Volatile var directServerMatches: Int? = null
    @Volatile var replyToServerMatches: Int? = null
    @Volatile var bodyServerMatches: Int? = null
    @Volatile var mergedServerCandidates: Int? = null
    @Volatile var localHeaderChecks: Int? = null
    @Volatile var localBodyDownloads: Int? = null
    @Volatile var serverSearchMs: Long? = null
    @Volatile var localValidationMs: Long? = null
    @Volatile var candidateMetadataMs: Long? = null
    @Volatile var totalSearchMs: Long? = null
    @Volatile var fallbackUsed: Boolean = false
    @Volatile var fallbackReason: String? = null
    @Volatile var searchMode: String? = null // SERVER_FILTERED | BOUNDED_LOCAL_SCAN
    @Volatile var htmlFound: Boolean? = null
    @Volatile var tablesFound: Int? = null
    @Volatile var selectedTableRows: Int? = null
    @Volatile var parsedRows: Int? = null
    @Volatile var rejectedRows: Int? = null
    @Volatile var duplicateDetected: Boolean = false
    @Volatile var duplicateReason: String? = null
    /** Search session that produced the candidate being previewed. */
    @Volatile var parentSearchSessionId: String? = null
    @Volatile var candidateMessageIdHash: String? = null
    @Volatile var selectedRepresentation: String? = null
    @Volatile var selectedHtmlPartIndex: Int? = null
    @Volatile var selectedTableIndex: Int? = null
    @Volatile var selectedHeaderRowIndex: Int? = null

    fun event(
        stage: EmailImportDebugStage,
        status: EmailImportDebugStatus,
        message: String,
        metadata: Map<String, Any?> = emptyMap()
    ) {
        val safeMeta = sanitizeMetadata(metadata)
        val ev = EmailImportDebugEvent(
            sessionId = sessionId,
            stage = stage,
            status = status,
            message = sanitizeText(message),
            metadata = safeMeta
        )
        events += ev
        emitLogcat { Log.i(TAG, formatLogLine(ev)) }
    }

    fun recordFailure(stage: EmailImportDebugStage, throwable: Throwable, message: String? = null) {
        failureStage = stage
        failureExceptionClass = throwable.javaClass.name
        failureCauseClass = throwable.cause?.javaClass?.name
        failureMessage = sanitizeText(message ?: throwable.message ?: throwable.javaClass.simpleName)
        event(
            stage = EmailImportDebugStage.ERROR,
            status = EmailImportDebugStatus.FAILURE,
            message = failureMessage ?: "error",
            metadata = mapOf(
                "stage" to stage.name,
                "exceptionClass" to failureExceptionClass,
                "causeClass" to failureCauseClass,
                "sanitizedMessage" to failureMessage
            )
        )
        emitLogcat {
            Log.e(
                TAG,
                "[EMAIL_IMPORT][session=$sessionId][ERROR] stage=${stage.name} exception=${throwable.javaClass.simpleName} message=$failureMessage"
            )
        }
    }

    fun snapshotEvents(): List<EmailImportDebugEvent> = events.toList()

    companion object {
        const val TAG = "RentCarEmailImport"
        const val SCHEMA_VERSION = 1

        fun create(): EmailImportDebugSession =
            EmailImportDebugSession(sessionId = UUID.randomUUID().toString().take(8))

        private val SECRET_EXACT_KEYS = setOf(
            "password", "apppassword", "app_password", "token", "authorization",
            "auth", "secret", "rawbody", "html", "mime", "credential"
        )

        fun sanitizeText(value: String): String {
            var s = value
            // Redact obvious password-like tokens (values), keep length/present counters intact
            s = s.replace(Regex("(?i)(password|appPassword|app_password)\\s*[:=]\\s*(?!\\*{3,})\\S+"), "$1=********")
            s = s.replace(Regex("(?i)Authorization:\\s*\\S+"), "Authorization: ********")
            if (s.length > 500) s = s.take(500) + "…"
            return s
        }

        fun sanitizeMetadata(metadata: Map<String, Any?>): Map<String, Any?> =
            metadata.mapValues { (k, v) ->
                val key = k.lowercase(Locale.US)
                when {
                    // Exact secret keys only — do NOT redact appPasswordLength / appPasswordPresent
                    SECRET_EXACT_KEYS.contains(key) -> "********"
                    v is String -> sanitizeText(v)
                    v is Number || v is Boolean || v == null -> v
                    else -> sanitizeText(v.toString())
                }
            }

        private fun formatLogLine(ev: EmailImportDebugEvent): String {
            val meta = if (ev.metadata.isEmpty()) "" else " " + ev.metadata.entries.joinToString(" ") { "${it.key}=${it.value}" }
            return "[EMAIL_IMPORT][session=${ev.sessionId}][${ev.stage.name}] ${ev.message}$meta"
        }

        /** Logcat is unavailable in JVM unit tests; never fail the pipeline for logging. */
        private fun emitLogcat(block: () -> Unit) {
            if (!BuildConfig.DEBUG) return
            try {
                block()
            } catch (_: Throwable) {
                // no-op (unit tests / missing Android Log)
            }
        }
    }
}

object EmailImportDebugHub {
    @Volatile
    var latest: EmailImportDebugSession? = null
        private set

    @Volatile
    var lastSearchSessionId: String? = null
        private set

    fun begin(): EmailImportDebugSession {
        val session = EmailImportDebugSession.create()
        latest = session
        lastSearchSessionId = session.sessionId
        session.event(EmailImportDebugStage.START, EmailImportDebugStatus.INFO, "Email import session started")
        return session
    }

    /**
     * Child session for one candidate preview ("בדוק והתאם הזמנות").
     * Keeps search evidence intact while writing a fresh preview analysis trail.
     */
    fun beginPreview(parentSessionId: String?): EmailImportDebugSession {
        val session = EmailImportDebugSession.create()
        session.parentSearchSessionId = parentSessionId ?: lastSearchSessionId
        latest = session
        session.event(
            EmailImportDebugStage.START,
            EmailImportDebugStatus.INFO,
            "Email import preview session started",
            mapOf("parentSearchSessionId" to session.parentSearchSessionId)
        )
        return session
    }
}

object EmailImportDebugJsonExporter {
    private val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US)
    private val gson = GsonBuilder()
        .setPrettyPrinting()
        .serializeNulls()
        .disableHtmlEscaping()
        .create()

    fun toJson(
        session: EmailImportDebugSession,
        appVersionName: String,
        appVersionCode: Int,
        buildType: String,
        deviceManufacturer: String,
        deviceModel: String,
        androidVersion: String,
        sdkInt: Int
    ): String {
        val events = session.snapshotEvents().map { ev ->
            linkedMapOf(
                "timestamp" to iso.format(Date(ev.timestampMs)),
                "stage" to ev.stage.name,
                "status" to ev.status.name,
                "message" to ev.message,
                "metadata" to ev.metadata
            )
        }
        val root = linkedMapOf(
            "schemaVersion" to EmailImportDebugSession.SCHEMA_VERSION,
            "feature" to "supplier_commission_email_import",
            "generatedAt" to iso.format(Date()),
            "sessionId" to session.sessionId,
            "app" to linkedMapOf(
                "versionName" to appVersionName,
                "versionCode" to appVersionCode,
                "buildType" to buildType
            ),
            "device" to linkedMapOf(
                "manufacturer" to deviceManufacturer,
                "model" to deviceModel,
                "androidVersion" to androidVersion,
                "sdk" to sdkInt
            ),
            "supplier" to linkedMapOf(
                "id" to session.supplierId,
                "name" to session.supplierName,
                "configuredSender" to session.configuredSender,
                "reportFormat" to session.reportFormat
            ),
            "mailbox" to linkedMapOf(
                "provider" to "GMAIL_IMAP",
                "host" to session.mailboxHost,
                "port" to session.mailboxPort,
                "ssl" to true,
                "credentialsConfigured" to session.credentialsConfigured,
                "appPasswordPresent" to ((session.appPasswordLength ?: 0) > 0),
                "appPasswordLength" to session.appPasswordLength,
                "connectionAttempted" to session.connectionAttempted,
                "connectionSucceeded" to session.connectionSucceeded
            ),
            "search" to linkedMapOf(
                "folder" to session.folderName,
                "queryDescription" to session.searchQueryDescription,
                "windowStartMs" to session.searchWindowStartMs,
                "windowEndMs" to session.searchWindowEndMs,
                "folderMessageCount" to session.folderMessageCount,
                "messagesScanned" to session.messagesScanned,
                "candidateMessages" to session.candidateMessages,
                "matchingMessages" to session.matchingMessages,
                "searchMode" to session.searchMode,
                "directServerMatches" to session.directServerMatches,
                "replyToServerMatches" to session.replyToServerMatches,
                "bodyServerMatches" to session.bodyServerMatches,
                "mergedServerCandidates" to session.mergedServerCandidates,
                "localHeaderChecks" to session.localHeaderChecks,
                "localBodyDownloads" to session.localBodyDownloads,
                "serverSearchMs" to session.serverSearchMs,
                "candidateMetadataMs" to session.candidateMetadataMs,
                "localValidationMs" to session.localValidationMs,
                "totalSearchMs" to session.totalSearchMs,
                "fallbackUsed" to session.fallbackUsed,
                "fallbackReason" to session.fallbackReason
            ),
            "preview" to linkedMapOf(
                "parentSearchSessionId" to session.parentSearchSessionId,
                "candidateMessageIdHash" to session.candidateMessageIdHash,
                "selectedRepresentation" to session.selectedRepresentation,
                "selectedHtmlPartIndex" to session.selectedHtmlPartIndex,
                "selectedTableIndex" to session.selectedTableIndex,
                "selectedHeaderRowIndex" to session.selectedHeaderRowIndex
            ),
            "message" to linkedMapOf(
                "senderMatchType" to session.senderMatchType
            ),
            "parsing" to linkedMapOf(
                "htmlFound" to session.htmlFound,
                "tablesFound" to session.tablesFound,
                "selectedTableRows" to session.selectedTableRows,
                "parsedRows" to session.parsedRows,
                "rejectedRows" to session.rejectedRows
            ),
            "duplicate" to linkedMapOf(
                "detected" to session.duplicateDetected,
                "reason" to session.duplicateReason
            ),
            "failure" to linkedMapOf(
                "stage" to session.failureStage?.name,
                "exceptionClass" to session.failureExceptionClass,
                "causeClass" to session.failureCauseClass,
                "message" to session.failureMessage
            ),
            "events" to events
        )
        return gson.toJson(root)
    }

    fun assertNoSecrets(json: String): Boolean {
        val lower = json.lowercase(Locale.US)
        if (lower.contains("\"apppassword\":") && !lower.contains("********")) return false
        return !Regex("(?i)appPassword\"\\s*:\\s*\"(?!\\*+)[^\"]{8,}\"").containsMatchIn(json)
    }
}
