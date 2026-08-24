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
    val selectionEnd: Int = 0
)

data class CustomerTermsEditorState(
    val supplierId: Long,
    val supplierName: String = "",
    val language: ShareLanguage = ShareLanguage.HE,
    val customized: Boolean = false,
    val terms: List<TermEditorItem> = emptyList(),
    val isDirty: Boolean = false,
    val isSaving: Boolean = false,
    val showResetConfirm: Boolean = false,
    val showDiscardConfirm: Boolean = false,
    val pendingLanguage: ShareLanguage? = null,
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
            loadLanguage(pending ?: _state.value.language)
        }
    }

    fun cancelDiscard() {
        _state.update { it.copy(showDiscardConfirm = false, pendingLanguage = null) }
    }

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
        if (_state.value.isDirty) {
            _state.update { it.copy(showDiscardConfirm = true, pendingLanguage = null) }
            return true
        }
        return false
    }

    fun updateTermText(localId: String, text: String, selectionStart: Int, selectionEnd: Int) {
        mutateTerms { terms ->
            terms.map { term ->
                if (term.localId == localId) {
                    term.copy(text = text, selectionStart = selectionStart, selectionEnd = selectionEnd)
                } else term
            }
        }
    }

    fun updateTermEnabled(localId: String, enabled: Boolean) {
        mutateTerms { terms -> terms.map { if (it.localId == localId) it.copy(enabled = enabled) else it } }
    }

    fun updateTermBold(localId: String, bold: Boolean) {
        mutateTerms { terms -> terms.map { if (it.localId == localId) it.copy(bold = bold) else it } }
    }

    fun updateTermColor(localId: String, colorArgb: Int?) {
        mutateTerms { terms -> terms.map { if (it.localId == localId) it.copy(textColorArgb = colorArgb) else it } }
    }

    fun moveUp(localId: String) {
        mutateTerms { terms ->
            val index = terms.indexOfFirst { it.localId == localId }
            if (index <= 0) terms else terms.toMutableList().apply {
                val item = removeAt(index)
                add(index - 1, item)
            }
        }
    }

    fun moveDown(localId: String) {
        mutateTerms { terms ->
            val index = terms.indexOfFirst { it.localId == localId }
            if (index < 0 || index >= terms.lastIndex) terms else terms.toMutableList().apply {
                val item = removeAt(index)
                add(index + 1, item)
            }
        }
    }

    fun deleteTerm(localId: String) {
        mutateTerms { terms -> terms.filterNot { it.localId == localId } }
    }

    fun addTerm() {
        mutateTerms { terms ->
            terms + TermEditorItem(
                localId = UUID.randomUUID().toString(),
                text = "",
                enabled = true,
                bold = false,
                textColorArgb = null
            )
        }
    }

    fun insertVariable(localId: String, variable: TemplateVariable, selectionStart: Int, selectionEnd: Int) {
        mutateTerms { terms ->
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
        val current = _state.value
        val cleaned = current.terms.map { it.copy(text = it.text.trim()) }.filter { it.text.isNotEmpty() }
        if (cleaned.isEmpty() && current.terms.any { it.text.isBlank() } && current.terms.isNotEmpty()) {
            _state.update { it.copy(validationMessage = "לא ניתן לשמור שורות ריקות בלבד. מחקו אותן או הזינו טקסט.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isSaving = true, validationMessage = null) }
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
            loadLanguage(current.language)
            _state.update { it.copy(isSaving = false, saveSucceeded = true) }
        }
    }

    fun consumeSaveSucceeded() {
        _state.update { it.copy(saveSucceeded = false) }
    }

    private fun mutateTerms(transform: (List<TermEditorItem>) -> List<TermEditorItem>) {
        _state.update { current ->
            val nextTerms = transform(current.terms)
            current.copy(
                terms = nextTerms,
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
                isDirty = false,
                validationMessage = null,
                showDiscardConfirm = false,
                pendingLanguage = null
            )
        }
    }

    private fun toEditorItems(effective: EffectiveCustomerTerms): List<TermEditorItem> =
        effective.terms.map { term ->
            TermEditorItem(
                localId = UUID.randomUUID().toString(),
                text = term.textTemplate,
                enabled = term.enabled,
                bold = term.bold,
                textColorArgb = term.textColorArgb
            )
        }

    private fun fingerprint(terms: List<TermEditorItem>): String =
        terms.joinToString("|") { "${it.text}\u0001${it.enabled}\u0001${it.bold}\u0001${it.textColorArgb}" }
}
