package com.rentacar.app.ui.vm

import com.rentacar.app.share.ShareLanguage
import java.util.UUID

enum class TermDraftOrigin {
    CANONICAL_DEFAULT,
    PERSISTED,
    NEW_UNSAVED
}

object CustomerTermsEditorLogic {
    fun listItemKey(term: TermEditorItem): String = term.localId

    fun selectedAfterTermAction(termId: String, terms: List<TermEditorItem>): String? =
        termId.takeIf { id -> terms.any { it.localId == id } }

    fun isSelected(term: TermEditorItem, selectedTermId: String?): Boolean =
        selectedTermId != null && term.localId == selectedTermId

    fun requiresDeleteConfirmation(term: TermEditorItem): Boolean {
        if (term.origin == TermDraftOrigin.CANONICAL_DEFAULT) return true
        if (term.origin == TermDraftOrigin.PERSISTED) return true
        if (term.text.isNotBlank()) return true
        if (term.bold) return true
        if (term.textColorArgb != null) return true
        if (!term.enabled) return true
        return false
    }

    fun newDraftTerm(): TermEditorItem = TermEditorItem(
        localId = UUID.randomUUID().toString(),
        text = "",
        enabled = true,
        bold = false,
        textColorArgb = null,
        selectionStart = 0,
        selectionEnd = 0,
        origin = TermDraftOrigin.NEW_UNSAVED
    )

    fun moveUp(terms: List<TermEditorItem>, localId: String): List<TermEditorItem> {
        val index = terms.indexOfFirst { it.localId == localId }
        if (index <= 0) return terms
        return terms.toMutableList().apply {
            val item = removeAt(index)
            add(index - 1, item)
        }
    }

    fun moveDown(terms: List<TermEditorItem>, localId: String): List<TermEditorItem> {
        val index = terms.indexOfFirst { it.localId == localId }
        if (index < 0 || index >= terms.lastIndex) return terms
        return terms.toMutableList().apply {
            val item = removeAt(index)
            add(index + 1, item)
        }
    }

    fun selectionAfterDelete(
        terms: List<TermEditorItem>,
        selectedTermId: String?,
        deletedTermId: String
    ): String? {
        if (selectedTermId != deletedTermId) {
            return selectedTermId?.takeIf { id ->
                id != deletedTermId && terms.any { it.localId == id }
            }
        }
        val index = terms.indexOfFirst { it.localId == deletedTermId }
        val remaining = terms.filterNot { it.localId == deletedTermId }
        if (remaining.isEmpty()) return null
        if (index < 0) return remaining.first().localId
        return remaining.getOrNull(index)?.localId ?: remaining.last().localId
    }

    fun deleteFromDraft(
        terms: List<TermEditorItem>,
        selectedTermId: String?,
        deletedTermId: String
    ): Pair<List<TermEditorItem>, String?> {
        val nextSelected = selectionAfterDelete(terms, selectedTermId, deletedTermId)
        return terms.filterNot { it.localId == deletedTermId } to nextSelected
    }

    fun requestDelete(
        terms: List<TermEditorItem>,
        selectedTermId: String?,
        termId: String
    ): DeleteRequestResult {
        val term = terms.firstOrNull { it.localId == termId }
            ?: return DeleteRequestResult.Unchanged
        return if (requiresDeleteConfirmation(term)) {
            DeleteRequestResult.Confirm(termId)
        } else {
            val (nextTerms, nextSelected) = deleteFromDraft(terms, selectedTermId, termId)
            DeleteRequestResult.DeletedImmediately(nextTerms, nextSelected)
        }
    }

    fun deleteTitle(language: ShareLanguage): String = when (language) {
        ShareLanguage.HE -> "מחיקת תנאי"
        ShareLanguage.EN -> "Delete term"
    }

    fun deleteMessage(language: ShareLanguage): String = when (language) {
        ShareLanguage.HE -> "האם למחוק את התנאי הזה?"
        ShareLanguage.EN -> "Delete this customer term?"
    }

    fun deleteConfirm(language: ShareLanguage): String = when (language) {
        ShareLanguage.HE -> "מחק"
        ShareLanguage.EN -> "Delete"
    }

    fun deleteCancel(language: ShareLanguage): String = when (language) {
        ShareLanguage.HE -> "ביטול"
        ShareLanguage.EN -> "Cancel"
    }

    fun shouldOpenUnsavedChangesDialog(isDirty: Boolean): Boolean = isDirty

    fun unsavedChangesTitle(language: ShareLanguage): String = when (language) {
        ShareLanguage.HE -> "יש שינויים שלא נשמרו"
        ShareLanguage.EN -> "Unsaved changes"
    }

    fun unsavedChangesMessage(language: ShareLanguage): String = when (language) {
        ShareLanguage.HE -> "מה ברצונך לעשות לפני היציאה?"
        ShareLanguage.EN -> "What would you like to do before leaving?"
    }

    fun unsavedChangesSaveLabel(language: ShareLanguage): String = when (language) {
        ShareLanguage.HE -> "שמור"
        ShareLanguage.EN -> "Save"
    }

    fun unsavedChangesContinueLabel(language: ShareLanguage): String = when (language) {
        ShareLanguage.HE -> "ערוך"
        ShareLanguage.EN -> "Edit"
    }

    fun unsavedChangesDiscardLabel(language: ShareLanguage): String = when (language) {
        ShareLanguage.HE -> "אל תשמור"
        ShareLanguage.EN -> "Don't Save"
    }

    /**
     * "Don't Save" abandons the current editing session only.
     * It must never be treated as reset-to-defaults.
     */
    fun discardUnsavedIsResetToDefaults(): Boolean = false

    fun saveAfterSuccessForUnsavedDialog(pendingLanguage: ShareLanguage?): SaveAfterSuccess =
        if (pendingLanguage != null) SaveAfterSuccess.SwitchLanguage(pendingLanguage)
        else SaveAfterSuccess.ExitScreen

    fun canStartSave(isSaving: Boolean): Boolean = !isSaving
}

sealed class SaveAfterSuccess {
    data object Stay : SaveAfterSuccess()
    data object ExitScreen : SaveAfterSuccess()
    data class SwitchLanguage(val language: ShareLanguage) : SaveAfterSuccess()
}

sealed class DeleteRequestResult {
    data object Unchanged : DeleteRequestResult()
    data class Confirm(val termId: String) : DeleteRequestResult()
    data class DeletedImmediately(
        val terms: List<TermEditorItem>,
        val selectedTermId: String?
    ) : DeleteRequestResult()
}
