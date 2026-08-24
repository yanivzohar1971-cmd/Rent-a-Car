package com.rentacar.app.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.CustomerTermsRepository
import com.rentacar.app.data.SupplierRepository
import com.rentacar.app.data.auth.CurrentUserProvider
import com.rentacar.app.share.CustomerTermTemplate
import com.rentacar.app.share.EffectiveCustomerTerms
import com.rentacar.app.share.ShareLanguage
import com.rentacar.app.share.TemplateResolver
import com.rentacar.app.share.TemplateVariable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

data class TermEditorItem(
    val localId: String,
    val text: String,
    val enabled: Boolean,
    val bold: Boolean,
    val textColorArgb: Int?,
    val selectionStart: Int = 0,
    val selectionEnd: Int = 0,
    val origin: TermDraftOrigin = TermDraftOrigin.NEW_UNSAVED
)

data class CustomerTermsEditorState(
    val supplierId: Long,
    val supplierName: String = "",
    val language: ShareLanguage = ShareLanguage.HE,
    val customized: Boolean = false,
    val terms: List<TermEditorItem> = emptyList(),
    val selectedTermId: String? = null,
    val pendingDeleteTermId: String? = null,
    val pendingFocusTermId: String? = null,
    val isDirty: Boolean = false,
    val isSaving: Boolean = false,
    val showResetConfirm: Boolean = false,
    val showDiscardConfirm: Boolean = false,
    val pendingLanguage: ShareLanguage? = null,
    val navigateBackAfterSave: Boolean = false,
    val validationMessage: String? = null,
    val saveSucceeded: Boolean = false
)

class SupplierCustomerTermsViewModel(
    private val supplierId: Long,
    private val supplierRepository: SupplierRepository,
    private val termsRepository: CustomerTermsRepository
) : ViewModel() {

    private val _state = MutableStateFlow(CustomerTermsEditorState(supplierId = supplierId))
    val state: StateFlow<CustomerTermsEditorState> = _state.asStateFlow()

    private var savedFingerprint: String = ""

    init {
        viewModelScope.launch {
            val uid = CurrentUserProvider.requireCurrentUid()
            val supplier = supplierRepository.getByIdForUser(supplierId, uid).first()
            _state.update { it.copy(supplierName = supplier?.name.orEmpty()) }
            loadLanguage(ShareLanguage.HE)
        }
    }

    fun selectLanguage(language: ShareLanguage) {
        val current = _state.value
        if (language == current.language) return
        if (current.isDirty) {
            _state.update { it.copy(pendingLanguage = language, showDiscardConfirm = true) }
        } else {
            viewModelScope.launch { loadLanguage(language) }
        }
    }

    fun confirmDiscard() {
        val pending = _state.value.pendingLanguage
        _state.update { it.copy(showDiscardConfirm = false, pendingLanguage = null) }
        viewModelScope.launch {
            // Reload persisted/effective terms for the target language — draft only, not reset-to-defaults.
            loadLanguage(pending ?: _state.value.language)
        }
    }

    fun cancelDiscard() {
        _state.update { it.copy(showDiscardConfirm = false, pendingLanguage = null) }
    }

    /** Continue editing: dismiss unsaved dialog and keep the dirty draft. */
    fun continueEditing() = cancelDiscard()

    /**
     * Don't Save: abandon the current editing session only.
     * Does not reset supplier terms to canonical defaults.
     */
    fun discardUnsavedChanges() = confirmDiscard()

    fun requestReset() {
        _state.update { it.copy(showResetConfirm = true) }
    }

    fun cancelReset() {
        _state.update { it.copy(showResetConfirm = false) }
    }

    fun confirmReset() {
        viewModelScope.launch {
            termsRepository.resetToDefaults(supplierId, _state.value.language)
            _state.update { it.copy(showResetConfirm = false) }
            loadLanguage(_state.value.language)
        }
    }

    fun requestBack(): Boolean {
        if (CustomerTermsEditorLogic.shouldOpenUnsavedChangesDialog(_state.value.isDirty)) {
            _state.update { it.copy(showDiscardConfirm = true, pendingLanguage = null) }
            return true
        }
        return false
    }

    /** Save from the unsaved-changes dialog, then exit or switch language. */
    fun saveFromUnsavedDialog() {
        val after = CustomerTermsEditorLogic.saveAfterSuccessForUnsavedDialog(_state.value.pendingLanguage)
        save(afterSuccess = after)
    }

    fun selectTerm(localId: String) {
        _state.update { current ->
            if (current.terms.none { it.localId == localId }) current
            else current.copy(selectedTermId = localId)
        }
    }

    fun consumePendingFocus() {
        _state.update { it.copy(pendingFocusTermId = null) }
    }

    fun updateTermText(localId: String, text: String, selectionStart: Int, selectionEnd: Int) {
        mutateTerms(selectId = localId) { terms ->
            terms.map { term ->
                if (term.localId == localId) {
                    term.copy(text = text, selectionStart = selectionStart, selectionEnd = selectionEnd)
                } else term
            }
        }
    }

    fun updateTermEnabled(localId: String, enabled: Boolean) {
        mutateTerms(selectId = localId) { terms ->
            terms.map { if (it.localId == localId) it.copy(enabled = enabled) else it }
        }
    }

    fun updateTermBold(localId: String, bold: Boolean) {
        mutateTerms(selectId = localId) { terms ->
            terms.map { if (it.localId == localId) it.copy(bold = bold) else it }
        }
    }

    fun updateTermColor(localId: String, colorArgb: Int?) {
        mutateTerms(selectId = localId) { terms ->
            terms.map { if (it.localId == localId) it.copy(textColorArgb = colorArgb) else it }
        }
    }

    fun moveUp(localId: String) {
        mutateTerms(selectId = localId) { CustomerTermsEditorLogic.moveUp(it, localId) }
    }

    fun moveDown(localId: String) {
        mutateTerms(selectId = localId) { CustomerTermsEditorLogic.moveDown(it, localId) }
    }

    fun requestDelete(localId: String) {
        _state.update { current ->
            when (val result = CustomerTermsEditorLogic.requestDelete(current.terms, current.selectedTermId, localId)) {
                DeleteRequestResult.Unchanged -> current.copy(selectedTermId = current.selectedTermId)
                is DeleteRequestResult.Confirm -> current.copy(
                    selectedTermId = localId,
                    pendingDeleteTermId = result.termId
                )
                is DeleteRequestResult.DeletedImmediately -> current.copy(
                    terms = result.terms,
                    selectedTermId = result.selectedTermId,
                    pendingDeleteTermId = null,
                    isDirty = fingerprint(result.terms) != savedFingerprint,
                    validationMessage = null
                )
            }
        }
    }

    fun cancelDelete() {
        _state.update { it.copy(pendingDeleteTermId = null) }
    }

    fun confirmDelete() {
        val deletedId = _state.value.pendingDeleteTermId ?: return
        _state.update { current ->
            val (nextTerms, nextSelected) = CustomerTermsEditorLogic.deleteFromDraft(
                current.terms,
                current.selectedTermId,
                deletedId
            )
            current.copy(
                terms = nextTerms,
                selectedTermId = nextSelected,
                pendingDeleteTermId = null,
                isDirty = fingerprint(nextTerms) != savedFingerprint,
                validationMessage = null
            )
        }
    }

    fun addTerm() {
        val created = CustomerTermsEditorLogic.newDraftTerm()
        mutateTerms(selectId = created.localId, focusId = created.localId) { terms -> terms + created }
    }

    fun insertVariable(localId: String, variable: TemplateVariable, selectionStart: Int, selectionEnd: Int) {
        mutateTerms(selectId = localId) { terms ->
            terms.map { term ->
                if (term.localId != localId) term
                else {
                    val inserted = TemplateResolver.insertToken(
                        term.text,
                        variable.token,
                        selectionStart,
                        selectionEnd
                    )
                    term.copy(
                        text = inserted.text,
                        selectionStart = inserted.cursor,
                        selectionEnd = inserted.cursor
                    )
                }
            }
        }
    }

    fun save() {
        save(afterSuccess = SaveAfterSuccess.Stay)
    }

    private fun save(afterSuccess: SaveAfterSuccess) {
        if (!CustomerTermsEditorLogic.canStartSave(_state.value.isSaving)) return
        val current = _state.value
        val cleaned = current.terms.map { it.copy(text = it.text.trim()) }.filter { it.text.isNotEmpty() }
        if (cleaned.isEmpty() && current.terms.any { it.text.isBlank() } && current.terms.isNotEmpty()) {
            _state.update {
                it.copy(
                    validationMessage = "לא ניתן לשמור שורות ריקות בלבד. מחקו אותן או הזינו טקסט.",
                    showDiscardConfirm = false,
                    isSaving = false
                )
            }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isSaving = true, validationMessage = null) }
            try {
                termsRepository.saveTerms(
                    supplierId = supplierId,
                    language = current.language,
                    terms = cleaned.mapIndexed { index, item ->
                        CustomerTermTemplate(
                            textTemplate = item.text,
                            enabled = item.enabled,
                            bold = item.bold,
                            textColorArgb = item.textColorArgb,
                            sortOrder = index
                        )
                    }
                )
                when (afterSuccess) {
                    SaveAfterSuccess.Stay -> {
                        loadLanguage(current.language)
                        _state.update {
                            it.copy(
                                isSaving = false,
                                saveSucceeded = true,
                                showDiscardConfirm = false,
                                navigateBackAfterSave = false
                            )
                        }
                    }
                    SaveAfterSuccess.ExitScreen -> {
                        loadLanguage(current.language)
                        _state.update {
                            it.copy(
                                isSaving = false,
                                saveSucceeded = true,
                                showDiscardConfirm = false,
                                pendingLanguage = null,
                                navigateBackAfterSave = true
                            )
                        }
                    }
                    is SaveAfterSuccess.SwitchLanguage -> {
                        loadLanguage(afterSuccess.language)
                        _state.update {
                            it.copy(
                                isSaving = false,
                                saveSucceeded = true,
                                showDiscardConfirm = false,
                                pendingLanguage = null,
                                navigateBackAfterSave = false
                            )
                        }
                    }
                }
            } catch (t: Throwable) {
                _state.update {
                    it.copy(
                        isSaving = false,
                        showDiscardConfirm = false,
                        navigateBackAfterSave = false,
                        validationMessage = t.message?.takeIf { msg -> msg.isNotBlank() }
                            ?: "השמירה נכשלה. נסו שוב."
                    )
                }
            }
        }
    }

    fun consumeSaveSucceeded() {
        _state.update { it.copy(saveSucceeded = false, navigateBackAfterSave = false) }
    }

    private fun mutateTerms(
        selectId: String? = null,
        focusId: String? = null,
        transform: (List<TermEditorItem>) -> List<TermEditorItem>
    ) {
        _state.update { current ->
            val nextTerms = transform(current.terms)
            val nextSelected = (selectId ?: current.selectedTermId)?.takeIf { id ->
                nextTerms.any { it.localId == id }
            }
            current.copy(
                terms = nextTerms,
                selectedTermId = nextSelected,
                pendingFocusTermId = focusId ?: current.pendingFocusTermId,
                isDirty = fingerprint(nextTerms) != savedFingerprint,
                validationMessage = null
            )
        }
    }

    private suspend fun loadLanguage(language: ShareLanguage) {
        val effective = termsRepository.getEffectiveTerms(supplierId, language)
        val items = toEditorItems(effective)
        savedFingerprint = fingerprint(items)
        _state.update {
            it.copy(
                language = language,
                customized = effective.customized,
                terms = items,
                selectedTermId = null,
                pendingDeleteTermId = null,
                pendingFocusTermId = null,
                isDirty = false,
                validationMessage = null,
                showDiscardConfirm = false,
                pendingLanguage = null
            )
        }
    }

    private fun toEditorItems(effective: EffectiveCustomerTerms): List<TermEditorItem> {
        val origin = if (effective.customized) TermDraftOrigin.PERSISTED else TermDraftOrigin.CANONICAL_DEFAULT
        return effective.terms.map { term ->
            TermEditorItem(
                localId = UUID.randomUUID().toString(),
                text = term.textTemplate,
                enabled = term.enabled,
                bold = term.bold,
                textColorArgb = term.textColorArgb,
                origin = origin
            )
        }
    }

    private fun fingerprint(terms: List<TermEditorItem>): String =
        terms.joinToString("|") { "${it.text}\u0001${it.enabled}\u0001${it.bold}\u0001${it.textColorArgb}" }
}
