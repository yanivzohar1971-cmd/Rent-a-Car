package com.rentacar.app.data.backup

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression: CardStub failures remain dirty when user continues pre-install backup.
 * Continue-despite-warning is an operation acknowledgment only — never marks SYNCED.
 */
class PreInstallCardStubContinueRegressionTest {

    @Test
    fun continueToBackup_doesNotClearCardStubDirtySemantics() {
        val unresolved = PreInstallBackupLogic.buildUnresolvedSummary(
            mapOf("cardStub" to 1)
        )
        assertEquals("סטובס כרטיסים", unresolved.typeCounts.single().displayName)
        assertFalse(unresolved.isClean)

        val choice = PreInstallBackupLogic.decideAfterWarningChoice(
            PreInstallBackupLogic.UserWarningChoice.ContinueDespiteWarnings,
            attemptsUsed = 2
        )
        assertEquals(
            PreInstallBackupLogic.AfterWarningDecision.ContinueToBackupsWithWarningAck,
            choice
        )

        val outcome = PreInstallBackupLogic.decideFinalOutcome(
            regularBackupOk = true,
            snapshotOk = true,
            proceededDespiteSyncWarnings = true
        )
        assertEquals(
            PreInstallBackupLogic.BackupOutcomeDecision.SuccessWithSyncWarningOverride,
            outcome
        )

        // Same unresolved facts remain — next normal sync must still see dirty CardStub
        assertTrue(unresolved.totalDirty == 1)
        assertFalse(PreInstallBackupLogic.isSyncClean(unresolved))
    }
}
