package com.rentacar.app.mailbox

import java.util.Date
import javax.mail.search.AndTerm
import javax.mail.search.BodyTerm
import javax.mail.search.ComparisonTerm
import javax.mail.search.FromStringTerm
import javax.mail.search.HeaderTerm
import javax.mail.search.ReceivedDateTerm
import javax.mail.search.SearchTerm

/**
 * Builds the server-side IMAP search terms used by [GmailImapMailboxClient].
 * Pure / unit-testable — no network.
 */
object GmailSupplierImapSearchPlan {

    enum class Kind {
        DIRECT_FROM,
        REPLY_TO,
        BODY_FORWARD
    }

    data class PlannedSearch(
        val kind: Kind,
        val term: SearchTerm,
        val description: String
    )

    data class DateWindow(
        val sinceEpochMillis: Long,
        val untilEpochMillis: Long
    ) {
        fun toDateTerm(): SearchTerm = AndTerm(
            ReceivedDateTerm(ComparisonTerm.GE, Date(sinceEpochMillis)),
            ReceivedDateTerm(ComparisonTerm.LE, Date(untilEpochMillis))
        )
    }

    fun buildDateWindow(sinceEpochMillis: Long, untilEpochMillis: Long): DateWindow =
        DateWindow(sinceEpochMillis, untilEpochMillis)

    fun buildPlannedSearches(
        configuredSenderEmail: String,
        sinceEpochMillis: Long,
        untilEpochMillis: Long
    ): List<PlannedSearch> {
        val date = buildDateWindow(sinceEpochMillis, untilEpochMillis).toDateTerm()
        val sender = configuredSenderEmail.trim()
        return listOf(
            PlannedSearch(
                kind = Kind.DIRECT_FROM,
                term = AndTerm(date, FromStringTerm(sender)),
                description = "ReceivedDate window AND FromStringTerm($sender)"
            ),
            PlannedSearch(
                kind = Kind.REPLY_TO,
                term = AndTerm(date, HeaderTerm("Reply-To", sender)),
                description = "ReceivedDate window AND HeaderTerm(Reply-To,$sender)"
            ),
            PlannedSearch(
                kind = Kind.BODY_FORWARD,
                term = AndTerm(date, BodyTerm(sender)),
                description = "ReceivedDate window AND BodyTerm($sender)"
            )
        )
    }

    /**
     * Deduplicate messages by IMAP UID when available, else Message-ID / messageNumber.
     * Preserves first-seen order from [orderedGroups], then caller may re-sort by date.
     */
    fun <T> dedupeByKeys(
        items: List<T>,
        uidOf: (T) -> Long?,
        messageIdOf: (T) -> String?,
        messageNumberOf: (T) -> Int
    ): List<T> {
        val out = LinkedHashMap<String, T>()
        for (item in items) {
            val uid = uidOf(item)
            val key = when {
                uid != null && uid > 0L -> "uid:$uid"
                !messageIdOf(item).isNullOrBlank() -> "mid:${messageIdOf(item)}"
                else -> "num:${messageNumberOf(item)}"
            }
            out.putIfAbsent(key, item)
        }
        return out.values.toList()
    }
}
