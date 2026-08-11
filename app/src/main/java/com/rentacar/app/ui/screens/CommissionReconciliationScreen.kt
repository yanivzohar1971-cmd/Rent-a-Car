package com.rentacar.app.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AssistChip
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavController
import com.rentacar.app.commission.presentation.CommissionComparisonPresentation
import com.rentacar.app.commission.presentation.FinancialDisplayFormatter
import com.rentacar.app.commission.presentation.PaymentDifferenceDirection
import com.rentacar.app.commission.presentation.PaymentDifferenceTotals
import com.rentacar.app.commission.money.MoneyDecimal
import com.rentacar.app.share.ShareService
import com.rentacar.app.ui.vm.CommissionReconFilter
import com.rentacar.app.ui.vm.CommissionReconSort
import com.rentacar.app.ui.vm.CommissionReconStep
import com.rentacar.app.ui.vm.CommissionReconciliationUiEvent
import com.rentacar.app.ui.vm.CommissionReconciliationUiState
import com.rentacar.app.ui.vm.CommissionReconciliationViewModel
import java.time.YearMonth

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommissionReconciliationScreen(
    navController: NavController,
    supplierId: Long
) {
    val context = LocalContext.current
    val vm: CommissionReconciliationViewModel = viewModel(
        factory = remember(supplierId) {
            object : androidx.lifecycle.ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                    return CommissionReconciliationViewModel(
                        context.applicationContext as android.app.Application,
                        supplierId
                    ) as T
                }
            }
        }
    )
    val state by vm.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        vm.events.collect { event ->
            when (event) {
                is CommissionReconciliationUiEvent.ShareExcel -> {
                    val result = ShareService.shareFile(
                        context = context,
                        uri = event.uri,
                        itemName = event.fileName,
                        mimeType = event.mimeType
                    )
                    if (!result.success) {
                        snackbarHostState.showSnackbar(
                            result.errorMessage ?: "שגיאה בפתיחת שיתוף"
                        )
                    }
                }
                is CommissionReconciliationUiEvent.ShowError -> {
                    snackbarHostState.showSnackbar(event.message)
                }
                is CommissionReconciliationUiEvent.ShowInfo -> {
                    snackbarHostState.showSnackbar(event.message)
                }
            }
        }
    }

    val filePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri != null) {
            val name = uri.lastPathSegment?.substringAfterLast('/') ?: "commission_report.xlsx"
            vm.onFilePicked(uri, name)
        }
    }

    val busy = state.loading || state.exporting || state.approving

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "התאמת עמלות" +
                            (state.supplier?.name?.let { " — $it" } ?: "")
                    )
                },
                navigationIcon = {
                    IconButton(onClick = {
                        when (state.step) {
                            CommissionReconStep.SETUP -> navController.popBackStack()
                            else -> vm.backToSetup()
                        }
                    }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "חזרה")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            if (state.step == CommissionReconStep.DASHBOARD || state.step == CommissionReconStep.PREVIEW) {
                BottomAppBar(modifier = Modifier.navigationBarsPadding()) {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState())
                            .padding(horizontal = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedButton(
                            onClick = { vm.saveDraft() },
                            enabled = !busy
                        ) { Text("שמור טיוטה") }
                        OutlinedButton(
                            onClick = { vm.exportExcel() },
                            enabled = !busy && state.kpis != null
                        ) {
                            Text(if (state.exporting) "מייצא…" else "ייצוא")
                        }
                        if (state.step == CommissionReconStep.PREVIEW && !state.totalsBlocked) {
                            Button(
                                onClick = { vm.continueToDashboard() },
                                enabled = !busy
                            ) { Text("להתאמה") }
                        }
                        if (state.step == CommissionReconStep.DASHBOARD && !state.totalsBlocked) {
                            Button(
                                onClick = { vm.approveSelectedSafe() },
                                enabled = !busy && vm.hasSafeSelection()
                            ) {
                                Text(if (state.approving) "מאשר…" else "אשר נבחרים")
                            }
                        }
                    }
                }
            }
        }
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            if (busy) {
                LinearBusyHint(
                    exporting = state.exporting,
                    approving = state.approving
                )
            }
            when (state.step) {
                CommissionReconStep.SETUP -> SetupStep(state, vm, filePicker = {
                    filePicker.launch(
                        arrayOf(
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            "application/vnd.ms-excel",
                            "*/*"
                        )
                    )
                })
                CommissionReconStep.PREVIEW -> PreviewStep(state, vm)
                CommissionReconStep.DASHBOARD -> DashboardStep(state, vm, navController)
                CommissionReconStep.HISTORY -> HistoryStep(state, vm)
            }
        }
    }
}

@Composable
private fun LinearBusyHint(exporting: Boolean, approving: Boolean) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        CircularProgressIndicator(
            modifier = Modifier
                .height(18.dp)
                .width(18.dp),
            strokeWidth = 2.dp
        )
        Text(
            when {
                exporting -> "מייצא קובץ Excel…"
                approving -> "מאשר פריטים…"
                else -> "טוען…"
            },
            style = MaterialTheme.typography.bodySmall
        )
    }
}

@Composable
private fun SetupStep(
    state: CommissionReconciliationUiState,
    vm: CommissionReconciliationViewModel,
    filePicker: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Text("הגדרת ייבוא", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Spacer(modifier = Modifier.height(12.dp))
        Text("ספק: ${state.supplier?.name ?: "—"}")
        Text("תבנית: ${state.parserLabel ?: "לא הוגדרה — יש לבחור תבנית דוח עמלות"}")
        Spacer(modifier = Modifier.height(8.dp))
        Text("חודש דוח: ${state.reportYearMonth}")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { vm.setReportYearMonth(state.reportYearMonth.minusMonths(1)) }) {
                Text("חודש קודם")
            }
            OutlinedButton(onClick = { vm.setReportYearMonth(state.reportYearMonth.plusMonths(1)) }) {
                Text("חודש הבא")
            }
            OutlinedButton(onClick = { vm.setReportYearMonth(YearMonth.of(2026, 7)) }) {
                Text("07/2026")
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(state.departureCutoffLabel, fontWeight = FontWeight.SemiBold)
        Text(
            "חיתוך לפי תאריך יציאה (dateFrom) בלבד.",
            style = MaterialTheme.typography.bodySmall
        )
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedButton(onClick = filePicker, modifier = Modifier.fillMaxWidth()) {
            Text(if (state.sourceFileName != null) "קובץ: ${state.sourceFileName}" else "בחר קובץ Excel")
        }
        if (state.isDuplicateFile) {
            Text("אזהרה: קובץ זהה כבר יובא בעבר", color = MaterialTheme.colorScheme.tertiary)
        }
        state.errorMessage?.let {
            Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
        }
        Spacer(modifier = Modifier.height(16.dp))
        Button(
            onClick = { vm.runPreview() },
            enabled = state.sourceFileName != null && state.parserLabel != null && !state.loading,
            modifier = Modifier.fillMaxWidth()
        ) { Text("פענח והצג תצוגה מקדימה") }
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedButton(onClick = { vm.showHistory() }, modifier = Modifier.fillMaxWidth()) {
            Text("היסטוריית דוחות")
        }
    }
}

@Composable
private fun PreviewStep(
    state: CommissionReconciliationUiState,
    vm: CommissionReconciliationViewModel
) {
    val parse = state.parseResult
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item {
            Text("אימות קובץ", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }
        if (parse != null) {
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        SummaryRow("שורות פירוט", parse.rawRows.size.toString())
                        SummaryRow("קבוצות מנורמלות", parse.normalizedGroups.size.toString())
                        SummaryRow("הזמנות ייחודיות", parse.uniqueOrderCount.toString())
                        SummaryRow("סה״כ הכנסה", FinancialDisplayFormatter.formatMoney(parse.normalizedSums.revenueExVat))
                        SummaryRow("סה״כ עמלה", FinancialDisplayFormatter.formatMoney(parse.normalizedSums.commissionAmount))
                        SummaryRow("סיכומים תואמים", if (parse.totalsMatch) "כן" else "לא")
                    }
                }
            }
            if (state.warnings.isNotEmpty() || state.errorMessage != null) {
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            state.errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.onErrorContainer) }
                            state.warnings.forEach {
                                Text(it, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
            item {
                Text("דוגמאות קבוצות", fontWeight = FontWeight.SemiBold)
            }
            items(parse.normalizedGroups.take(8), key = { it.groupKey }) { g ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        Text("${g.orderNumber} / חש׳ ${g.invoiceNumber}", fontWeight = FontWeight.Medium)
                        Text(
                            "ימים ${g.totalDays ?: "—"} · עמלה ₪${g.commissionAmount.toDisplayString()} · שורות ${g.sourceRowNumbers.joinToString()}",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }
            state.kpis?.let {
                item {
                    Text("סיכום התאמה ראשוני", fontWeight = FontWeight.SemiBold)
                }
                item {
                    FinancialSummaryCard(vm.paymentTotals(), supplierLabel = state.supplier?.name ?: "ספק")
                }
            }
        }
        item { Spacer(modifier = Modifier.height(72.dp)) }
    }
}

@Composable
private fun DashboardStep(
    state: CommissionReconciliationUiState,
    vm: CommissionReconciliationViewModel,
    navController: NavController
) {
    val presentations = vm.filteredPresentations()
    val counts = vm.filterCounts()
    val totals = vm.paymentTotals()
    val supplierLabel = state.supplier?.name ?: "ספק"

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 88.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item {
            Text(
                "התאמת עמלות · ${state.reportYearMonth}",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Text(state.departureCutoffLabel, style = MaterialTheme.typography.bodySmall)
        }

        item {
            FinancialSummaryCard(totals, supplierLabel = supplierLabel)
        }

        item {
            SortRow(
                selected = state.sort,
                onSelect = { vm.setSort(it) }
            )
        }

        item {
            FilterRow(
                selected = state.filter,
                counts = counts,
                onSelect = { vm.setFilter(it) }
            )
        }

        if (presentations.isEmpty()) {
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        "אין פריטים במסנן הנוכחי",
                        modifier = Modifier.padding(16.dp),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        } else {
            items(presentations, key = { it.groupKey }) { presentation ->
                val selected = presentation.selectableItemIds.isNotEmpty() &&
                    presentation.selectableItemIds.all { it in state.selectedItemIds }
                ReconciliationComparisonCard(
                    presentation = presentation,
                    selected = selected,
                    onToggle = { vm.toggleSelectGroup(presentation) },
                    onOpenReservation = { route ->
                        navController.navigate(route)
                    }
                )
            }
        }
    }
}

@Composable
private fun FinancialSummaryCard(
    totals: PaymentDifferenceTotals,
    supplierLabel: String
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text("סיכום התחשבנות", fontWeight = FontWeight.Bold, fontSize = 15.sp)
            SummaryRow("לפי דוח $supplierLabel", FinancialDisplayFormatter.formatMoney(totals.supplierTotal))
            SummaryRow(
                "לתשלום לפי האפליקציה",
                FinancialDisplayFormatter.formatMoney(totals.applicationPayableTotal)
            )
            HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
            Text(
                totals.netHeadlineHebrew,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
                color = when {
                    totals.netSignedDifference.abs() <= MoneyDecimal.DEFAULT_TOLERANCE ->
                        MaterialTheme.colorScheme.onSurface
                    totals.netSignedDifference < MoneyDecimal.ZERO ->
                        MaterialTheme.colorScheme.error
                    else -> MaterialTheme.colorScheme.tertiary
                }
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                "שולם בחסר: ${FinancialDisplayFormatter.formatMoney(totals.grossUnderpaid)}  ·  " +
                    "שולם ביתר: ${FinancialDisplayFormatter.formatMoney(totals.grossOverpaid)}",
                style = MaterialTheme.typography.bodySmall
            )
            Text(
                "תואם: ${totals.matchCount}  ·  דורש בדיקה: ${totals.needsReviewCount}  ·  " +
                    "בחסר: ${totals.underpaidCount}  ·  ביתר: ${totals.overpaidCount}",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

@Composable
private fun SortRow(
    selected: CommissionReconSort,
    onSelect: (CommissionReconSort) -> Unit
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(horizontal = 2.dp)
    ) {
        item {
            FilterChip(
                selected = selected == CommissionReconSort.LARGEST_ABS_DIFF,
                onClick = { onSelect(CommissionReconSort.LARGEST_ABS_DIFF) },
                label = { Text("פער גדול ביותר") }
            )
        }
        item {
            FilterChip(
                selected = selected == CommissionReconSort.ORDER_NUMBER,
                onClick = { onSelect(CommissionReconSort.ORDER_NUMBER) },
                label = { Text("מספר הזמנה") }
            )
        }
        item {
            FilterChip(
                selected = selected == CommissionReconSort.CUSTOMER_NAME,
                onClick = { onSelect(CommissionReconSort.CUSTOMER_NAME) },
                label = { Text("שם לקוח") }
            )
        }
    }
}

@Composable
private fun FilterRow(
    selected: CommissionReconFilter,
    counts: Map<CommissionReconFilter, Int>,
    onSelect: (CommissionReconFilter) -> Unit
) {
    val filters = listOf(
        CommissionReconFilter.ALL,
        CommissionReconFilter.MATCHING,
        CommissionReconFilter.UNDERPAID,
        CommissionReconFilter.OVERPAID,
        CommissionReconFilter.SUPPLIER_ONLY,
        CommissionReconFilter.APPLICATION_ONLY,
        CommissionReconFilter.OPEN_30,
        CommissionReconFilter.FINAL_CLOSURE,
        CommissionReconFilter.NEEDS_REVIEW,
        CommissionReconFilter.HISTORICAL
    )
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(start = 2.dp, end = 24.dp)
    ) {
        items(filters) { filter ->
            val count = counts[filter] ?: 0
            FilterChip(
                selected = selected == filter,
                onClick = { onSelect(filter) },
                label = { Text("${filterLabel(filter)} ($count)") }
            )
        }
    }
}

@Composable
private fun HistoryStep(state: CommissionReconciliationUiState, vm: CommissionReconciliationViewModel) {
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item {
            Text("היסטוריית דוחות", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }
        items(state.history) { header ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { vm.openHistoryImport(header.id) }
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text("${header.reportYear}-${header.reportMonth.toString().padStart(2, '0')} • ${header.status}")
                    Text(header.sourceFileName, style = MaterialTheme.typography.bodySmall)
                    Text(
                        "דוח ${FinancialDisplayFormatter.formatMoney(header.supplierCommissionTotal)} · " +
                            "אפליקציה ${FinancialDisplayFormatter.formatMoney(header.internalCommissionTotal)}",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
    }
}

@Composable
private fun SummaryRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall)
        Text(value, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun ReconciliationComparisonCard(
    presentation: CommissionComparisonPresentation,
    selected: Boolean,
    onToggle: () -> Unit,
    onOpenReservation: (String) -> Unit
) {
    var expanded by remember(presentation.groupKey) { mutableStateOf(false) }
    val item = presentation.primaryItem
    val pricing = presentation.pricing
    val canSelect = !presentation.financialMappingUnresolved &&
        presentation.direction != PaymentDifferenceDirection.UNDERPAID &&
        presentation.direction != PaymentDifferenceDirection.OVERPAID &&
        presentation.selectableItemIds.isNotEmpty()

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = canSelect, onClick = onToggle),
        colors = CardDefaults.cardColors(
            containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer
            else MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // Header — full width, no competing side columns
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                DirectionIcon(presentation.direction)
                Spacer(modifier = Modifier.width(8.dp))
                Column(modifier = Modifier.fillMaxWidth()) {
                    if (presentation.lifecycleBadgeHebrew.isNotBlank()) {
                        Text(
                            presentation.lifecycleBadgeHebrew,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 12.sp
                        )
                    }
                    DirectionResultBlock(presentation)
                    Text(
                        "הזמנה ${presentation.supplierOrderNumber ?: "—"} · ${presentation.customerName ?: "—"}",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }

            HorizontalDivider()

            // Supplier section — stacked full width
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Text("דוח שגריר", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                Text(
                    "${item.supplierDays ?: "—"} ימים · ${presentation.supplierPercentFormatted}",
                    style = MaterialTheme.typography.bodyMedium
                )
                pricing?.supplierRevenueExVat?.let {
                    Text(
                        "הכנסה לפני מע״מ: ${FinancialDisplayFormatter.formatMoney(it)}",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
                Text(
                    "עמלה: ${presentation.supplierReportedAmount?.let { FinancialDisplayFormatter.formatMoney(it) } ?: "—"}",
                    fontWeight = FontWeight.SemiBold,
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            // Application section — stacked full width
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Text("חישוב האפליקציה", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                if (presentation.eventBreakdownHebrew.isNotBlank()) {
                    Text(presentation.eventBreakdownHebrew, style = MaterialTheme.typography.bodyMedium)
                }
                pricing?.let { p ->
                    Text("סוג תעריף: ${p.tariffBasisHebrew}", style = MaterialTheme.typography.bodyMedium)
                    when {
                        p.monthlyPriceFormatted != null &&
                            (p.tariffBasis == com.rentacar.app.commission.presentation.TariffBasisKind.MONTHLY ||
                                p.tariffBasis == com.rentacar.app.commission.presentation.TariffBasisKind.MIXED_UNPROVEN) ->
                            Text("מחיר חודשי: ${p.monthlyPriceFormatted}", style = MaterialTheme.typography.bodyMedium)
                        p.weeklyPriceFormatted != null &&
                            p.tariffBasis == com.rentacar.app.commission.presentation.TariffBasisKind.WEEKLY ->
                            Text("מחיר שבועי: ${p.weeklyPriceFormatted}", style = MaterialTheme.typography.bodyMedium)
                        p.dailyPriceFormatted != null &&
                            p.tariffBasis == com.rentacar.app.commission.presentation.TariffBasisKind.DAILY ->
                            Text("מחיר יומי: ${p.dailyPriceFormatted}", style = MaterialTheme.typography.bodyMedium)
                        p.unitPriceFormatted != null ->
                            Text("${p.unitPriceLabelHebrew}: ${p.unitPriceFormatted}", style = MaterialTheme.typography.bodyMedium)
                    }
                    p.applicationRentalRevenueExVat?.let {
                        Text(
                            "סכום השכרה מחושב: ${FinancialDisplayFormatter.formatMoney(it)}",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                    p.applicationCommissionPercentFormatted?.let {
                        Text("אחוז עמלה: $it", style = MaterialTheme.typography.bodyMedium)
                    }
                    if (p.revenueDifference != null &&
                        p.revenueDifference.abs() > MoneyDecimal.DEFAULT_TOLERANCE
                    ) {
                        Text(
                            "פער בבסיס ההכנסה: ${FinancialDisplayFormatter.formatMoney(p.revenueDifference.abs())}",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                    p.priceWarningHebrew?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                    p.tariffTransitionHebrew?.let {
                        Text(it, color = MaterialTheme.colorScheme.tertiary, style = MaterialTheme.typography.bodySmall)
                    }
                }
                Text(
                    "עמלה לתשלום בדוח זה: ${
                        presentation.internalCurrentPayableAmount
                            ?.let { FinancialDisplayFormatter.formatMoney(it) } ?: "—"
                    }",
                    fontWeight = FontWeight.SemiBold,
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            if (presentation.previouslySettledKnown || presentation.priorSettlementHint ||
                (presentation.internalLifecycleTotal != null &&
                    presentation.internalCurrentPayableAmount != null &&
                    presentation.internalLifecycleTotal != presentation.internalCurrentPayableAmount)
            ) {
                SettledBreakdown(presentation)
            }

            if (presentation.reasonHebrew.isNotBlank() && presentation.reasonHebrew != "—") {
                Text(
                    presentation.reasonHebrew,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // Actions — vertical on narrow phones
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                OutlinedButton(
                    onClick = { expanded = !expanded },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(if (expanded) "הסתר פירוט חישוב" else "הצג פירוט חישוב")
                }
                val route = presentation.openReservationRoute
                if (route != null) {
                    Button(
                        onClick = { onOpenReservation(route) },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("פתח הזמנה") }
                } else {
                    Text(
                        "לא נמצאה הזמנה תואמת",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (selected) {
                    Text("נבחר לאישור", style = MaterialTheme.typography.labelSmall)
                }
                if (presentation.direction == PaymentDifferenceDirection.UNDERPAID ||
                    presentation.direction == PaymentDifferenceDirection.OVERPAID ||
                    presentation.financialMappingUnresolved
                ) {
                    Text("אישור חסום — נדרשת בדיקה", style = MaterialTheme.typography.labelSmall)
                }
            }

            AnimatedVisibility(visible = expanded) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    if (presentation.calculationDetailHebrew.isNotBlank()) {
                        Text(presentation.calculationDetailHebrew, style = MaterialTheme.typography.bodySmall)
                    }
                    Text("חשבונית ${item.supplierInvoiceNumber ?: "—"}", style = MaterialTheme.typography.bodySmall)
                    pricing?.priceSourceHebrew?.let {
                        Text("מקור מחיר: $it", style = MaterialTheme.typography.bodySmall)
                    }
                    presentation.sourceItems.forEach { src ->
                        val typeHe = when (src.eventType) {
                            "MONTHLY_CYCLE" -> "מחזור 30 יום"
                            "FINAL_REMAINDER" -> "יתרת סיום"
                            "FINAL_RENTAL" -> "השכרה סופית"
                            else -> "אירוע"
                        }
                        val amt = src.internalCommission?.let { FinancialDisplayFormatter.formatMoney(it) }
                        Text(
                            "$typeHe · ${src.internalDays ?: "—"} ימים · $amt",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DirectionIcon(direction: PaymentDifferenceDirection) {
    when (direction) {
        PaymentDifferenceDirection.MATCH ->
            Icon(Icons.Default.CheckCircle, contentDescription = "תואם", tint = MaterialTheme.colorScheme.primary)
        PaymentDifferenceDirection.UNDERPAID ->
            Icon(Icons.Default.KeyboardArrowDown, contentDescription = "שולם בחסר", tint = MaterialTheme.colorScheme.error)
        PaymentDifferenceDirection.OVERPAID ->
            Icon(Icons.Default.KeyboardArrowUp, contentDescription = "שולם ביתר", tint = MaterialTheme.colorScheme.tertiary)
        PaymentDifferenceDirection.NOT_COMPARABLE ->
            Icon(Icons.Default.Warning, contentDescription = "דורש בדיקה", tint = MaterialTheme.colorScheme.secondary)
    }
}

@Composable
private fun DirectionResultBlock(presentation: CommissionComparisonPresentation) {
    val amount = presentation.absoluteDifference
    val title = when (presentation.direction) {
        PaymentDifferenceDirection.MATCH -> "תואם — אין פער כספי"
        PaymentDifferenceDirection.UNDERPAID ->
            "שולם בחסר ${amount?.let { FinancialDisplayFormatter.formatMoney(it) } ?: ""}".trim()
        PaymentDifferenceDirection.OVERPAID ->
            "שולם ביתר ${amount?.let { FinancialDisplayFormatter.formatMoney(it) } ?: ""}".trim()
        PaymentDifferenceDirection.NOT_COMPARABLE -> presentation.directionTitleHebrew
    }
    val subtitle = when (presentation.direction) {
        PaymentDifferenceDirection.MATCH -> presentation.explanationHebrew
        else -> presentation.explanationHebrew
    }
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(title, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        if (subtitle.isNotBlank()) {
            Text(subtitle, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun SettledBreakdown(presentation: CommissionComparisonPresentation) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        if (presentation.previouslySettledKnown) {
            Text(
                "כבר אושר בעבר: ${FinancialDisplayFormatter.formatMoney(presentation.previouslySettledAmount)}",
                style = MaterialTheme.typography.bodySmall
            )
        } else if (presentation.priorSettlementHint) {
            Text("כבר אושר מחזור קודם (סכום לא זמין בטיוטה)", style = MaterialTheme.typography.bodySmall)
        }
        presentation.internalLifecycleTotal?.let {
            Text(
                "סה״כ לכל תקופת ההשכרה: ${FinancialDisplayFormatter.formatMoney(it)}",
                style = MaterialTheme.typography.bodySmall
            )
        }
        presentation.internalCurrentPayableAmount?.let {
            Text(
                "נותר לתשלום בדוח הנוכחי: ${FinancialDisplayFormatter.formatMoney(it)}",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

private fun filterLabel(filter: CommissionReconFilter): String = when (filter) {
    CommissionReconFilter.ALL -> "הכל"
    CommissionReconFilter.MATCHING -> "תואם"
    CommissionReconFilter.UNDERPAID -> "שולם בחסר"
    CommissionReconFilter.OVERPAID -> "שולם ביתר"
    CommissionReconFilter.SUPPLIER_ONLY -> "ספק בלבד"
    CommissionReconFilter.APPLICATION_ONLY -> "אפליקציה בלבד"
    CommissionReconFilter.OPEN_30 -> "30 יום"
    CommissionReconFilter.FINAL_CLOSURE -> "סגירה סופית"
    CommissionReconFilter.NEEDS_REVIEW -> "דורש בדיקה"
    CommissionReconFilter.HISTORICAL -> "היסטורי"
}
