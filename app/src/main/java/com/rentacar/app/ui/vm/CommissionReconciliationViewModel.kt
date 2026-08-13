package com.rentacar.app.ui.vm

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.commission.CommissionReconciliationApprovalService
import com.rentacar.app.commission.CommissionReconciliationRepository
import com.rentacar.app.commission.CommissionReconciliationService
import com.rentacar.app.commission.CommissionReportParserCodes
import com.rentacar.app.commission.domain.CommissionReportImportStatus
import com.rentacar.app.commission.domain.CommissionReportParseResult
import com.rentacar.app.commission.domain.CommissionLifecycleClassification
import com.rentacar.app.commission.domain.ReconciliationMatchStatus
import com.rentacar.app.commission.money.MoneyDecimal
import com.rentacar.app.commission.parser.CommissionReportImportDispatcher
import com.rentacar.app.commission.presentation.CommissionComparisonMapper
import com.rentacar.app.commission.presentation.CommissionComparisonPresentation
import com.rentacar.app.commission.presentation.PaymentDifferenceDirection
import com.rentacar.app.commission.presentation.PaymentDifferenceTotals
import com.rentacar.app.data.CommissionReconciliationItem
import com.rentacar.app.data.Supplier
import com.rentacar.app.data.SupplierCommissionReportImport
import com.rentacar.app.data.auth.CurrentUserProvider
import com.rentacar.app.di.DatabaseModule
import com.rentacar.app.domain.CommissionBusinessDates
import com.rentacar.app.reports.CommissionReconciliationExcelExporter
import com.rentacar.app.share.ShareService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.YearMonth

enum class CommissionReconStep {
    SETUP,
    PREVIEW,
    DASHBOARD,
    HISTORY
}

/** Explicit email-import UI operation — do not overload generic [CommissionReconciliationUiState.loading]. */
enum class EmailImportOperation {
    IDLE,
    SEARCHING_MAILBOX,
    PREVIEWING_CANDIDATE
}

enum class CommissionReconFilter {
    ALL,
    MATCHING,
    UNDERPAID,
    OVERPAID,
    SUPPLIER_ONLY,
    APPLICATION_ONLY,
    OPEN_30,
    FINAL_CLOSURE,
    NEEDS_REVIEW,
    HISTORICAL
}

enum class CommissionReconSort {
    LARGEST_ABS_DIFF,
    ORDER_NUMBER,
    CUSTOMER_NAME
}

data class CommissionReconciliationUiState(
    val step: CommissionReconStep = CommissionReconStep.SETUP,
    val supplier: Supplier? = null,
    val parserLabel: String? = null,
    val reportYearMonth: YearMonth = YearMonth.of(2026, 7),
    val departureCutoffLabel: String = "",
    val sourceFileName: String? = null,
    val fileUri: Uri? = null,
    val isDuplicateFile: Boolean = false,
    val loading: Boolean = false,
    val exporting: Boolean = false,
    val approving: Boolean = false,
    val errorMessage: String? = null,
    val warnings: List<String> = emptyList(),
    val parseResult: CommissionReportParseResult? = null,
    val kpis: CommissionReconciliationService.ReconciliationKpis? = null,
    val items: List<CommissionReconciliationItem> = emptyList(),
    val historicalItems: List<CommissionReconciliationItem> = emptyList(),
    val filter: CommissionReconFilter = CommissionReconFilter.ALL,
    val sort: CommissionReconSort = CommissionReconSort.LARGEST_ABS_DIFF,
    val selectedItemIds: Set<Long> = emptySet(),
    val importId: Long? = null,
    val importStatus: String? = null,
    val history: List<SupplierCommissionReportImport> = emptyList(),
    val totalsBlocked: Boolean = false,
    val infoMessage: String? = null,
    val statsExpanded: Boolean = false,
    val reservationsById: Map<Long, com.rentacar.app.data.Reservation> = emptyMap(),
    val priceListByReservationId: Map<Long, Pair<com.rentacar.app.data.SupplierPriceListItem?, Boolean>> = emptyMap(),
    // Email import
    val emailImportAvailable: Boolean = false,
    val emailReports: List<com.rentacar.app.emailimport.EmailReportListItem> = emptyList(),
    val emailDiagnostics: com.rentacar.app.emailimport.EmailImportDiagnostics? = null,
    val emailSourceActive: Boolean = false,
    val emailMatchedSender: String? = null,
    val emailSenderMatchType: String? = null,
    val emailContentHash: String? = null,
    val emailPreviewBundle: com.rentacar.app.emailimport.EmailImportPreviewBundle? = null,
    val showEmailDiagnostics: Boolean = false,
    val ambiguousXlsxNames: List<String> = emptyList(),
    /** Candidate that produced [ambiguousXlsxNames] — not emailReports.firstOrNull(). */
    val ambiguousXlsxCandidateId: String? = null,
    val emailOperation: EmailImportOperation = EmailImportOperation.IDLE,
    /** Stable candidate key while [emailOperation] is PREVIEWING_CANDIDATE. */
    val previewingEmailCandidateId: String? = null,
    val previewCandidateErrorId: String? = null,
    val previewCandidateErrorMessage: String? = null
)

sealed interface CommissionReconciliationUiEvent {
    data class ShareExcel(
        val uri: Uri,
        val fileName: String,
        val mimeType: String = ShareService.MIME_XLSX
    ) : CommissionReconciliationUiEvent

    data class ShowError(val message: String) : CommissionReconciliationUiEvent

    data class ShowInfo(val message: String) : CommissionReconciliationUiEvent
}

/** Pure filter helper over presentation groups — does not alter persisted amounts. */
fun filterPresentations(
    presentations: List<CommissionComparisonPresentation>,
    filter: CommissionReconFilter
): List<CommissionComparisonPresentation> {
    return when (filter) {
        CommissionReconFilter.ALL -> presentations
        CommissionReconFilter.MATCHING ->
            presentations.filter { it.direction == PaymentDifferenceDirection.MATCH }
        CommissionReconFilter.UNDERPAID ->
            presentations.filter { it.direction == PaymentDifferenceDirection.UNDERPAID }
        CommissionReconFilter.OVERPAID ->
            presentations.filter { it.direction == PaymentDifferenceDirection.OVERPAID }
        CommissionReconFilter.SUPPLIER_ONLY ->
            presentations.filter {
                it.primaryItem.matchStatus == ReconciliationMatchStatus.SUPPLIER_ONLY.name
            }
        CommissionReconFilter.APPLICATION_ONLY ->
            presentations.filter {
                it.primaryItem.matchStatus == ReconciliationMatchStatus.APPLICATION_ONLY.name
            }
        CommissionReconFilter.OPEN_30 ->
            presentations.filter {
                it.primaryItem.lifecycleClassification ==
                    CommissionLifecycleClassification.OPEN_MONTHLY_30_DAY_CYCLE.name
            }
        CommissionReconFilter.FINAL_CLOSURE ->
            presentations.filter {
                it.primaryItem.lifecycleClassification ==
                    CommissionLifecycleClassification.FINAL_MONTHLY_SETTLEMENT.name
            }
        CommissionReconFilter.NEEDS_REVIEW ->
            presentations.filter {
                it.direction == PaymentDifferenceDirection.NOT_COMPARABLE &&
                    it.primaryItem.matchStatus !in setOf(
                        ReconciliationMatchStatus.SUPPLIER_ONLY.name,
                        ReconciliationMatchStatus.APPLICATION_ONLY.name,
                        ReconciliationMatchStatus.ALREADY_SETTLED.name
                    ) || it.financialMappingUnresolved
            }
        CommissionReconFilter.HISTORICAL ->
            presentations.filter {
                it.primaryItem.lifecycleClassification ==
                    CommissionLifecycleClassification.HISTORICAL_BASELINE_CANDIDATE.name
            }
    }
}

fun sortPresentations(
    presentations: List<CommissionComparisonPresentation>,
    sort: CommissionReconSort
): List<CommissionComparisonPresentation> {
    return when (sort) {
        CommissionReconSort.LARGEST_ABS_DIFF -> presentations.sortedWith(
            compareByDescending<CommissionComparisonPresentation> {
                it.absoluteDifference?.value ?: java.math.BigDecimal.ZERO
            }.thenByDescending {
                it.direction == PaymentDifferenceDirection.NOT_COMPARABLE
            }.thenBy { it.supplierOrderNumber.orEmpty() }
        )
        CommissionReconSort.ORDER_NUMBER ->
            presentations.sortedBy { it.supplierOrderNumber.orEmpty() }
        CommissionReconSort.CUSTOMER_NAME ->
            presentations.sortedBy { it.customerName.orEmpty() }
    }
}

/** Legacy raw-item filter retained for existing unit tests of match-status subsets. */
fun filterReconciliationItems(
    items: List<CommissionReconciliationItem>,
    historicalItems: List<CommissionReconciliationItem>,
    filter: CommissionReconFilter
): List<CommissionReconciliationItem> {
    val presentations = CommissionComparisonMapper.buildPresentations(items + historicalItems)
    val filteredKeys = filterPresentations(presentations, filter).map { it.groupKey }.toSet()
    val all = items + historicalItems
    return all.filter { CommissionComparisonMapper.groupKey(it) in filteredKeys }
}

class CommissionReconciliationViewModel(
    application: Application,
    private val supplierId: Long
) : AndroidViewModel(application) {

    private val db = DatabaseModule.provideDatabase(application)
    private val dispatcher = CommissionReportImportDispatcher(
        context = application,
        configDao = db.supplierCommissionImportConfigDao(),
        importDao = db.supplierCommissionReportImportDao()
    )
    private val repository = CommissionReconciliationRepository(db, dispatcher)
    private val approvalService = CommissionReconciliationApprovalService(db)
    private val mailboxStore = com.rentacar.app.mailbox.SecureMailboxCredentialsStore(application)
    private val emailImportService = com.rentacar.app.emailimport.EmailCommissionImportService(
        context = application,
        credentialsStore = mailboxStore,
        dispatcher = dispatcher,
        fingerprintDao = db.emailCommissionReportFingerprintDao()
    )

    private val _state = MutableStateFlow(CommissionReconciliationUiState())
    val state: StateFlow<CommissionReconciliationUiState> = _state.asStateFlow()

    private val _events = Channel<CommissionReconciliationUiEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    init {
        refreshSetup()
        observeHistory()
    }

    fun refreshSetup() {
        viewModelScope.launch(Dispatchers.IO) {
            val uid = CurrentUserProvider.requireCurrentUid()
            val supplier = repository.loadSupplier(supplierId, uid)
            val config = repository.getActiveConfig(supplierId, uid)
            val ym = _state.value.reportYearMonth
            val cutoff = CommissionReconciliationService.cutoffForReportMonth(ym)
            val emailConfigured = !supplier?.commissionReportEmail.isNullOrBlank() &&
                !supplier?.commissionReportFormat.isNullOrBlank()
            _state.update {
                it.copy(
                    supplier = supplier,
                    parserLabel = config?.let {
                        CommissionReportParserCodes.labelFor(it.parserCode, it.parserVersion)
                    },
                    departureCutoffLabel = CommissionReconciliationService.formatCutoffLabel(cutoff),
                    emailImportAvailable = emailConfigured,
                    errorMessage = null
                )
            }
        }
    }

    private fun observeHistory() {
        viewModelScope.launch {
            val uid = CurrentUserProvider.requireCurrentUid()
            repository.observeImports(supplierId, uid).collect { list ->
                _state.update { it.copy(history = list) }
            }
        }
    }

    fun setReportYearMonth(yearMonth: YearMonth) {
        val cutoff = CommissionReconciliationService.cutoffForReportMonth(yearMonth)
        _state.update {
            it.copy(
                reportYearMonth = yearMonth,
                departureCutoffLabel = CommissionReconciliationService.formatCutoffLabel(cutoff)
            )
        }
    }

    fun onFilePicked(uri: Uri, displayName: String) {
        _state.update {
            it.copy(
                fileUri = uri,
                sourceFileName = displayName,
                errorMessage = null,
                emailSourceActive = false,
                emailReports = emptyList(),
                emailPreviewBundle = null,
                ambiguousXlsxNames = emptyList(),
                ambiguousXlsxCandidateId = null
            )
        }
    }

    fun runPreview() {
        viewModelScope.launch {
            val current = _state.value
            val uri = current.fileUri
            val fileName = current.sourceFileName
            if (uri == null || fileName == null) {
                _state.update { it.copy(errorMessage = "יש לבחור קובץ דוח עמלות") }
                return@launch
            }
            if (current.parserLabel == null) {
                _state.update {
                    it.copy(errorMessage = "לא הוגדרה תבנית דוח עמלות. יש להגדיר תבנית דוח עמלות לפני הייבוא.")
                }
                return@launch
            }
            _state.update { it.copy(loading = true, errorMessage = null) }
            val result = withContext(Dispatchers.IO) {
                dispatcher.previewImport(
                    supplierId = supplierId,
                    reportYear = current.reportYearMonth.year,
                    reportMonth = current.reportYearMonth.monthValue,
                    fileUri = uri,
                    sourceFileName = fileName
                )
            }
            if (!result.success || result.parseResult == null) {
                _state.update {
                    it.copy(
                        loading = false,
                        errorMessage = result.errors.joinToString("\n").ifBlank { "פענוח נכשל" },
                        warnings = result.warnings,
                        isDuplicateFile = result.isDuplicateFile,
                        parseResult = result.parseResult,
                        totalsBlocked = result.parseResult?.totalsMatch == false,
                        step = if (result.parseResult != null) CommissionReconStep.PREVIEW else it.step
                    )
                }
                return@launch
            }

            val parse = result.parseResult
            val uid = CurrentUserProvider.requireCurrentUid()
            val supplier = current.supplier
                ?: repository.loadSupplier(supplierId, uid)
                ?: run {
                    _state.update { it.copy(loading = false, errorMessage = "ספק לא נמצא") }
                    return@launch
                }
            val cutoff = CommissionReconciliationService.cutoffForReportMonth(current.reportYearMonth)
            val input = withContext(Dispatchers.IO) {
                repository.buildReconciliationInput(
                    supplier = supplier,
                    reportYearMonth = current.reportYearMonth,
                    departureCutoff = cutoff,
                    groups = parse.normalizedGroups,
                    userUid = uid
                )
            }
            val recon = CommissionReconciliationService.reconcile(input)
            val enrichment = withContext(Dispatchers.IO) {
                loadPricingEnrichment(recon.items + recon.historicalCandidates, uid)
            }
            _state.update {
                it.copy(
                    loading = false,
                    parseResult = parse,
                    kpis = recon.kpis,
                    items = recon.items,
                    historicalItems = recon.historicalCandidates,
                    isDuplicateFile = result.isDuplicateFile,
                    warnings = result.warnings,
                    totalsBlocked = !parse.totalsMatch,
                    step = CommissionReconStep.PREVIEW,
                    errorMessage = if (!parse.totalsMatch) {
                        "סיכומי הקובץ אינם תואמים — לא ניתן לאשר. ניתן לצפות בתצוגה מקדימה לאבחון."
                    } else null,
                    reservationsById = enrichment.first,
                    priceListByReservationId = enrichment.second
                )
            }
        }
    }

    fun continueToDashboard() {
        _state.update { it.copy(step = CommissionReconStep.DASHBOARD) }
    }

    fun setFilter(filter: CommissionReconFilter) {
        _state.update { it.copy(filter = filter) }
    }

    fun setSort(sort: CommissionReconSort) {
        _state.update { it.copy(sort = sort) }
    }

    fun toggleStatsExpanded() {
        _state.update { it.copy(statsExpanded = !it.statsExpanded) }
    }

    fun toggleSelect(itemId: Long) {
        _state.update { state ->
            val next = state.selectedItemIds.toMutableSet()
            if (!next.add(itemId)) next.remove(itemId)
            state.copy(selectedItemIds = next)
        }
    }

    fun toggleSelectGroup(presentation: CommissionComparisonPresentation) {
        _state.update { state ->
            val next = state.selectedItemIds.toMutableSet()
            val ids = presentation.selectableItemIds
            if (ids.isEmpty()) return@update state
            if (ids.all { it in next }) {
                next.removeAll(ids)
            } else {
                // Only allow selection when financially safe / resolved
                if (presentation.financialMappingUnresolved) return@update state
                if (presentation.direction == PaymentDifferenceDirection.UNDERPAID ||
                    presentation.direction == PaymentDifferenceDirection.OVERPAID
                ) {
                    return@update state
                }
                next.addAll(ids)
            }
            state.copy(selectedItemIds = next)
        }
    }

    fun allPresentations(): List<CommissionComparisonPresentation> {
        val s = _state.value
        return CommissionComparisonMapper.buildPresentations(
            items = s.items + s.historicalItems,
            reservationsById = s.reservationsById,
            priceListByReservationId = s.priceListByReservationId
        )
    }

    fun filteredPresentations(): List<CommissionComparisonPresentation> {
        val s = _state.value
        val presentations = allPresentations()
        return sortPresentations(filterPresentations(presentations, s.filter), s.sort)
    }

    fun paymentTotals(): PaymentDifferenceTotals =
        CommissionComparisonMapper.computeTotals(allPresentations())

    fun filteredItems(): List<CommissionReconciliationItem> {
        val s = _state.value
        return filterReconciliationItems(s.items, s.historicalItems, s.filter)
    }

    fun filterCounts(): Map<CommissionReconFilter, Int> {
        val presentations = allPresentations()
        return CommissionReconFilter.entries.associateWith { filter ->
            filterPresentations(presentations, filter).size
        }
    }

    fun hasSafeSelection(): Boolean {
        val s = _state.value
        if (s.totalsBlocked || s.approving || s.exporting) return false
        val selected = (s.items + s.historicalItems).filter { it.id != 0L && it.id in s.selectedItemIds }
        if (selected.isEmpty()) return false
        val presentations = allPresentations()
        val unresolvedKeys = presentations
            .filter { it.financialMappingUnresolved ||
                it.direction == PaymentDifferenceDirection.UNDERPAID ||
                it.direction == PaymentDifferenceDirection.OVERPAID }
            .flatMap { it.selectableItemIds }
            .toSet()
        if (selected.any { it.id in unresolvedKeys }) return false
        return selected.any { CommissionReconciliationApprovalService.isSafeForApproval(it) }
    }

    fun saveDraft() {
        viewModelScope.launch {
            val s = _state.value
            val parse = s.parseResult ?: return@launch
            val supplier = s.supplier ?: return@launch
            val fileHash = resolveContentHash(s) ?: return@launch
            val sourceName = s.sourceFileName ?: return@launch
            _state.update { it.copy(loading = true) }
            withContext(Dispatchers.IO) {
                val uid = CurrentUserProvider.requireCurrentUid()
                val cutoff = CommissionReconciliationService.cutoffForReportMonth(s.reportYearMonth)
                val recon = CommissionReconciliationService.Result(
                    items = s.items,
                    historicalCandidates = s.historicalItems,
                    kpis = s.kpis ?: CommissionReconciliationService.ReconciliationKpis(
                        supplierCommissionTotal = MoneyDecimal.ZERO,
                        internalCommissionTotal = MoneyDecimal.ZERO,
                        deviationTotal = MoneyDecimal.ZERO,
                        fullMatches = 0,
                        amountMismatches = 0,
                        daysMismatches = 0,
                        supplierOnly = 0,
                        applicationOnly = 0,
                        alreadySettled = 0,
                        openMonthly30 = 0,
                        finalClosures = 0,
                        historicalCandidates = 0,
                        needsReview = 0
                    )
                )
                val id = repository.persistDraft(
                    supplier = supplier,
                    reportYearMonth = s.reportYearMonth,
                    departureCutoff = cutoff,
                    sourceFileName = sourceName,
                    fileHash = fileHash,
                    parseResult = parse,
                    reconciliation = recon,
                    userUid = uid
                )
                if (s.emailSourceActive && s.emailPreviewBundle != null && !s.emailContentHash.isNullOrBlank()) {
                    try {
                        emailImportService.recordSuccessfulImportFingerprint(supplier, s.emailPreviewBundle)
                    } catch (_: Exception) {
                    }
                }
                _state.update {
                    it.copy(
                        loading = false,
                        importId = id,
                        importStatus = CommissionReportImportStatus.DRAFT.name,
                        infoMessage = "טיוטה נשמרה",
                        items = it.items.map { item -> item.copy(importId = id) },
                        historicalItems = it.historicalItems.map { item -> item.copy(importId = id) }
                    )
                }
            }
        }
    }

    fun approveSelectedSafe() {
        viewModelScope.launch {
            val s = _state.value
            if (s.approving || s.exporting) return@launch
            if (s.totalsBlocked) {
                _state.update { it.copy(errorMessage = "לא ניתן לאשר — סיכומי הקובץ אינם תואמים") }
                _events.send(CommissionReconciliationUiEvent.ShowError("לא ניתן לאשר — סיכומי הקובץ אינם תואמים"))
                return@launch
            }
            if (!hasSafeSelection() && s.selectedItemIds.isEmpty()) {
                // Allow bulk of all safe items when nothing selected? Spec: disable when no safe selection.
                // Keep previous behavior of bulk-all-safe when empty selection after persist.
            }
            var importId = s.importId
            if (importId == null) {
                saveDraftAndAwait()
                importId = _state.value.importId
            }
            if (importId == null) {
                _state.update { it.copy(errorMessage = "יש לשמור טיוטה לפני אישור") }
                _events.send(CommissionReconciliationUiEvent.ShowError("יש לשמור טיוטה לפני אישור"))
                return@launch
            }
            _state.update { it.copy(approving = true, loading = true, errorMessage = null) }
            val uid = CurrentUserProvider.requireCurrentUid()
            val persisted = withContext(Dispatchers.IO) {
                repository.loadPersistedImport(importId, uid)
            }
            val safeIds = if (s.selectedItemIds.isNotEmpty() && persisted != null) {
                persisted.items.filter { it.id in s.selectedItemIds && approvalService.isSafeForApproval(it) }
                    .map { it.id }
            } else {
                persisted?.items?.let { approvalService.filterSafeBulk(it).map { item -> item.id } }.orEmpty()
            }
            if (safeIds.isEmpty()) {
                _state.update {
                    it.copy(loading = false, approving = false, errorMessage = "אין פריטים בטוחים לאישור")
                }
                _events.send(CommissionReconciliationUiEvent.ShowError("אין פריטים בטוחים לאישור"))
                return@launch
            }
            val result = withContext(Dispatchers.IO) {
                approvalService.approveSelected(
                    CommissionReconciliationApprovalService.ApprovalRequest(
                        itemIds = safeIds,
                        importId = importId,
                        userUid = uid
                    )
                )
            }
            if (result.success || result.approvedCount > 0) {
                withContext(Dispatchers.IO) { repository.markApproved(importId, uid) }
            }
            reloadImport(importId)
            val info = "אושרו ${result.approvedCount}, דולגו ${result.skippedCount}"
            _state.update {
                it.copy(
                    loading = false,
                    approving = false,
                    infoMessage = info,
                    errorMessage = result.errors.takeIf { e -> e.isNotEmpty() }?.joinToString("\n")
                )
            }
            if (result.errors.isNotEmpty()) {
                _events.send(CommissionReconciliationUiEvent.ShowError(result.errors.joinToString("\n")))
            } else {
                _events.send(CommissionReconciliationUiEvent.ShowInfo(info))
            }
        }
    }

    private suspend fun saveDraftAndAwait() {
        // Trigger saveDraft path synchronously for approve flow
        val s = _state.value
        val parse = s.parseResult ?: return
        val supplier = s.supplier ?: return
        val fileHash = resolveContentHash(s) ?: return
        val name = s.sourceFileName ?: return
        val uid = CurrentUserProvider.requireCurrentUid()
        withContext(Dispatchers.IO) {
            val cutoff = CommissionReconciliationService.cutoffForReportMonth(s.reportYearMonth)
            val recon = CommissionReconciliationService.Result(
                items = s.items,
                historicalCandidates = s.historicalItems,
                kpis = s.kpis!!
            )
            val id = repository.persistDraft(
                supplier, s.reportYearMonth, cutoff, name, fileHash, parse, recon, uid
            )
            if (s.emailSourceActive && s.emailPreviewBundle != null && !s.emailContentHash.isNullOrBlank()) {
                try {
                    emailImportService.recordSuccessfulImportFingerprint(supplier, s.emailPreviewBundle)
                } catch (_: Exception) {
                }
            }
            _state.update { it.copy(importId = id, importStatus = CommissionReportImportStatus.DRAFT.name) }
        }
    }

    private fun resolveContentHash(s: CommissionReconciliationUiState): String? {
        if (!s.emailContentHash.isNullOrBlank()) return s.emailContentHash
        val uri = s.fileUri ?: return null
        return getApplication<Application>().contentResolver.openInputStream(uri)?.use {
            CommissionReportImportDispatcher.computeFileHash(it)
        }
    }

    fun openHistoryImport(importId: Long) {
        viewModelScope.launch {
            reloadImport(importId)
            _state.update { it.copy(step = CommissionReconStep.DASHBOARD) }
        }
    }

    private suspend fun reloadImport(importId: Long) {
        val uid = CurrentUserProvider.requireCurrentUid()
        val persisted = withContext(Dispatchers.IO) {
            repository.loadPersistedImport(importId, uid)
        } ?: return
        val header = persisted.header
        val nonHistorical = persisted.items.filter {
            it.lifecycleClassification != CommissionLifecycleClassification.HISTORICAL_BASELINE_CANDIDATE.name
        }
        val historical = persisted.items.filter {
            it.lifecycleClassification == CommissionLifecycleClassification.HISTORICAL_BASELINE_CANDIDATE.name
        }
        val kpis = CommissionReconciliationService.computeKpis(
            items = persisted.items,
            groups = emptyList() // KPI supplier total from header
        ).copy(
            supplierCommissionTotal = MoneyDecimal.of(header.supplierCommissionTotal),
            internalCommissionTotal = MoneyDecimal.of(header.internalCommissionTotal),
            deviationTotal = MoneyDecimal.of(header.deviationTotal)
        )
        val enrichment = withContext(Dispatchers.IO) {
            loadPricingEnrichment(persisted.items, uid)
        }
        _state.update {
            it.copy(
                importId = importId,
                importStatus = header.status,
                items = nonHistorical,
                historicalItems = historical,
                kpis = kpis,
                sourceFileName = header.sourceFileName,
                reportYearMonth = YearMonth.of(header.reportYear, header.reportMonth),
                departureCutoffLabel = CommissionReconciliationService.formatCutoffLabel(
                    CommissionBusinessDates.toLocalDate(header.departureCutoffDate)
                ),
                // Do not silently recalculate approved historical reports
                parseResult = it.parseResult,
                reservationsById = enrichment.first,
                priceListByReservationId = enrichment.second
            )
        }
    }

    /**
     * Loads reservation agreed-price snapshots and best-effort supplier price-list rows
     * for diagnostic display. Never invents prices.
     */
    private suspend fun loadPricingEnrichment(
        items: List<CommissionReconciliationItem>,
        userUid: String
    ): Pair<
        Map<Long, com.rentacar.app.data.Reservation>,
        Map<Long, Pair<com.rentacar.app.data.SupplierPriceListItem?, Boolean>>
        > {
        val ids = items.mapNotNull { it.reservationId }.distinct()
        if (ids.isEmpty()) return emptyMap<Long, com.rentacar.app.data.Reservation>() to emptyMap()

        val reservations = mutableMapOf<Long, com.rentacar.app.data.Reservation>()
        ids.forEach { id ->
            val r = db.reservationDao().getById(id, userUid).firstOrNull()
            if (r != null) reservations[id] = r
        }

        val headers = db.supplierPriceListDao().getHeadersForSupplier(supplierId, userUid)
        val priceMap = mutableMapOf<Long, Pair<com.rentacar.app.data.SupplierPriceListItem?, Boolean>>()
        reservations.forEach { (id, reservation) ->
            val departure = CommissionBusinessDates.toLocalDate(reservation.dateFrom)
            val periodHeader = headers.firstOrNull {
                it.year == departure.year && it.month == departure.monthValue
            }
            val fallbackHeader = headers.firstOrNull { it.isActive } ?: headers.firstOrNull()
            val header = periodHeader ?: fallbackHeader
            val matchedPeriod = periodHeader != null
            val item = if (header != null) {
                val listItems = db.supplierPriceListDao().getItemsForHeader(header.id, userUid)
                // Best-effort: first row — car-group matching is not always available on reservation
                listItems.firstOrNull()
            } else null
            priceMap[id] = item to matchedPeriod
        }
        return reservations to priceMap
    }

    fun showHistory() {
        _state.update { it.copy(step = CommissionReconStep.HISTORY) }
    }

    fun backToSetup() {
        _state.update { it.copy(step = CommissionReconStep.SETUP) }
    }

    fun exportExcel() {
        viewModelScope.launch {
            val s = _state.value
            if (s.exporting || s.approving) return@launch
            val supplier = s.supplier
            val kpis = s.kpis
            if (supplier == null || kpis == null) {
                _events.send(CommissionReconciliationUiEvent.ShowError("אין נתונים לייצוא"))
                return@launch
            }
            _state.update { it.copy(exporting = true, loading = true, errorMessage = null) }
            try {
                val (uri, fileName) = withContext(Dispatchers.IO) {
                    val presentations = CommissionComparisonMapper.buildPresentations(
                        items = s.items + s.historicalItems,
                        reservationsById = s.reservationsById,
                        priceListByReservationId = s.priceListByReservationId
                    )
                    val bytes = CommissionReconciliationExcelExporter.buildWorkbookBytes(
                        CommissionReconciliationExcelExporter.Params(
                            supplierName = supplier.name,
                            reportYearMonth = s.reportYearMonth,
                            departureCutoffLabel = s.departureCutoffLabel,
                            sourceFileName = s.sourceFileName.orEmpty(),
                            fileHash = "",
                            parserLabel = s.parserLabel.orEmpty(),
                            kpis = kpis,
                            items = s.items + s.historicalItems,
                            presentations = presentations,
                            paymentTotals = CommissionComparisonMapper.computeTotals(presentations)
                        )
                    )
                    val name = "התאמת_עמלות_${supplier.name}_${s.reportYearMonth}.xlsx"
                        .replace(" ", "_")
                    val contentUri = ShareService.saveBytesToCacheAndGetUri(
                        getApplication(),
                        bytes,
                        name
                    )
                    contentUri to name
                }
                // Emit UI event — Compose starts the share chooser on the main thread with UI context.
                // ViewModel must never call Context.startActivity().
                _events.send(
                    CommissionReconciliationUiEvent.ShareExcel(
                        uri = uri,
                        fileName = fileName,
                        mimeType = ShareService.MIME_XLSX
                    )
                )
                _state.update {
                    it.copy(exporting = false, loading = false, infoMessage = "מוכן לשיתוף")
                }
            } catch (e: Exception) {
                val msg = e.message?.takeIf { it.isNotBlank() } ?: "ייצוא נכשל"
                _state.update {
                    it.copy(exporting = false, loading = false, errorMessage = msg)
                }
                _events.send(CommissionReconciliationUiEvent.ShowError(msg))
            }
        }
    }

    fun clearMessages() {
        _state.update { it.copy(errorMessage = null, infoMessage = null) }
    }

    fun toggleEmailDiagnostics() {
        _state.update { it.copy(showEmailDiagnostics = !it.showEmailDiagnostics) }
    }

    fun buildEmailImportDebugJson(): String? {
        val session = com.rentacar.app.emailimport.debug.EmailImportDebugHub.latest ?: return null
        val app = getApplication<Application>()
        val pInfo = try {
            app.packageManager.getPackageInfo(app.packageName, 0)
        } catch (_: Exception) {
            null
        }
        return com.rentacar.app.emailimport.debug.EmailImportDebugJsonExporter.toJson(
            session = session,
            appVersionName = pInfo?.versionName ?: "1.0",
            appVersionCode = if (android.os.Build.VERSION.SDK_INT >= 28) {
                pInfo?.longVersionCode?.toInt() ?: 1
            } else {
                @Suppress("DEPRECATION")
                pInfo?.versionCode ?: 1
            },
            buildType = if (com.rentacar.app.BuildConfig.DEBUG) "debug" else "release",
            deviceManufacturer = android.os.Build.MANUFACTURER,
            deviceModel = android.os.Build.MODEL,
            androidVersion = android.os.Build.VERSION.RELEASE,
            sdkInt = android.os.Build.VERSION.SDK_INT
        )
    }

    fun searchEmailReports() {
        viewModelScope.launch {
            val supplier = _state.value.supplier
                ?: repository.loadSupplier(supplierId, CurrentUserProvider.requireCurrentUid())
            if (supplier == null) {
                _state.update { it.copy(errorMessage = "ספק לא נמצא") }
                return@launch
            }
            if (supplier.commissionReportEmail.isNullOrBlank()) {
                _state.update {
                    it.copy(errorMessage = com.rentacar.app.emailimport.EmailImportErrorCode.SUPPLIER_EMAIL_NOT_CONFIGURED.hebrewMessage())
                }
                return@launch
            }
            if (supplier.commissionReportFormat.isNullOrBlank()) {
                _state.update {
                    it.copy(errorMessage = com.rentacar.app.emailimport.EmailImportErrorCode.SUPPLIER_FORMAT_NOT_CONFIGURED.hebrewMessage())
                }
                return@launch
            }
            _state.update {
                it.copy(
                    loading = true,
                    emailOperation = EmailImportOperation.SEARCHING_MAILBOX,
                    errorMessage = null,
                    emailReports = emptyList(),
                    previewingEmailCandidateId = null,
                    previewCandidateErrorId = null,
                    previewCandidateErrorMessage = null
                )
            }
            val ym = _state.value.reportYearMonth
            val (items, diagnostics) = withContext(Dispatchers.IO) {
                try {
                    emailImportService.searchReportsForSupplier(
                        supplier = supplier,
                        reportYear = ym.year,
                        reportMonth = ym.monthValue
                    )
                } catch (e: Exception) {
                    val session = com.rentacar.app.emailimport.debug.EmailImportDebugHub.latest
                        ?: com.rentacar.app.emailimport.debug.EmailImportDebugHub.begin()
                    session.recordFailure(
                        com.rentacar.app.emailimport.debug.EmailImportDebugStage.ERROR,
                        e
                    )
                    emptyList<com.rentacar.app.emailimport.EmailReportListItem>() to
                        com.rentacar.app.emailimport.EmailImportDiagnostics.fromSession(
                            session,
                            notes = listOf(
                                com.rentacar.app.emailimport.EmailImportErrorCode.UNKNOWN.hebrewMessage() +
                                    " (${e.javaClass.simpleName}: ${e.message ?: ""})"
                            )
                        )
                }
            }
            _state.update {
                it.copy(
                    loading = false,
                    emailOperation = EmailImportOperation.IDLE,
                    emailReports = items,
                    emailDiagnostics = diagnostics,
                    errorMessage = diagnostics.notes.firstOrNull(),
                    emailSourceActive = true
                )
            }
        }
    }

    fun previewEmailReport(
        item: com.rentacar.app.emailimport.EmailReportListItem,
        selectedXlsxFileName: String? = null
    ) {
        viewModelScope.launch {
            val current = _state.value
            val supplier = current.supplier
                ?: repository.loadSupplier(supplierId, CurrentUserProvider.requireCurrentUid())
                ?: run {
                    _state.update { it.copy(errorMessage = "ספק לא נמצא") }
                    return@launch
                }
            if (current.parserLabel == null) {
                _state.update {
                    it.copy(errorMessage = "לא הוגדרה תבנית דוח עמלות. יש להגדיר תבנית דוח עמלות לפני הייבוא.")
                }
                return@launch
            }
            val candidateId = item.stableCandidateId()
            // Candidate preview must NOT enter SEARCHING_MAILBOX / clear emailReports.
            _state.update {
                it.copy(
                    emailOperation = EmailImportOperation.PREVIEWING_CANDIDATE,
                    previewingEmailCandidateId = candidateId,
                    previewCandidateErrorId = null,
                    previewCandidateErrorMessage = null,
                    errorMessage = null,
                    ambiguousXlsxNames = emptyList(),
                    ambiguousXlsxCandidateId = null
                )
            }
            try {
                val ym = current.reportYearMonth
                val bundle = withContext(Dispatchers.IO) {
                    emailImportService.previewSelectedReport(
                        supplier = supplier,
                        item = item,
                        reportYear = ym.year,
                        reportMonth = ym.monthValue,
                        selectedXlsxFileName = selectedXlsxFileName
                    )
                }
                val result = bundle.dispatcherPreview
                if (!result.success || result.parseResult == null) {
                    val err = result.errors.joinToString("\n").ifBlank {
                        bundle.diagnostics.notes.firstOrNull() ?: "פענוח ממייל נכשל"
                    }
                    _state.update {
                        it.copy(
                            emailOperation = EmailImportOperation.IDLE,
                            previewingEmailCandidateId = null,
                            previewCandidateErrorId = candidateId,
                            previewCandidateErrorMessage = err,
                            errorMessage = null,
                            warnings = result.warnings,
                            isDuplicateFile = result.isDuplicateFile,
                            emailDiagnostics = bundle.diagnostics,
                            emailPreviewBundle = bundle,
                            ambiguousXlsxNames = bundle.ambiguousXlsxNames,
                            ambiguousXlsxCandidateId = if (bundle.ambiguousXlsxNames.isNotEmpty()) candidateId else null,
                            emailMatchedSender = bundle.matchedSenderEmail,
                            emailSenderMatchType = bundle.senderMatchType.name,
                            emailContentHash = bundle.contentHash,
                            parseResult = result.parseResult,
                            step = CommissionReconStep.SETUP
                        )
                    }
                    return@launch
                }

                val parse = result.parseResult
                val uid = CurrentUserProvider.requireCurrentUid()
                val cutoff = CommissionReconciliationService.cutoffForReportMonth(ym)
                val input = withContext(Dispatchers.IO) {
                    repository.buildReconciliationInput(
                        supplier = supplier,
                        reportYearMonth = ym,
                        departureCutoff = cutoff,
                        groups = parse.normalizedGroups,
                        userUid = uid
                    )
                }
                val recon = CommissionReconciliationService.reconcile(input)
                val enrichment = withContext(Dispatchers.IO) {
                    loadPricingEnrichment(recon.items + recon.historicalCandidates, uid)
                }
                _state.update {
                    it.copy(
                        emailOperation = EmailImportOperation.IDLE,
                        previewingEmailCandidateId = null,
                        previewCandidateErrorId = null,
                        previewCandidateErrorMessage = null,
                        parseResult = parse,
                        kpis = recon.kpis,
                        items = recon.items,
                        historicalItems = recon.historicalCandidates,
                        isDuplicateFile = result.isDuplicateFile,
                        warnings = result.warnings,
                        totalsBlocked = !parse.totalsMatch,
                        step = CommissionReconStep.PREVIEW,
                        sourceFileName = result.sourceFileName,
                        fileUri = null,
                        emailSourceActive = true,
                        emailPreviewBundle = bundle,
                        emailDiagnostics = bundle.diagnostics,
                        emailMatchedSender = bundle.matchedSenderEmail,
                        emailSenderMatchType = bundle.senderMatchType.name,
                        emailContentHash = bundle.contentHash,
                        ambiguousXlsxNames = emptyList(),
                        ambiguousXlsxCandidateId = null,
                        errorMessage = if (!parse.totalsMatch) {
                            "סיכומי הקובץ אינם תואמים — לא ניתן לאשר. ניתן לצפות בתצוגה מקדימה לאבחון."
                        } else null,
                        reservationsById = enrichment.first,
                        priceListByReservationId = enrichment.second
                    )
                }
            } catch (t: Throwable) {
                if (t is kotlinx.coroutines.CancellationException) throw t
                _state.update {
                    it.copy(
                        emailOperation = EmailImportOperation.IDLE,
                        previewingEmailCandidateId = null,
                        previewCandidateErrorId = candidateId,
                        previewCandidateErrorMessage = t.message ?: t.javaClass.simpleName,
                        errorMessage = null,
                        step = CommissionReconStep.SETUP
                    )
                }
            } finally {
                // Never leave PREVIEWING_CANDIDATE stuck after unexpected failures.
                if (_state.value.emailOperation == EmailImportOperation.PREVIEWING_CANDIDATE &&
                    _state.value.previewingEmailCandidateId == candidateId
                ) {
                    _state.update {
                        it.copy(
                            emailOperation = EmailImportOperation.IDLE,
                            previewingEmailCandidateId = null
                        )
                    }
                }
            }
        }
    }

    /** Call after draft save / approve path when email source was used. */
    fun persistEmailFingerprintIfNeeded() {
        viewModelScope.launch(Dispatchers.IO) {
            val bundle = _state.value.emailPreviewBundle ?: return@launch
            val supplier = _state.value.supplier ?: return@launch
            if (bundle.contentHash.isBlank()) return@launch
            try {
                emailImportService.recordSuccessfulImportFingerprint(supplier, bundle)
            } catch (_: Exception) {
            }
        }
    }
}
