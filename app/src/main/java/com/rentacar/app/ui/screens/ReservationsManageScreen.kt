package com.rentacar.app.ui.screens

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.background
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.rentacar.app.LocalTitleColor
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.ui.components.AppSearchBar
import com.rentacar.app.ui.components.AppEmptySearchState
import com.rentacar.app.ui.vm.ReservationViewModel
import com.rentacar.app.ui.components.ReservationsList
import com.rentacar.app.ui.components.ReservationListItem
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.runtime.remember
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.delay

@Composable
fun ReservationsManageScreen(navController: NavHostController, vm: ReservationViewModel) {
    val reservations by vm.allReservations.collectAsState()
    val customers by vm.customerList.collectAsState()
    val suppliers by vm.suppliers.collectAsState()
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var debouncedQuery by remember { mutableStateOf("") }
    // Removed single date filter; using range only
    var fromDateFilter by rememberSaveable { mutableStateOf("") }
    var toDateFilter by rememberSaveable { mutableStateOf("") }
    var supplierFilterId by rememberSaveable { mutableStateOf<Long?>(null) }
    var supplierExpanded by rememberSaveable { mutableStateOf(false) }
        var cancelledFilter by rememberSaveable { mutableStateOf<String?>(null) } // null=הכל, "not"=פעילות, "only"=מבוטלות
        var cancelledExpanded by rememberSaveable { mutableStateOf(false) }
    var activeStatusFilter by rememberSaveable { mutableStateOf<ReservationStatus?>(null) }
    var activeClosedFilter by rememberSaveable { mutableStateOf<Boolean?>(null) }
    
    // Debounce search query
    LaunchedEffect(searchQuery) {
        delay(300)
        debouncedQuery = searchQuery
    }
    
    // Compute current filtered list - this is the canonical filtered list used by both UI and totals
    val filtered by remember(debouncedQuery, fromDateFilter, toDateFilter, supplierFilterId, cancelledFilter, activeStatusFilter, activeClosedFilter, reservations, customers, suppliers) {
        derivedStateOf {
            reservations.filter { r ->
            val matchesText = if (debouncedQuery.isBlank()) true else run {
                val c = customers.find { it.id == r.customerId }
                val customerFullName = "${c?.firstName ?: ""} ${c?.lastName ?: ""}".lowercase()
                val customerPhone = (c?.phone ?: "").lowercase()
                val customerTzId = (c?.tzId ?: "").lowercase()
                val orderId = r.id.toString().lowercase()
                val supplierName = (suppliers.find { it.id == r.supplierId }?.name ?: "").lowercase()
                val q = debouncedQuery.trim().lowercase()
                
                customerFullName.contains(q) || 
                customerPhone.contains(q) || 
                customerTzId.contains(q) || 
                orderId.contains(q) ||
                supplierName.contains(q)
            }
            val matchesDate = true
            val matchesRange = run {
                val df = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
                val fromStart: Long? = try {
                    if (fromDateFilter.isBlank()) null else df.parse(fromDateFilter)?.let { d ->
                        val cal = java.util.Calendar.getInstance().apply {
                            time = d
                            set(java.util.Calendar.HOUR_OF_DAY, 0)
                            set(java.util.Calendar.MINUTE, 0)
                            set(java.util.Calendar.SECOND, 0)
                            set(java.util.Calendar.MILLISECOND, 0)
                        }
                        cal.timeInMillis
                    }
                } catch (_: Throwable) { null }
                val toEnd: Long? = try {
                    if (toDateFilter.isBlank()) null else df.parse(toDateFilter)?.let { d ->
                        val cal = java.util.Calendar.getInstance().apply {
                            time = d
                            set(java.util.Calendar.HOUR_OF_DAY, 23)
                            set(java.util.Calendar.MINUTE, 59)
                            set(java.util.Calendar.SECOND, 59)
                            set(java.util.Calendar.MILLISECOND, 999)
                        }
                        cal.timeInMillis
                    }
                } catch (_: Throwable) { null }
                // Filter by creation date (createdAt) instead of rental period dates
                val createdAt = r.createdAt
                when {
                    fromStart == null && toEnd == null -> true
                    fromStart != null && toEnd == null -> createdAt >= fromStart
                    fromStart == null && toEnd != null -> createdAt <= toEnd
                    else -> (createdAt >= fromStart!! && createdAt <= toEnd!!)
                }
            }
            val matchesSupplier = supplierFilterId?.let { r.supplierId == it } ?: true
            val matchesCancelled = when (cancelledFilter) {
                "not" -> r.status != com.rentacar.app.data.ReservationStatus.Cancelled
                "only" -> r.status == com.rentacar.app.data.ReservationStatus.Cancelled
                else -> true
            }
            val matchesStatusFilter = when {
                activeStatusFilter != null -> r.status == activeStatusFilter && !r.isClosed
                activeClosedFilter == true -> r.isClosed
                else -> true
            }
            matchesText && matchesDate && matchesRange && matchesSupplier && matchesCancelled && matchesStatusFilter
            }
        }
    }
    
    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        // Compact title bar
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(LocalTitleColor.current)
                .padding(vertical = 6.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                "ניהול הזמנות",
                color = com.rentacar.app.LocalTitleTextColor.current,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                androidx.compose.material3.SmallFloatingActionButton(
                    onClick = {
                    searchQuery = ""
                    fromDateFilter = ""
                    toDateFilter = ""
                    supplierFilterId = null
                    cancelledFilter = null
                        activeStatusFilter = null
                        activeClosedFilter = null
                    },
                    modifier = Modifier.size(40.dp)
                ) {
                    Text("נקה", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.weight(1f))
                IconButton(onClick = { navController.navigate(com.rentacar.app.ui.navigation.Routes.Dashboard) }) {
                    Icon(
                        imageVector = Icons.Default.Home,
                        contentDescription = "בית",
                        tint = com.rentacar.app.LocalTitleTextColor.current
                    )
                }
            }
        }
        Spacer(Modifier.height(4.dp))
        
        // Modern search bar
        AppSearchBar(
            query = searchQuery,
            onQueryChange = { searchQuery = it },
            placeholder = "חיפוש הזמנה לפי שם לקוח, רכב או מספר הזמנה..."
        )
        
        Spacer(Modifier.height(6.dp))
        // שורת סינון: מתאריך, עד תאריך, ספק, סטטוס — כולם ככפתורי FAB
        run {
            val context2 = LocalContext.current
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                // From date FAB
                androidx.compose.material3.FloatingActionButton(
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp),
                    onClick = {
                    val cal = java.util.Calendar.getInstance()
                    if (fromDateFilter.isNotBlank()) {
                        try {
                            val df = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
                            cal.time = df.parse(fromDateFilter) ?: java.util.Date()
                        } catch (_: Throwable) { }
                    }
                    val year = cal.get(java.util.Calendar.YEAR)
                    val month = cal.get(java.util.Calendar.MONTH)
                    val day = cal.get(java.util.Calendar.DAY_OF_MONTH)
                    android.app.DatePickerDialog(context2, { _, y, m, d ->
                        val dd = String.format("%02d", d)
                        val mm = String.format("%02d", m + 1)
                        val newFromDate = "$dd/$mm/$y"
                        
                        // Validate that from date is not later than to date
                        if (toDateFilter.isNotBlank()) {
                            try {
                                val df = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
                                val fromDate = df.parse(newFromDate)
                                val toDate = df.parse(toDateFilter)
                                if (fromDate != null && toDate != null && fromDate.after(toDate)) {
                                    android.widget.Toast.makeText(context2, "תאריך התחלה לא יכול להיות גדול מתאריך הסיום", android.widget.Toast.LENGTH_LONG).show()
                                    // Don't update the filter - keep the old valid value
                                    return@DatePickerDialog
                                }
                            } catch (_: Throwable) { }
                        }
                        fromDateFilter = newFromDate
                    }, year, month, day).show()
                }) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                        Text("🗓")
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = if (fromDateFilter.isBlank()) "מתאריך" else fromDateFilter, 
                            fontSize = responsiveFontSize(8f),
                            color = Color.Black,
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
                // To date FAB
                androidx.compose.material3.FloatingActionButton(
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp),
                    onClick = {
                    val cal = java.util.Calendar.getInstance()
                    if (toDateFilter.isNotBlank()) {
                        try {
                            val df = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
                            cal.time = df.parse(toDateFilter) ?: java.util.Date()
                        } catch (_: Throwable) { }
                    }
                    val year = cal.get(java.util.Calendar.YEAR)
                    val month = cal.get(java.util.Calendar.MONTH)
                    val day = cal.get(java.util.Calendar.DAY_OF_MONTH)
                    android.app.DatePickerDialog(context2, { _, y, m, d ->
                        val dd = String.format("%02d", d)
                        val mm = String.format("%02d", m + 1)
                        val newToDate = "$dd/$mm/$y"
                        
                        // Validate that to date is not earlier than from date
                        if (fromDateFilter.isNotBlank()) {
                            try {
                                val df = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
                                val fromDate = df.parse(fromDateFilter)
                                val toDate = df.parse(newToDate)
                                if (fromDate != null && toDate != null && toDate.before(fromDate)) {
                                    android.widget.Toast.makeText(context2, "תאריך סיום לא יכול להיות קטן מתאריך ההתחלה", android.widget.Toast.LENGTH_LONG).show()
                                    // Don't update the filter - keep the old valid value
                                    return@DatePickerDialog
                                }
                            } catch (_: Throwable) { }
                        }
                        toDateFilter = newToDate
                    }, year, month, day).show()
                }) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                        Text("🗓")
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = if (toDateFilter.isBlank()) "עד תאריך" else toDateFilter, 
                            fontSize = responsiveFontSize(8f),
                            color = Color.Black,
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
                // Supplier filter FAB
                val currentLabel = supplierFilterId?.let { id -> suppliers.firstOrNull { it.id == id }?.name } ?: "כל הספקים"
                androidx.compose.material3.FloatingActionButton(
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp),
                    onClick = { supplierExpanded = true }
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                        Icon(Icons.Filled.Domain, contentDescription = null)
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = currentLabel, 
                            fontSize = responsiveFontSize(8f),
                            color = Color.Black,
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
                // Status filter FAB
                val cancelledLabel = when (cancelledFilter) { "only" -> "מבוטלות"; "not" -> "פעילות"; else -> "הכל" }
                androidx.compose.material3.FloatingActionButton(
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp),
                    onClick = { cancelledExpanded = true }
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                        Text("🗂")
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = "סטטוס: $cancelledLabel", 
                            fontSize = responsiveFontSize(8f),
                            color = Color.Black,
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
                // Commission management FAB
                androidx.compose.material3.FloatingActionButton(
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp),
                    onClick = { 
                        navController.navigate("commissions_manage")
                    }
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                        Text("💰")
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = "עמלות", 
                            fontSize = responsiveFontSize(8f),
                            color = Color.Black,
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(3.dp))
        // Old toggle removed; now controlled by the % FAB in the filters row
        if (supplierExpanded) {
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { supplierExpanded = false },
                confirmButton = {},
                title = { Text("בחר ספק") },
                text = {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        androidx.compose.foundation.lazy.LazyColumn(modifier = Modifier.fillMaxWidth().height(280.dp)) {
                            item {
                                Row(modifier = Modifier.fillMaxWidth().clickable { supplierFilterId = null; supplierExpanded = false }.padding(vertical = 8.dp)) {
                                    Text("כל הספקים")
                                }
                            }
                            items(suppliers) { s ->
                                Row(modifier = Modifier.fillMaxWidth().clickable { supplierFilterId = s.id; supplierExpanded = false }.padding(vertical = 8.dp)) {
                                    Column(Modifier.weight(1f)) {
                                        Text(s.name)
                                        val sub = listOfNotNull(s.phone, s.email).joinToString(" · ")
                                        if (sub.isNotBlank()) Text(sub)
                                    }
                                }
                            }
                        }
                    }
                },
                dismissButton = {
                    androidx.compose.material3.Button(onClick = { supplierExpanded = false }) { Text("סגור") }
                }
            )
        }
        Spacer(Modifier.height(12.dp))

        if (cancelledExpanded) {
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { cancelledExpanded = false },
                confirmButton = {},
                title = { Text("סטטוס הזמנות") },
                text = {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        androidx.compose.foundation.lazy.LazyColumn(modifier = Modifier.fillMaxWidth().height(200.dp)) {
                            item {
                                Row(modifier = Modifier.fillMaxWidth().clickable { cancelledFilter = null; cancelledExpanded = false }.padding(vertical = 8.dp)) { Text("הכל") }
                            }
                            item {
                                Row(modifier = Modifier.fillMaxWidth().clickable { cancelledFilter = "only"; cancelledExpanded = false }.padding(vertical = 8.dp)) { Text("מבוטלות") }
                            }
                            item {
                                Row(modifier = Modifier.fillMaxWidth().clickable { cancelledFilter = "not"; cancelledExpanded = false }.padding(vertical = 8.dp)) { Text("פעילות") }
                            }
                        }
                    }
                },
                dismissButton = { androidx.compose.material3.Button(onClick = { cancelledExpanded = false }) { Text("סגור") } }
            )
        }
        
        // Scrollable area with reservations list (leaves space for summary at bottom)
        androidx.compose.foundation.layout.Box(modifier = Modifier.weight(1f).padding(bottom = 62.dp)) {
            val itemsUi = filtered.map { r ->
                val cust = customers.find { it.id == r.customerId }
                val fullName = listOfNotNull(cust?.firstName, cust?.lastName).joinToString(" ").ifBlank { "—" }
                val dfDt = java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", java.util.Locale.getDefault())
                val from = dfDt.format(java.util.Date(r.dateFrom))
                val to = dfDt.format(java.util.Date(r.dateTo))
                val supplierName = suppliers.find { it.id == r.supplierId }?.name ?: "—"
                val usePlane = (r.notes ?: "").contains("נתב\"ג") || r.airportMode
                ReservationListItem(
                    reservationId = r.id,
                    title = "· ${r.id} · ${fullName}",
                    subtitle = "$from - $to",
                    price = supplierName,
                    supplierOrderNumber = r.supplierOrderNumber,
                    dateFromMillis = r.dateFrom,
                    isCancelled = r.status == com.rentacar.app.data.ReservationStatus.Cancelled,
                    isClosed = (r.actualReturnDate != null),
                    usePlaneIcon = usePlane,
                    isQuote = r.isQuote
                )
            }
            androidx.compose.foundation.lazy.LazyColumn {
                items(itemsUi, key = { item -> item.reservationId ?: (item.title + (item.subtitle ?: "")).hashCode().toLong() }) { item ->
                    com.rentacar.app.ui.components.ReservationListRow(
                        item = item,
                        onClick = {
                            val id = item.reservationId
                            if (id != null) navController.navigate("edit_reservation/$id")
                        }
                    )
                }
                }
            }
        }

        // Summary row at bottom - outside padding, aligned to bottom and centered
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter),
            contentAlignment = Alignment.Center
        ) {
            ReservationsSummaryRow(
                reservations = filtered,
                activeStatusFilter = activeStatusFilter,
                activeClosedFilter = activeClosedFilter,
                onFilterClick = { status, isClosed ->
                    when {
                        // Toggle off if already active
                        status != null && activeStatusFilter == status -> {
                            activeStatusFilter = null
                        }
                        isClosed && activeClosedFilter == true -> {
                            activeClosedFilter = null
                        }
                        // Toggle off if "סה״כ" clicked
                        status == null && !isClosed -> {
                            activeStatusFilter = null
                            activeClosedFilter = null
                        }
                        // Set new filter
                        status != null -> {
                            activeStatusFilter = status
                            activeClosedFilter = null
                        }
                        isClosed -> {
                            activeClosedFilter = true
                            activeStatusFilter = null
                        }
                    }
                }
            )
        }
    }
}

@Composable
fun ReservationsSummaryRow(
    reservations: List<Reservation>,
    activeStatusFilter: ReservationStatus?,
    activeClosedFilter: Boolean?,
    onFilterClick: (status: ReservationStatus?, isClosed: Boolean) -> Unit
) {
    val confirmed = reservations.count { it.status == ReservationStatus.Confirmed && !it.isClosed }
    val paid = reservations.count { it.status == ReservationStatus.Paid && !it.isClosed }
    val draft = reservations.count { it.status == ReservationStatus.Draft }
    val cancelled = reservations.count { it.status == ReservationStatus.Cancelled }
    val closed = reservations.count { it.isClosed }
    val total = reservations.size
    
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        SummaryChip(
            label = "אושר",
            count = confirmed,
            color = Color(0xFF4CAF50),
            emoji = "✅",
            isActive = activeStatusFilter == ReservationStatus.Confirmed,
            onClick = { onFilterClick(ReservationStatus.Confirmed, false) }
        )
        SummaryChip(
            label = "שולם",
            count = paid,
            color = Color(0xFFFF9800),
            emoji = "💰",
            isActive = activeStatusFilter == ReservationStatus.Paid,
            onClick = { onFilterClick(ReservationStatus.Paid, false) }
        )
        SummaryChip(
            label = "טיוטה",
            count = draft,
            color = Color(0xFF2196F3),
            emoji = "📝",
            isActive = activeStatusFilter == ReservationStatus.Draft,
            onClick = { onFilterClick(ReservationStatus.Draft, false) }
        )
        SummaryChip(
            label = "בוטל",
            count = cancelled,
            color = Color(0xFFF44336),
            emoji = "❌",
            isActive = activeStatusFilter == ReservationStatus.Cancelled,
            onClick = { onFilterClick(ReservationStatus.Cancelled, false) }
        )
        SummaryChip(
            label = "נסגר",
            count = closed,
            color = Color(0xFF607D8B),
            emoji = "🔒",
            isActive = activeClosedFilter == true,
            onClick = { onFilterClick(null, true) }
        )
        SummaryChip(
            label = "סה״כ",
            count = total,
            color = Color(0xFF9E9E9E),
            emoji = "🧮",
            isActive = activeStatusFilter == null && activeClosedFilter == null,
            onClick = { onFilterClick(null, false) }
        )
    }
}

@Composable
fun ReservationSummaryChip(
    label: String,
    count: Int,
    color: androidx.compose.ui.graphics.Color,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    isActive: Boolean = false,
    onClick: () -> Unit = {}
) {
    Box(
        modifier = Modifier
            .width(51.dp)
            .height(58.dp)
            .clickable(onClick = onClick)
            .background(color.copy(alpha = 0.15f), RoundedCornerShape(10.dp))
            .then(
                if (isActive) {
                    Modifier.border(
                        width = 1.dp,
                        color = androidx.compose.ui.graphics.Color.Black,
                        shape = RoundedCornerShape(10.dp)
                    )
                } else {
                    Modifier
                }
            )
            .padding(3.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(vertical = 2.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(14.dp)
            )
            androidx.compose.foundation.layout.Spacer(Modifier.height(1.dp))
            Text(
                text = count.toString(),
                color = color,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                fontSize = 13.sp,
                lineHeight = 14.sp
            )
            androidx.compose.foundation.layout.Spacer(Modifier.height(1.dp))
            Text(
                text = label,
                style = androidx.compose.material3.MaterialTheme.typography.labelSmall,
                color = color,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                maxLines = 1,
                fontSize = 7.sp,
                lineHeight = 8.sp
            )
        }
    }
}
