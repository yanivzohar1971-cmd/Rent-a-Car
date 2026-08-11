package com.rentacar.app.data.backup

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PreInstallBackupLogicTest {

    private fun dirty(vararg pairs: Pair<String, Int>) =
        PreInstallBackupLogic.buildUnresolvedSummary(pairs.toMap())

    @Test
    fun caseA_syncClean_proceedsToBackups() {
        val d = PreInstallBackupLogic.decideAfterSync(dirty(), attemptsUsed = 1)
        assertEquals(PreInstallBackupLogic.AfterSyncDecision.ProceedToBackupsClean, d)
        assertEquals(
            PreInstallBackupLogic.BackupOutcomeDecision.FullSuccess,
            PreInstallBackupLogic.decideFinalOutcome(
                regularBackupOk = true,
                snapshotOk = true,
                proceededDespiteSyncWarnings = false
            )
        )
    }

    @Test
    fun caseB_syncUnresolved_showsWarning() {
        val summary = dirty("cardStub" to 1)
        val d = PreInstallBackupLogic.decideAfterSync(summary, attemptsUsed = 1)
        assertTrue(d is PreInstallBackupLogic.AfterSyncDecision.ShowWarning)
        assertEquals(1, (d as PreInstallBackupLogic.AfterSyncDecision.ShowWarning).summary.totalDirty)
    }

    @Test
    fun caseC_warningRetryThenClean() {
        val retry = PreInstallBackupLogic.decideAfterWarningChoice(
            PreInstallBackupLogic.UserWarningChoice.Retry,
            attemptsUsed = 1
        )
        assertEquals(PreInstallBackupLogic.AfterWarningDecision.RetrySync, retry)
        val afterClean = PreInstallBackupLogic.decideAfterSync(dirty(), attemptsUsed = 2)
        assertEquals(PreInstallBackupLogic.AfterSyncDecision.ProceedToBackupsClean, afterClean)
    }

    @Test
    fun caseD_continueDespiteWarning_doesNotFakeSync() {
        val decision = PreInstallBackupLogic.decideAfterWarningChoice(
            PreInstallBackupLogic.UserWarningChoice.ContinueDespiteWarnings,
            attemptsUsed = 2
        )
        assertEquals(
            PreInstallBackupLogic.AfterWarningDecision.ContinueToBackupsWithWarningAck,
            decision
        )
        assertEquals(
            PreInstallBackupLogic.BackupOutcomeDecision.SuccessWithSyncWarningOverride,
            PreInstallBackupLogic.decideFinalOutcome(
                regularBackupOk = true,
                snapshotOk = true,
                proceededDespiteSyncWarnings = true
            )
        )
        // Dirty summary still non-clean — override does not clear it
        assertFalse(dirty("cardStub" to 1).isClean)
    }

    @Test
    fun caseE_cancel_aborts() {
        val decision = PreInstallBackupLogic.decideAfterWarningChoice(
            PreInstallBackupLogic.UserWarningChoice.Cancel,
            attemptsUsed = 1
        )
        assertEquals(PreInstallBackupLogic.AfterWarningDecision.Abort, decision)
    }

    @Test
    fun caseF_regularBackupFails() {
        assertEquals(
            PreInstallBackupLogic.BackupOutcomeDecision.FailedAtRegularBackup,
            PreInstallBackupLogic.decideFinalOutcome(
                regularBackupOk = false,
                snapshotOk = false,
                proceededDespiteSyncWarnings = false
            )
        )
    }

    @Test
    fun caseG_snapshotFails_partial() {
        assertEquals(
            PreInstallBackupLogic.BackupOutcomeDecision.PartialSnapshotFailed,
            PreInstallBackupLogic.decideFinalOutcome(
                regularBackupOk = true,
                snapshotOk = false,
                proceededDespiteSyncWarnings = false
            )
        )
    }

    @Test
    fun caseH_cloudAheadAlone_doesNotBlock() {
        assertFalse(PreInstallBackupLogic.shouldBlockSolelyForCloudAhead(cloudCount = 100, localCount = 50))
        val clean = dirty()
        assertTrue(PreInstallBackupLogic.isSyncClean(clean))
        assertEquals(
            PreInstallBackupLogic.AfterSyncDecision.ProceedToBackupsClean,
            PreInstallBackupLogic.decideAfterSync(clean, 1)
        )
    }

    @Test
    fun caseI_failedItemDespiteCloudAhead_stillUnresolved() {
        val summary = dirty("cardStub" to 1)
        assertFalse(PreInstallBackupLogic.isSyncClean(summary))
        assertTrue(
            PreInstallBackupLogic.decideAfterSync(summary, 1)
                is PreInstallBackupLogic.AfterSyncDecision.ShowWarning
        )
    }

    @Test
    fun cardStub_hebrewLabel() {
        assertEquals(
            "סטובס כרטיסים",
            PreInstallBackupLogic.displayNameForEntityType("cardStub")
        )
    }

    @Test
    fun retry_exhausted_staysOnWarning() {
        val d = PreInstallBackupLogic.decideAfterWarningChoice(
            PreInstallBackupLogic.UserWarningChoice.Retry,
            attemptsUsed = PreInstallBackupLogic.MAX_SYNC_ATTEMPTS
        )
        assertEquals(PreInstallBackupLogic.AfterWarningDecision.RetryExhaustedStayOnWarning, d)
    }

    @Test
    fun continueDoesNotImplyCleanSync() {
        // Documented contract: override flag is separate from isClean
        val unresolved = dirty("cardStub" to 1, "reservation" to 0)
        assertEquals(1, unresolved.totalDirty)
        assertFalse(unresolved.isClean)
    }
}
