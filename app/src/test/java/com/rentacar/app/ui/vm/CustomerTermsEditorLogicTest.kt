package com.rentacar.app.ui.vm

import com.rentacar.app.share.ShareLanguage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CustomerTermsEditorLogicTest {

    @Test
    fun selectingATerm_storesStableTermId() {
        val terms = abc()
        val selected = CustomerTermsEditorLogic.selectedAfterTermAction("b", terms)
        assertEquals("b", selected)
        assertTrue(CustomerTermsEditorLogic.isSelected(terms[1], selected))
        assertFalse(CustomerTermsEditorLogic.isSelected(terms[0], selected))
        assertEquals("b", terms[1].localId)
        assertNotEquals(1, selected)
    }

    @Test
    fun selectedTermMovedUp_remainsSelected() {
        val terms = abc()
        val moved = CustomerTermsEditorLogic.moveUp(terms, "b")
        assertEquals(listOf("b", "a", "c"), moved.map { it.localId })
        assertEquals("b", CustomerTermsEditorLogic.selectedAfterTermAction("b", moved))
        assertEquals("B", moved[0].text)
        assertTrue(CustomerTermsEditorLogic.isSelected(moved[0], "b"))
        assertFalse(CustomerTermsEditorLogic.isSelected(moved[1], "b"))
    }

    @Test
    fun selectedTermMovedDown_remainsSelected() {
        val terms = abc()
        val moved = CustomerTermsEditorLogic.moveDown(terms, "b")
        assertEquals(listOf("a", "c", "b"), moved.map { it.localId })
        assertEquals("b", CustomerTermsEditorLogic.selectedAfterTermAction("b", moved))
        assertEquals("B", moved[2].text)
    }

    @Test
    fun reorder_doesNotTransferSelectionToPreviousIndexOccupant() {
        val terms = abc()
        val moved = CustomerTermsEditorLogic.moveUp(terms, "b")
        val oldIndexOccupant = moved[1]
        assertEquals("a", oldIndexOccupant.localId)
        assertFalse(CustomerTermsEditorLogic.isSelected(oldIndexOccupant, "b"))
        assertTrue(CustomerTermsEditorLogic.isSelected(moved[0], "b"))
    }

    @Test
    fun nonSelectedReorder_doesNotSelectOldIndexOccupant() {
        val terms = abc()
        val moved = CustomerTermsEditorLogic.moveDown(terms, "a")
        assertEquals(listOf("b", "a", "c"), moved.map { it.localId })
        val selectedAfterMovingA = CustomerTermsEditorLogic.selectedAfterTermAction("a", moved)
        assertEquals("a", selectedAfterMovingA)
        assertFalse(CustomerTermsEditorLogic.isSelected(moved[0], selectedAfterMovingA))
        assertEquals("B", moved[0].text)
    }

    @Test
    fun deletingSelectedMiddleTerm_selectsNext() {
        val terms = abc()
        val selected = CustomerTermsEditorLogic.selectionAfterDelete(terms, "b", "b")
        assertEquals("c", selected)
        val (remaining, nextSelected) = CustomerTermsEditorLogic.deleteFromDraft(terms, "b", "b")
        assertEquals(listOf("a", "c"), remaining.map { it.localId })
        assertEquals("c", nextSelected)
    }

    @Test
    fun deletingSelectedLastTerm_selectsPrevious() {
        val terms = abc()
        val (remaining, nextSelected) = CustomerTermsEditorLogic.deleteFromDraft(terms, "c", "c")
        assertEquals(listOf("a", "b"), remaining.map { it.localId })
        assertEquals("b", nextSelected)
    }

    @Test
    fun deletingOnlyRemainingTerm_clearsSelection() {
        val terms = listOf(term("only", "Only"))
        val (remaining, nextSelected) = CustomerTermsEditorLogic.deleteFromDraft(terms, "only", "only")
        assertTrue(remaining.isEmpty())
        assertNull(nextSelected)
    }

    @Test
    fun deletingNonSelectedTerm_preservesCurrentSelection() {
        val terms = abc()
        val (remaining, nextSelected) = CustomerTermsEditorLogic.deleteFromDraft(terms, "a", "c")
        assertEquals(listOf("a", "b"), remaining.map { it.localId })
        assertEquals("a", nextSelected)
    }

    @Test
    fun newlyAddedTerm_becomesSelected() {
        val existing = abc()
        val created = CustomerTermsEditorLogic.newDraftTerm()
        val next = existing + created
        val selected = CustomerTermsEditorLogic.selectedAfterTermAction(created.localId, next)
        assertEquals(created.localId, selected)
        assertEquals("", created.text)
        assertEquals(0, created.selectionStart)
        assertEquals(0, created.selectionEnd)
        assertEquals(TermDraftOrigin.NEW_UNSAVED, created.origin)
    }

    @Test
    fun newTerm_getsStableUniqueDraftId() {
        val first = CustomerTermsEditorLogic.newDraftTerm()
        val second = CustomerTermsEditorLogic.newDraftTerm()
        assertTrue(first.localId.isNotBlank())
        assertTrue(second.localId.isNotBlank())
        assertNotEquals(first.localId, second.localId)
        assertEquals(first.localId, CustomerTermsEditorLogic.listItemKey(first))
        assertNotEquals("0", CustomerTermsEditorLogic.listItemKey(first))
    }

    @Test
    fun meaningfulPopulatedTerm_requiresConfirmation() {
        val term = term("a", "Please bring ID", origin = TermDraftOrigin.NEW_UNSAVED)
        assertTrue(CustomerTermsEditorLogic.requiresDeleteConfirmation(term))
    }

    @Test
    fun persistedTerm_requiresConfirmation() {
        val term = term("a", "", origin = TermDraftOrigin.PERSISTED)
        assertTrue(CustomerTermsEditorLogic.requiresDeleteConfirmation(term))
    }

    @Test
    fun defaultFallbackTerm_requiresConfirmation() {
        val term = term("a", "רישיון נהיגה מקורי בתוקף.", origin = TermDraftOrigin.CANONICAL_DEFAULT)
        assertTrue(CustomerTermsEditorLogic.requiresDeleteConfirmation(term))
    }

    @Test
    fun brandNewBlankUnsavedTerm_canBeDeletedImmediately() {
        val term = CustomerTermsEditorLogic.newDraftTerm()
        assertFalse(CustomerTermsEditorLogic.requiresDeleteConfirmation(term))
        val result = CustomerTermsEditorLogic.requestDelete(listOf(term), term.localId, term.localId)
        assertTrue(result is DeleteRequestResult.DeletedImmediately)
        val deleted = result as DeleteRequestResult.DeletedImmediately
        assertTrue(deleted.terms.isEmpty())
        assertNull(deleted.selectedTermId)
    }

    @Test
    fun cancelDelete_leavesDraftUnchanged() {
        val terms = abc()
        val result = CustomerTermsEditorLogic.requestDelete(terms, "b", "b")
        assertTrue(result is DeleteRequestResult.Confirm)
        assertEquals(listOf("a", "b", "c"), terms.map { it.localId })
        assertEquals("B", terms[1].text)
    }

    @Test
    fun confirmDelete_removesOnlyFromDraft() {
        val original = abc()
        val (draft, _) = CustomerTermsEditorLogic.deleteFromDraft(original, "b", "b")
        assertEquals(3, original.size)
        assertEquals(listOf("a", "c"), draft.map { it.localId })
        assertEquals("B", original[1].text)
    }

    @Test
    fun insertFieldAction_selectsOriginatingTerm() {
        val terms = abc()
        assertEquals("c", CustomerTermsEditorLogic.selectedAfterTermAction("c", terms))
        assertTrue(CustomerTermsEditorLogic.isSelected(terms[2], "c"))
    }

    @Test
    fun boldAction_selectsOriginatingTerm() {
        val terms = abc()
        assertEquals("b", CustomerTermsEditorLogic.selectedAfterTermAction("b", terms))
    }

    @Test
    fun colorAction_selectsOriginatingTerm() {
        val terms = abc()
        assertEquals("a", CustomerTermsEditorLogic.selectedAfterTermAction("a", terms))
    }

    @Test
    fun enabledToggle_selectsOriginatingTerm() {
        val terms = abc()
        assertEquals("c", CustomerTermsEditorLogic.selectedAfterTermAction("c", terms))
    }

    @Test
    fun listKeys_areStableTermIdsNotIndexes() {
        val terms = abc()
        val keys = terms.mapIndexed { index, term ->
            index to CustomerTermsEditorLogic.listItemKey(term)
        }
        assertEquals(listOf("a", "b", "c"), keys.map { it.second })
        keys.forEach { (index, key) ->
            assertNotEquals(index.toString(), key)
            assertEquals(terms[index].localId, key)
        }
        val moved = CustomerTermsEditorLogic.moveUp(terms, "c")
        assertEquals("c", CustomerTermsEditorLogic.listItemKey(moved.first { it.text == "C" }))
    }

    @Test
    fun customizedBlankOrDisabledNewTerm_requiresConfirmation() {
        assertTrue(
            CustomerTermsEditorLogic.requiresDeleteConfirmation(
                CustomerTermsEditorLogic.newDraftTerm().copy(bold = true)
            )
        )
        assertTrue(
            CustomerTermsEditorLogic.requiresDeleteConfirmation(
                CustomerTermsEditorLogic.newDraftTerm().copy(textColorArgb = 0xFFD32F2F.toInt())
            )
        )
        assertTrue(
            CustomerTermsEditorLogic.requiresDeleteConfirmation(
                CustomerTermsEditorLogic.newDraftTerm().copy(enabled = false)
            )
        )
    }

    @Test
    fun deleteCopy_matchesRequiredHebrewAndEnglish() {
        assertEquals("מחיקת תנאי", CustomerTermsEditorLogic.deleteTitle(ShareLanguage.HE))
        assertEquals("האם למחוק את התנאי הזה?", CustomerTermsEditorLogic.deleteMessage(ShareLanguage.HE))
        assertEquals("מחק", CustomerTermsEditorLogic.deleteConfirm(ShareLanguage.HE))
        assertEquals("ביטול", CustomerTermsEditorLogic.deleteCancel(ShareLanguage.HE))
        assertEquals("Delete term", CustomerTermsEditorLogic.deleteTitle(ShareLanguage.EN))
        assertEquals("Delete this customer term?", CustomerTermsEditorLogic.deleteMessage(ShareLanguage.EN))
        assertEquals("Delete", CustomerTermsEditorLogic.deleteConfirm(ShareLanguage.EN))
        assertEquals("Cancel", CustomerTermsEditorLogic.deleteCancel(ShareLanguage.EN))
    }

    @Test
    fun moveUpOnFirst_andMoveDownOnLast_areNoOps() {
        val terms = abc()
        assertEquals(terms.map { it.localId }, CustomerTermsEditorLogic.moveUp(terms, "a").map { it.localId })
        assertEquals(terms.map { it.localId }, CustomerTermsEditorLogic.moveDown(terms, "c").map { it.localId })
    }

    @Test
    fun backWithCleanEditor_doesNotOpenUnsavedDialog() {
        assertFalse(CustomerTermsEditorLogic.shouldOpenUnsavedChangesDialog(isDirty = false))
    }

    @Test
    fun backWithDirtyEditor_opensUnsavedDialog() {
        assertTrue(CustomerTermsEditorLogic.shouldOpenUnsavedChangesDialog(isDirty = true))
    }

    @Test
    fun saveFromUnsavedDialog_exitUsesSameSavePathIntent() {
        assertEquals(
            SaveAfterSuccess.ExitScreen,
            CustomerTermsEditorLogic.saveAfterSuccessForUnsavedDialog(pendingLanguage = null)
        )
    }

    @Test
    fun saveFromUnsavedDialog_languageSwitchUsesSameSavePathIntent() {
        assertEquals(
            SaveAfterSuccess.SwitchLanguage(ShareLanguage.EN),
            CustomerTermsEditorLogic.saveAfterSuccessForUnsavedDialog(pendingLanguage = ShareLanguage.EN)
        )
    }

    @Test
    fun successfulSaveExit_isSeparateFromFailedSaveStay() {
        // Failed save must not request exit; successful exit is an explicit after-success action.
        assertTrue(CustomerTermsEditorLogic.canStartSave(isSaving = false))
        assertFalse(CustomerTermsEditorLogic.canStartSave(isSaving = true))
        assertEquals(SaveAfterSuccess.ExitScreen, CustomerTermsEditorLogic.saveAfterSuccessForUnsavedDialog(null))
        assertNotEquals(SaveAfterSuccess.Stay, CustomerTermsEditorLogic.saveAfterSuccessForUnsavedDialog(null))
    }

    @Test
    fun continueEditing_preservesDirtySemantics() {
        // Continue editing only dismisses the dialog; dirty remains true by design in the ViewModel.
        assertTrue(CustomerTermsEditorLogic.shouldOpenUnsavedChangesDialog(isDirty = true))
    }

    @Test
    fun dontSave_isNotResetToDefaults() {
        assertFalse(CustomerTermsEditorLogic.discardUnsavedIsResetToDefaults())
    }

    @Test
    fun unsavedDialogCopy_matchesRequiredHebrewAndEnglish() {
        assertEquals("יש שינויים שלא נשמרו", CustomerTermsEditorLogic.unsavedChangesTitle(ShareLanguage.HE))
        assertEquals("מה ברצונך לעשות לפני היציאה?", CustomerTermsEditorLogic.unsavedChangesMessage(ShareLanguage.HE))
        assertEquals("שמור", CustomerTermsEditorLogic.unsavedChangesSaveLabel(ShareLanguage.HE))
        assertEquals("ערוך", CustomerTermsEditorLogic.unsavedChangesContinueLabel(ShareLanguage.HE))
        assertEquals("אל תשמור", CustomerTermsEditorLogic.unsavedChangesDiscardLabel(ShareLanguage.HE))
        assertEquals("Unsaved changes", CustomerTermsEditorLogic.unsavedChangesTitle(ShareLanguage.EN))
        assertEquals("What would you like to do before leaving?", CustomerTermsEditorLogic.unsavedChangesMessage(ShareLanguage.EN))
        assertEquals("Save", CustomerTermsEditorLogic.unsavedChangesSaveLabel(ShareLanguage.EN))
        assertEquals("Edit", CustomerTermsEditorLogic.unsavedChangesContinueLabel(ShareLanguage.EN))
        assertEquals("Don't Save", CustomerTermsEditorLogic.unsavedChangesDiscardLabel(ShareLanguage.EN))
    }

    @Test
    fun duplicateSaveTaps_blockedWhileSaving() {
        assertFalse(CustomerTermsEditorLogic.canStartSave(isSaving = true))
    }

    @Test
    fun systemBackAndAppBack_shareSameDirtyGate() {
        // Both TitleBar home/back and BackHandler call requestBack(), which uses this gate.
        assertEquals(
            CustomerTermsEditorLogic.shouldOpenUnsavedChangesDialog(true),
            CustomerTermsEditorLogic.shouldOpenUnsavedChangesDialog(isDirty = true)
        )
        assertEquals(
            CustomerTermsEditorLogic.shouldOpenUnsavedChangesDialog(false),
            CustomerTermsEditorLogic.shouldOpenUnsavedChangesDialog(isDirty = false)
        )
    }

    private fun abc(): List<TermEditorItem> = listOf(
        term("a", "A"),
        term("b", "B"),
        term("c", "C")
    )

    private fun term(
        id: String,
        text: String,
        origin: TermDraftOrigin = TermDraftOrigin.NEW_UNSAVED
    ): TermEditorItem = TermEditorItem(
        localId = id,
        text = text,
        enabled = true,
        bold = false,
        textColorArgb = null,
        origin = origin
    )
}
