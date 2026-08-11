package com.rentacar.app.data.backup

/**
 * Pure decision helpers for "גיבוי לפני התקנה".
 * Does not touch the database or WorkManager — callers supply facts.
 */
object PreInstallBackupLogic {

    const val MAX_SYNC_ATTEMPTS: Int = 3

    data class DirtyTypeCount(
        val entityType: String,
        val displayName: String,
        val count: Int
    )

    data class UnresolvedSyncSummary(
        val typeCounts: List<DirtyTypeCount>,
        val lastError: String? = null,
        /** Informational only: categories where localCount > cloudCount. Never alone blocks. */
        val localAheadCategories: List<String> = emptyList()
    ) {
        val totalDirty: Int get() = typeCounts.sumOf { it.count }
        val isClean: Boolean get() = totalDirty == 0
    }

    /** Hebrew labels for sync-queue entity types (prefer existing app terminology). */
    fun displayNameForEntityType(entityType: String): String = when (entityType) {
        "customer" -> "לקוחות"
        "supplier" -> "ספקים"
        "agent" -> "סוכנים"
        "carType" -> "סוגי רכב"
        "branch" -> "סניפים"
        "reservation" -> "הזמנות"
        "payment" -> "תשלומים"
        "commissionRule" -> "כללי עמלה"
        "cardStub" -> "סטובס כרטיסים"
        "request" -> "בקשות"
        "carSale" -> "מכירות"
        "carSaleCommissionPayment" -> "תשלומי עמלת מכירה"
        else -> entityType
    }

    fun buildUnresolvedSummary(
        countsByType: Map<String, Int>,
        lastError: String? = null,
        localAheadCategories: List<String> = emptyList()
    ): UnresolvedSyncSummary {
        val typeCounts = countsByType
            .filter { it.value > 0 }
            .toSortedMap()
            .map { (type, count) ->
                DirtyTypeCount(
                    entityType = type,
                    displayName = displayNameForEntityType(type),
                    count = count
                )
            }
        return UnresolvedSyncSummary(
            typeCounts = typeCounts,
            lastError = lastError?.takeIf { it.isNotBlank() },
            localAheadCategories = localAheadCategories
        )
    }

    /**
     * Clean sync for pre-install means no remaining dirty/failed queue items.
     * Aggregate cloud >= local counts never prove a specific failed item is synced.
     */
    fun isSyncClean(summary: UnresolvedSyncSummary): Boolean = summary.isClean

    /**
     * cloudCount > localCount alone must not block the workflow.
     */
    fun shouldBlockSolelyForCloudAhead(@Suppress("UNUSED_PARAMETER") cloudCount: Int, @Suppress("UNUSED_PARAMETER") localCount: Int): Boolean = false

    fun canRetrySync(attemptsUsed: Int, maxAttempts: Int = MAX_SYNC_ATTEMPTS): Boolean =
        attemptsUsed < maxAttempts

    sealed interface AfterSyncDecision {
        data object ProceedToBackupsClean : AfterSyncDecision
        data class ShowWarning(val summary: UnresolvedSyncSummary, val attemptsUsed: Int) : AfterSyncDecision
    }

    fun decideAfterSync(
        summary: UnresolvedSyncSummary,
        attemptsUsed: Int
    ): AfterSyncDecision {
        return if (isSyncClean(summary)) AfterSyncDecision.ProceedToBackupsClean
        else AfterSyncDecision.ShowWarning(summary, attemptsUsed)
    }

    sealed interface UserWarningChoice {
        data object Retry : UserWarningChoice
        data object ContinueDespiteWarnings : UserWarningChoice
        data object Cancel : UserWarningChoice
    }

    sealed interface AfterWarningDecision {
        data object RetrySync : AfterWarningDecision
        /** Continue backups; do NOT clear dirty flags / fake SYNCED. */
        data object ContinueToBackupsWithWarningAck : AfterWarningDecision
        data object Abort : AfterWarningDecision
        data object RetryExhaustedStayOnWarning : AfterWarningDecision
    }

    fun decideAfterWarningChoice(
        choice: UserWarningChoice,
        attemptsUsed: Int,
        maxAttempts: Int = MAX_SYNC_ATTEMPTS
    ): AfterWarningDecision {
        return when (choice) {
            UserWarningChoice.Cancel -> AfterWarningDecision.Abort
            UserWarningChoice.ContinueDespiteWarnings ->
                AfterWarningDecision.ContinueToBackupsWithWarningAck
            UserWarningChoice.Retry -> {
                if (canRetrySync(attemptsUsed, maxAttempts)) AfterWarningDecision.RetrySync
                else AfterWarningDecision.RetryExhaustedStayOnWarning
            }
        }
    }

    sealed interface BackupOutcomeDecision {
        data object FullSuccess : BackupOutcomeDecision
        data object SuccessWithSyncWarningOverride : BackupOutcomeDecision
        data object FailedAtRegularBackup : BackupOutcomeDecision
        data object PartialSnapshotFailed : BackupOutcomeDecision
    }

    fun decideFinalOutcome(
        regularBackupOk: Boolean,
        snapshotOk: Boolean,
        proceededDespiteSyncWarnings: Boolean
    ): BackupOutcomeDecision {
        if (!regularBackupOk) return BackupOutcomeDecision.FailedAtRegularBackup
        if (!snapshotOk) return BackupOutcomeDecision.PartialSnapshotFailed
        return if (proceededDespiteSyncWarnings) {
            BackupOutcomeDecision.SuccessWithSyncWarningOverride
        } else {
            BackupOutcomeDecision.FullSuccess
        }
    }
}
