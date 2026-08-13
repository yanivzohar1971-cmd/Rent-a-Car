package com.rentacar.app.ui.screens

import android.widget.Toast
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.ContactEmergency
import androidx.compose.material.icons.filled.Domain
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Phone
import androidx.compose.foundation.Canvas
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Save
 
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
 
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Store
import androidx.compose.material.icons.filled.Today
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.ui.text.input.VisualTransformation
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import androidx.compose.material3.RadioButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag

import androidx.compose.ui.text.TextStyle
 
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalConfiguration
import androidx.navigation.NavHostController
import com.rentacar.app.LocalButtonColor
import com.rentacar.app.LocalTitleColor
import com.rentacar.app.data.Customer
import com.rentacar.app.pdf.PdfGenerator
import com.rentacar.app.prefs.SettingsStore
import com.rentacar.app.share.ShareService
import com.rentacar.app.share.ShareLanguage
import com.rentacar.app.ui.components.AppButton
import com.rentacar.app.ui.components.ListItemModel
import com.rentacar.app.ui.components.ReservationListItem
import com.rentacar.app.ui.components.ReservationsList
import com.rentacar.app.ui.components.StandardList
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.ui.navigation.Routes
import com.rentacar.app.ui.vm.CustomerViewModel
import com.rentacar.app.ui.vm.ReservationViewModel
import kotlinx.coroutines.flow.firstOrNull
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.math.roundToInt

fun diffDays(start: Long, end: Long): Int {
    return TimeUnit.MILLISECONDS.toDays(end - start).toInt()
}

// Helper function to calculate responsive font size based on screen density
@Composable
fun responsiveFontSize(baseSize: Float): androidx.compose.ui.unit.TextUnit {
    val configuration = LocalConfiguration.current
    val density = configuration.densityDpi
    val scaleFactor = when {
        density <= 160 -> 0.8f  // ldpi
        density <= 240 -> 0.9f  // mdpi
        density <= 320 -> 1.0f  // hdpi
        density <= 480 -> 1.1f  // xhdpi
        density <= 640 -> 1.2f  // xxhdpi
        else -> 1.3f            // xxxhdpi and above
    }
    return (baseSize * scaleFactor).sp
}

@Composable
fun DashboardScreen(navController: NavHostController, vm: ReservationViewModel) {
    val context = LocalContext.current
    val appContext = context.applicationContext
    val reservations by vm.reservationList.collectAsState()
    val allReservations by vm.allReservations.collectAsState()
    val customers by vm.customerList.collectAsState()
    val suppliers by vm.suppliers.collectAsState()
    
    // Debug: Log when reservations change
    LaunchedEffect(reservations) {
        android.util.Log.d("Dashboard", "Reservations updated: ${reservations.size} items")
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        // Top gradient label bar with car icon
        androidx.compose.foundation.layout.Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(Color(0xFFFFEB3B), Color(0xFF4CAF50))
                    )
                )
                .padding(vertical = 8.dp),
            contentAlignment = Alignment.Center
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(imageVector = Icons.Filled.DirectionsCar, contentDescription = null, tint = Color.White)
                Spacer(Modifier.width(8.dp))
                Text("IDAN CAR EXPERT", color = Color.White)
            }
        }
        TitleBar(
            title = "מסך ראשי",
            color = LocalTitleColor.current,
            onSettingsClick = { navController.navigate(Routes.Settings) }
            // REMARK: Previous logo at the end of the title bar. Uncomment to restore.
            // , endPlainContent = {
            //     androidx.compose.foundation.Image(
            //         painter = androidx.compose.ui.res.painterResource(id = com.rentacar.app.R.drawable.ic_launcher_foreground),
            //         contentDescription = "לוגו",
            //         modifier = Modifier.size(70.dp)
            //     )
            // }
        )
        Spacer(Modifier.height(12.dp))

        Spacer(Modifier.height(12.dp))
        val df = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
        val dfDt = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault())
        val ctxVat = LocalContext.current
        val vatStore = remember(ctxVat) { SettingsStore(ctxVat) }
        val vatDefaultStr = vatStore.decimalOnePlace().collectAsState(initial = "17.0").value
        val vatDefault = vatDefaultStr.toDoubleOrNull() ?: 17.0
        val itemsUi = reservations.map { r ->
            val cust = customers.find { it.id == r.customerId }
            val fullName = listOfNotNull(cust?.firstName, cust?.lastName).joinToString(" ").ifBlank { "—" }
            val from = dfDt.format(java.util.Date(r.dateFrom))
            val to = dfDt.format(java.util.Date(r.dateTo))
            val supplierName = suppliers.find { it.id == r.supplierId }?.name ?: "—"
            val days = diffDays(r.dateFrom, r.dateTo).coerceAtLeast(1)
            val vatPct = r.vatPercentAtCreation ?: vatDefault
            val basePrice = if (r.includeVat) r.agreedPrice / (1 + vatPct / 100.0) else r.agreedPrice
            val commissionAmount = com.rentacar.app.domain.CommissionCalculator.calculate(days, basePrice).amount
            val usePlane = (r.notes ?: "").contains("נתב\"ג") || r.airportMode
            ReservationListItem(
                reservationId = r.id,
                title = "· ${r.id} · ${fullName}",
                subtitle = "$from - $to",
                price = supplierName,
                supplierOrderNumber = r.supplierOrderNumber,
                dateFromMillis = r.dateFrom,
                isClosed = (r.actualReturnDate != null),
                usePlaneIcon = usePlane,
                isQuote = r.isQuote,
                commissionText = "עמלה: ₪${"%.0f".format(commissionAmount)}"
            )
        }
        androidx.compose.foundation.layout.Box(modifier = Modifier.weight(1f)) {
            ReservationsList(itemsUi) { item ->
                val id = item.reservationId
                if (id != null) navController.navigate("edit_reservation/$id")
            }
        }
        Spacer(Modifier.height(12.dp))
        // All buttons in one row with equal weights for responsive design
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            val newEnabled = suppliers.isNotEmpty()
            val manageEnabled = !(suppliers.isEmpty() && allReservations.isEmpty())
            
            // Button 1: הזמנה
            androidx.compose.material3.FloatingActionButton(
                modifier = Modifier
                    .weight(1f)
                    .height(64.dp)
                    .alpha(if (newEnabled) 1f else 0.3f),
                onClick = { if (newEnabled) navController.navigate(Routes.NewReservation) }
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Icon(imageVector = Icons.Filled.DirectionsCar, contentDescription = null, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = "הזמנה", 
                        fontSize = responsiveFontSize(8f),
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }
            
            // Button 2: ניהול
            androidx.compose.material3.FloatingActionButton(
                modifier = Modifier
                    .weight(1f)
                    .height(64.dp)
                    .alpha(if (manageEnabled) 1f else 0.3f),
                onClick = { if (manageEnabled) navController.navigate(Routes.ReservationsManage) }
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Icon(imageVector = Icons.Filled.DirectionsCar, contentDescription = null, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = "ניהול", 
                        fontSize = responsiveFontSize(8f),
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }
            
            // Button 3: בקשות
            androidx.compose.material3.FloatingActionButton(
                modifier = Modifier
                    .weight(1f)
                    .height(64.dp),
                onClick = { navController.navigate(com.rentacar.app.ui.navigation.Routes.Requests) }
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Text("📥")
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = "בקשות", 
                        fontSize = responsiveFontSize(8f),
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }
            
            // Button 4: לקוח
            androidx.compose.material3.FloatingActionButton(
                modifier = Modifier
                    .weight(1f)
                    .height(64.dp),
                onClick = {
                    if (customers.isEmpty()) {
                        navController.navigate(Routes.CustomerEdit)
                    } else {
                        navController.navigate(Routes.Customers)
                    }
                }
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Icon(imageVector = Icons.Filled.Person, contentDescription = null, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = "לקוח", 
                        fontSize = responsiveFontSize(8f),
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }
            
            // Button 5: סוכן
            androidx.compose.material3.FloatingActionButton(
                modifier = Modifier
                    .weight(1f)
                    .height(64.dp),
                onClick = { navController.navigate(Routes.Agents) }
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Icon(imageVector = Icons.Filled.ContactEmergency, contentDescription = null, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = "סוכן", 
                        fontSize = responsiveFontSize(8f),
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }
            
            // Button 6: ספק
            androidx.compose.material3.FloatingActionButton(
                modifier = Modifier
                    .weight(1f)
                    .height(64.dp)
                    .testTag(com.rentacar.app.emailimport.debug.EmailImportUiTags.SUPPLIERS_TAB),
                onClick = { 
                    if (suppliers.isEmpty()) {
                        navController.navigate(Routes.SupplierEdit)
                    } else {
                        navController.navigate(Routes.Suppliers)
                    }
                },
                containerColor = if (suppliers.isEmpty()) Color(0xFFFFC1B6) else androidx.compose.material3.FloatingActionButtonDefaults.containerColor
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Icon(imageVector = Icons.Filled.Domain, contentDescription = null, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = "ספק", 
                        fontSize = responsiveFontSize(8f),
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }
        }
    }
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewReservationScreen(
    navController: NavHostController,
    vm: ReservationViewModel,
    customerVm: CustomerViewModel,
    prefillCustomerId: Long? = null,
    editReservationId: Long? = null
) {
    var firstName by rememberSaveable { mutableStateOf("") }
    var lastName by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var isQuote by rememberSaveable { mutableStateOf(false) }
    var tzId by rememberSaveable { mutableStateOf("") }
    var address by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }

    var price by rememberSaveable { mutableStateOf("") }
    var kmIncluded by rememberSaveable { mutableStateOf("") }
    var holdAmount by rememberSaveable { mutableStateOf("4500") }

    val customerSearchFocus = remember { FocusRequester() }
    val priceFocus = remember { FocusRequester() }
    val kmFocus = remember { FocusRequester() }
    val supplierFocus = remember { FocusRequester() }
    val branchFocus = remember { FocusRequester() }

    var fromDateMillis by rememberSaveable { mutableStateOf<Long?>(null) }
    var toDateMillis by rememberSaveable { mutableStateOf<Long?>(null) }
    var fromHour by rememberSaveable { mutableStateOf(10) }
    var fromMinute by rememberSaveable { mutableStateOf(0) }
    var toHour by rememberSaveable { mutableStateOf(10) }
    var toMinute by rememberSaveable { mutableStateOf(0) }
    var showFromDatePicker by rememberSaveable { mutableStateOf(false) }
    var showToDatePicker by rememberSaveable { mutableStateOf(false) }
    var showFromTimePicker by rememberSaveable { mutableStateOf(false) }
    var showToTimePicker by rememberSaveable { mutableStateOf(false) }
    var endDateManuallySet by rememberSaveable { mutableStateOf(false) }
    var showConfirmCancel by rememberSaveable { mutableStateOf(false) }
    var showConfirmRestore by rememberSaveable { mutableStateOf(false) }
    var isCancelledLocal by rememberSaveable { mutableStateOf(false) }
    var endTimeManuallySet by rememberSaveable { mutableStateOf(false) }
    var actualReturnDateMillis by rememberSaveable { mutableStateOf<Long?>(null) }
    var showActualReturnDatePicker by rememberSaveable { mutableStateOf(false) }
    // Global toggles used across the form; must be declared before LaunchedEffect that assigns them
    var includeVat by rememberSaveable { mutableStateOf(true) }
    var airportMode by rememberSaveable { mutableStateOf(false) }

    var searchQuery by rememberSaveable { mutableStateOf("") }
    var debouncedQuery by remember { mutableStateOf("") }
    
    // Debounce search query
    LaunchedEffect(searchQuery) {
        kotlinx.coroutines.delay(300)
        debouncedQuery = searchQuery
    }
    
    val allCustomers by customerVm.list.collectAsState()
    
    // Apply search filter
    val customers by remember(debouncedQuery, allCustomers) {
        androidx.compose.runtime.derivedStateOf {
            if (debouncedQuery.trim().isEmpty()) {
                allCustomers
            } else {
                val q = debouncedQuery.trim().lowercase()
                allCustomers.filter { customer ->
                    val fullName = "${customer.firstName} ${customer.lastName}".lowercase()
                    val phone = (customer.phone ?: "").lowercase()
                    val idNumber = (customer.tzId ?: "").lowercase()
                    
                    fullName.contains(q) || 
                    phone.contains(q) || 
                    idNumber.contains(q)
                }
            }
        }
    }

    var selectedCustomerId by rememberSaveable { mutableStateOf<Long?>(null) }
    var selectedCustomer by remember { mutableStateOf<Customer?>(null) }
    var showHistory by rememberSaveable { mutableStateOf(false) }

    var showCardFields by rememberSaveable { mutableStateOf(false) }
    var cardNumber by rememberSaveable { mutableStateOf("") }
    var cardExpiry by rememberSaveable { mutableStateOf("") }
    var cardCvv by rememberSaveable { mutableStateOf("") }
    var cardHolderFirst by rememberSaveable { mutableStateOf("") }
    var cardHolderLast by rememberSaveable { mutableStateOf("") }
    var cardHolderTz by rememberSaveable { mutableStateOf("") }

    var supplierOrderNumber by rememberSaveable { mutableStateOf("") }
    var carTypeText by rememberSaveable { mutableStateOf("") }
    var notes by rememberSaveable { mutableStateOf("") }

    var periodTypeDays by rememberSaveable { mutableStateOf<Int?>(null) }
    var showPeriodMenu by rememberSaveable { mutableStateOf(false) }
    val periodFocus = remember { FocusRequester() }

    val suppliers by vm.suppliers.collectAsState()
    val carTypes by vm.carTypes.collectAsState()
    val allReservations by vm.allReservations.collectAsState()
    var selectedBranchId by rememberSaveable { mutableStateOf<Long?>(null) }
    var selectedSupplierId by rememberSaveable { mutableStateOf<Long?>(null) }
    var selectedAgentId by rememberSaveable { mutableStateOf<Long?>(null) }
    val appContext = LocalContext.current.applicationContext

    val effectiveCustomerId = selectedCustomerId ?: prefillCustomerId

    LaunchedEffect(Unit) {
        val handle = navController.currentBackStackEntry?.savedStateHandle
        val pickedSupplierId = handle?.get<Long>("picked_supplier_id")
        if (pickedSupplierId != null) {
            selectedSupplierId = pickedSupplierId
            selectedBranchId = null
            handle.remove<Long>("picked_supplier_id")
        }
        // Prefill from Requests screen (from previous back stack entry)
        val prev = navController.previousBackStackEntry?.savedStateHandle
        prev?.get<String>("prefill_first")?.let { v -> if (firstName.isBlank()) firstName = v }
        prev?.get<String>("prefill_last")?.let { v -> if (lastName.isBlank()) lastName = v }
        prev?.get<String>("prefill_phone")?.let { v -> if (phone.isBlank()) phone = v }
        prev?.get<String>("prefill_carType")?.let { v -> if (carTypeText.isBlank()) carTypeText = v }
        prev?.get<Boolean>("prefill_isQuote")?.let { v -> isQuote = v }
    }

    val prefillCustomer = prefillCustomerId?.let { customerVm.customer(it).collectAsState(initial = null).value }
    val editReservation = editReservationId?.let { vm.reservation(it).collectAsState(initial = null).value }
    var appliedPrefill by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(prefillCustomerId, prefillCustomer, editReservationId, editReservation) {
        if (!appliedPrefill && prefillCustomerId != null && prefillCustomer != null) {
            selectedCustomerId = prefillCustomerId
            selectedCustomer = prefillCustomer
            firstName = prefillCustomer.firstName
            lastName = prefillCustomer.lastName
            phone = prefillCustomer.phone
            tzId = prefillCustomer.tzId ?: ""
            address = prefillCustomer.address ?: ""
            email = prefillCustomer.email ?: ""
            appliedPrefill = true
        } else if (!appliedPrefill && editReservation != null) {
            selectedCustomerId = editReservation.customerId
            val existingCustomer = customerVm.customer(editReservation.customerId).firstOrNull()
            existingCustomer?.let { c ->
                selectedCustomer = c
                firstName = c.firstName
                lastName = c.lastName
                phone = c.phone
                tzId = c.tzId ?: ""
                address = c.address ?: ""
                email = c.email ?: ""
                if (!c.isCompany) {
                    cardHolderFirst = c.firstName
                    cardHolderLast = c.lastName
                    cardHolderTz = c.tzId ?: ""
                }
            }
            selectedAgentId = editReservation.agentId
            selectedSupplierId = editReservation.supplierId
            selectedBranchId = editReservation.branchId
            periodTypeDays = editReservation.periodTypeDays
            supplierOrderNumber = editReservation.supplierOrderNumber ?: ""
            val startCal = Calendar.getInstance().apply { timeInMillis = editReservation.dateFrom }
            fromDateMillis = editReservation.dateFrom
            fromHour = startCal.get(Calendar.HOUR_OF_DAY)
            fromMinute = startCal.get(Calendar.MINUTE)
            val endCal = Calendar.getInstance().apply { timeInMillis = editReservation.dateTo }
            toDateMillis = editReservation.dateTo
            toHour = endCal.get(Calendar.HOUR_OF_DAY)
            toMinute = endCal.get(Calendar.MINUTE)
            endDateManuallySet = true
            endTimeManuallySet = true
            price = editReservation.agreedPrice.toInt().toString()
            kmIncluded = editReservation.kmIncluded.toString()
            holdAmount = editReservation.requiredHoldAmount.toString()
            carTypeText = editReservation.carTypeName ?: ""
            notes = editReservation.notes ?: ""
            actualReturnDateMillis = editReservation.actualReturnDate
            includeVat = editReservation.includeVat
            airportMode = editReservation.airportMode
            isQuote = editReservation.isQuote
            appliedPrefill = true
            isCancelledLocal = (editReservation.status == com.rentacar.app.data.ReservationStatus.Cancelled)
        }
    }

    val bgColor = when {
        isCancelledLocal || (editReservation?.status == com.rentacar.app.data.ReservationStatus.Cancelled) || (editReservation?.isClosed == true) -> Color(0xFFFFC1B6)
        (actualReturnDateMillis != null) || (editReservation?.actualReturnDate != null) -> Color(0xFFEEEEEE)
        else -> Color.Transparent
    }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(bgColor)
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.Top,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        val customerTitle = if (selectedCustomer != null) " - ${selectedCustomer!!.firstName} ${selectedCustomer!!.lastName}" else ""
        val reservationIdTitle = if (editReservation != null) " #${editReservation.id}" else ""
        TitleBar(
            if (editReservationId == null) "הזמנה חדשה" else ("עריכת הזמנה$reservationIdTitle$customerTitle"),
            LocalTitleColor.current,
            onHomeClick = { navController.navigate(Routes.Dashboard) }
        )
        Spacer(Modifier.height(16.dp))

        // בחירת/הוספת לקוח (מופיע בכל מצב כאשר אין לקוח נבחר)
        if (selectedCustomerId == null) {
            Text("בחר/י לקוח קיים או הוסיף/י חדש")
                Spacer(Modifier.height(8.dp))
                
                // Modern search bar
                com.rentacar.app.ui.components.AppSearchBar(
                    query = searchQuery,
                    onQueryChange = { searchQuery = it },
                    placeholder = "חיפוש לקוח לפי שם, טלפון או ת.ז...",
                    modifier = Modifier.focusRequester(customerSearchFocus)
                )
                
                Spacer(Modifier.height(8.dp))
                
                // Show list or empty state
                if (customers.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp)
                    ) {
                        com.rentacar.app.ui.components.AppEmptySearchState(
                            message = if (debouncedQuery.isNotEmpty()) {
                                "לא נמצאו תוצאות תואמות לחיפוש שלך."
                            } else {
                                "אין נתונים להצגה."
                            }
                        )
                    }
                } else {
                    val contextForColors = LocalContext.current
                    val storeForColors = remember { SettingsStore(contextForColors) }
                    val privateHex = storeForColors.customerPrivateColor().collectAsState(initial = "#2196F3").value
                    val companyHex = storeForColors.customerCompanyColor().collectAsState(initial = "#4CAF50").value
                    val itemsUiCustomer = customers.map { c ->
                        val full = listOfNotNull(c.firstName, c.lastName).joinToString(" ")
                        val meta = c.phone
                        val tint = Color(android.graphics.Color.parseColor(if (c.isCompany) companyHex else privateHex))
                        ListItemModel(id = c.id, title = full, subtitle = c.email ?: c.tzId ?: "", meta = meta ?: "", icon = Icons.Filled.Person, iconTint = tint)
                    }
                    StandardList(
                        items = itemsUiCustomer,
                        onItemClick = { item ->
                            val idx = itemsUiCustomer.indexOf(item)
                            val c = customers.getOrNull(idx)
                            if (c != null) {
                                selectedCustomerId = c.id
                                selectedCustomer = c
                                firstName = c.firstName
                                lastName = c.lastName
                                phone = c.phone
                                tzId = c.tzId ?: ""
                                address = c.address ?: ""
                                email = c.email ?: ""
                            }
                        },
                        modifier = Modifier.fillMaxWidth().height(180.dp),
                        isSelected = { item ->
                            val idx = itemsUiCustomer.indexOf(item)
                            val c = customers.getOrNull(idx)
                            c?.id == selectedCustomerId
                        }
                    )
                }
            
            Spacer(Modifier.height(12.dp))

            // טופס הוספת לקוח חדש
            var attemptedCustomerSave by rememberSaveable { mutableStateOf(false) }
            var isCompanyNew by rememberSaveable { mutableStateOf(false) }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { isCompanyNew = false }) {
                    RadioButton(selected = !isCompanyNew, onClick = { isCompanyNew = false })
                    Text("פרטי", modifier = Modifier.padding(start = 6.dp))
                }
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { isCompanyNew = true }) {
                    RadioButton(selected = isCompanyNew, onClick = { isCompanyNew = true })
                    Text("חברה", modifier = Modifier.padding(start = 6.dp))
                }
            }
            Spacer(Modifier.height(8.dp))
            val firstNameHasError = attemptedCustomerSave && firstName.isBlank()
            OutlinedTextField(
                firstName,
                { firstName = it },
                label = { Text(if (isCompanyNew) "שם חברה *" else "שם פרטי *") },
                singleLine = true,
                isError = firstNameHasError,
                colors = TextFieldDefaults.outlinedTextFieldColors(
                    containerColor = if (firstNameHasError) Color(0xFFFFC1B6) else Color.Unspecified
                ),
                modifier = Modifier.fillMaxWidth(),
                textStyle = TextStyle(fontSize = responsiveFontSize(18f)),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Text)
            )
            Spacer(Modifier.height(8.dp))
            if (!isCompanyNew) {
                val lastNameHasError = attemptedCustomerSave && lastName.isBlank()
                OutlinedTextField(
                    lastName,
                    { lastName = it },
                    label = { Text("שם משפחה *") },
                    singleLine = true,
                    isError = lastNameHasError,
                    colors = TextFieldDefaults.outlinedTextFieldColors(
                        containerColor = if (lastNameHasError) Color(0xFFFFC1B6) else Color.Unspecified
                    ),
                    modifier = Modifier.fillMaxWidth(),
                    textStyle = TextStyle(fontSize = responsiveFontSize(18f)),
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Text)
                )
                Spacer(Modifier.height(8.dp))
            }
            val phoneHasError = attemptedCustomerSave && phone.isBlank()
            OutlinedTextField(
                phone,
                { phone = it },
                label = { Text("טלפון *") },
                singleLine = true,
                isError = phoneHasError,
                colors = TextFieldDefaults.outlinedTextFieldColors(
                    containerColor = if (phoneHasError) Color(0xFFFFC1B6) else Color.Unspecified
                ),
                modifier = Modifier.fillMaxWidth(),
                textStyle = TextStyle(fontSize = responsiveFontSize(18f)),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Phone)
            )
            Spacer(Modifier.height(8.dp))
            val tzIdHasError = attemptedCustomerSave && tzId.isBlank()
            OutlinedTextField(
                tzId,
                { tzId = it },
                label = { Text((if (isCompanyNew) "ח.פ." else "ת" + "ז") + " *") },
                singleLine = true,
                isError = tzIdHasError,
                colors = TextFieldDefaults.outlinedTextFieldColors(
                    containerColor = if (tzIdHasError) Color(0xFFFFC1B6) else Color.Unspecified
                ),
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(address, { address = it }, label = { Text("כתובת") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = email,
                onValueChange = { new ->
                    val allowed: (Char) -> Boolean = { ch ->
                        (ch in 'a'..'z') || (ch in 'A'..'Z') || ch.isDigit() || ch in setOf('@', '.', '_', '-', '+', '\'')
                    }
                    email = new.filter(allowed)
                },
                label = { Text("Email", textAlign = TextAlign.End, modifier = Modifier.fillMaxWidth()) },
                singleLine = true,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Email),
                textStyle = TextStyle(textDirection = TextDirection.Ltr),
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            androidx.compose.material3.FloatingActionButton(onClick = {
                val valid = firstName.isNotBlank() && phone.isNotBlank() && tzId.isNotBlank() && (if (isCompanyNew) true else lastName.isNotBlank())
                if (!valid) { attemptedCustomerSave = true; return@FloatingActionButton }
                val newCustomer = Customer(
                    firstName = firstName,
                    lastName = if (isCompanyNew) "" else lastName,
                    phone = phone,
                    tzId = tzId.ifBlank { null },
                    isCompany = isCompanyNew,
                    address = address.ifBlank { null },
                    email = email.ifBlank { null }
                )
                customerVm.save(newCustomer, onDone = { id ->
                    selectedCustomerId = id
                    selectedCustomer = Customer(
                        id = id,
                        firstName = firstName,
                        lastName = if (isCompanyNew) "" else lastName,
                        phone = phone,
                        tzId = tzId.ifBlank { null },
                        isCompany = isCompanyNew,
                        address = address.ifBlank { null },
                        email = email.ifBlank { null }
                    )
                    firstName = ""
                    lastName = ""
                    phone = ""
                    tzId = ""
                    address = ""
                    email = ""
                }, onError = { msg ->
                    android.widget.Toast.makeText(appContext, msg, android.widget.Toast.LENGTH_SHORT).show()
                })
            }) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Icon(imageVector = Icons.Filled.Person, contentDescription = null)
                    Spacer(Modifier.height(2.dp))
                    Text("שמור", fontSize = responsiveFontSize(8f))
                }
            }
            }

            if (attemptedCustomerSave && (firstName.isBlank() || phone.isBlank() || (!isCompanyNew && lastName.isBlank()))) {
                Spacer(Modifier.height(4.dp))
                Text(if (isCompanyNew) "יש למלא שם חברה וטלפון" else "יש למלא שם פרטי, שם משפחה וטלפון", color = Color(0xFFB00020))
            }
            Spacer(Modifier.height(12.dp))
        }

        // Agent inline selection state (moved up so we can place the FAB in the name row)
        val agentsInline = vm.agents.collectAsState().value
        val selectedAgentObjInline = agentsInline.firstOrNull { it.id == selectedAgentId }
        var showAgentDialogInline by rememberSaveable { mutableStateOf(false) }

        val nameLine = listOfNotNull(selectedCustomer?.firstName, selectedCustomer?.lastName).joinToString(" ")
        if (nameLine.isNotBlank() || selectedCustomer?.phone != null) {
            val contextForColorsTop = LocalContext.current
            val storeForColorsTop = remember { SettingsStore(contextForColorsTop) }
            val privateHexTop = storeForColorsTop.customerPrivateColor().collectAsState(initial = "#2196F3").value
            val companyHexTop = storeForColorsTop.customerCompanyColor().collectAsState(initial = "#4CAF50").value
            val tintTop = Color(android.graphics.Color.parseColor(if (selectedCustomer?.isCompany == true) companyHexTop else privateHexTop))
            // שורת שם הלקוח
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(imageVector = Icons.Filled.Person, contentDescription = null, tint = tintTop)
                    Spacer(Modifier.width(6.dp))
                    Text(
                        "לקוח: $nameLine (${selectedCustomer?.phone ?: ""})",
                        style = TextStyle(textDirection = TextDirection.Rtl)
                    )
                    if (selectedCustomerId != null) {
                        Spacer(Modifier.width(8.dp))
                        IconButton(onClick = {
                            selectedCustomerId = null
                            selectedCustomer = null
                            firstName = ""; lastName = ""; phone = ""; tzId = ""; address = ""; email = ""
                        }) {
                            Icon(Icons.Filled.Close, contentDescription = "נקה לקוח")
                        }
                    }
                }
            }
            
            // שורת כפתורים - חייג וסוכן
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // כפתור חייג
                if (selectedCustomer != null && selectedCustomer!!.phone.isNotBlank()) {
                    val context = LocalContext.current
                    androidx.compose.material3.FloatingActionButton(
                        onClick = {
                            val intent = Intent(Intent.ACTION_DIAL).apply {
                                data = Uri.parse("tel:${selectedCustomer!!.phone}")
                            }
                            context.startActivity(intent)
                        }
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                            Icon(imageVector = Icons.Filled.Phone, contentDescription = "חייג ללקוח", modifier = Modifier.size(20.dp))
                            Spacer(Modifier.height(2.dp))
                            Text("חייג", fontSize = responsiveFontSize(10f))
                        }
                    }
                }
                
                // כפתור סוכן
                val agentEnabled = agentsInline.isNotEmpty()
                androidx.compose.material3.FloatingActionButton(
                    onClick = { if (agentEnabled) showAgentDialogInline = true },
                    modifier = Modifier.alpha(if (agentEnabled) 1f else 0.4f)
                ) {
                    val agentName = selectedAgentObjInline?.name ?: "—"
                    val agentPhone = selectedAgentObjInline?.phone ?: ""
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                        Icon(imageVector = Icons.Filled.ContactEmergency, contentDescription = null, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.height(2.dp))
                        Text(agentName, fontSize = responsiveFontSize(10f))
                        if (agentPhone.isNotBlank()) Text(agentPhone, fontSize = responsiveFontSize(10f))
                    }
                }
                
                // כפתור סוג הזמנה
                val periodBtnBgTop = if (periodTypeDays == null) Color(0xFFFFC1B6) else LocalButtonColor.current
                val periodTitle = when (periodTypeDays) { 1 -> "יומי"; 7 -> "שבועי"; 30 -> "חודשי"; else -> "סוג הזמנה *" }
                androidx.compose.material3.FloatingActionButton(
                    onClick = { showPeriodMenu = true },
                    containerColor = periodBtnBgTop
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                        Text("🗓")
                        Spacer(Modifier.height(2.dp))
                        Text(periodTitle, fontSize = responsiveFontSize(10f))
                    }
                }
            }
            if (showAgentDialogInline) {
                AgentPickerDialog(
                    agents = agentsInline,
                    onDismiss = { showAgentDialogInline = false },
                    onSelect = { aid -> selectedAgentId = aid; showAgentDialogInline = false }
                )
            }
            
        }

        if (selectedCustomerId != null) {
            // Keep spacing consistent with other fields
            Spacer(Modifier.height(8.dp))
            // ספק
            var showSupplierPicker by rememberSaveable { mutableStateOf(false) }
            val selectedSupplierName = suppliers.firstOrNull { it.id == selectedSupplierId }?.name
            val supplierBtnBg = if (selectedSupplierId == null) Color(0xFFFFC1B6) else LocalButtonColor.current
            // Precompute branches info for display in FABs below
            val branches = selectedSupplierId?.let { vm.branchesBySupplier(it).collectAsState(initial = emptyList()).value } ?: emptyList()
            val selectedBranchObj = branches.firstOrNull { it.id == selectedBranchId }
            val selectedBranchName = selectedBranchObj?.let { b ->
                b.city?.trim()?.ifBlank { "—" } ?: "—"
            } ?: if (branches.isEmpty()) "אין סניפים (הוסף)" else "בחר סניף"
            var showBranchDialog by rememberSaveable { mutableStateOf(false) }
            val branchBtnBg = if (!airportMode && selectedBranchId == null) Color(0xFFFFC1B6) else LocalButtonColor.current
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    // Supplier FAB (match branch height: two text lines allowed)
                    androidx.compose.material3.FloatingActionButton(
                        onClick = { showSupplierPicker = true },
                        containerColor = supplierBtnBg,
                        modifier = Modifier.focusRequester(supplierFocus)
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp).height(56.dp)) {
                            Icon(imageVector = Icons.Filled.Domain, contentDescription = null, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.height(2.dp))
                            val supLine1 = if (selectedSupplierId == null) "ספק *" else (selectedSupplierName ?: "—")
                            Text(supLine1, fontSize = responsiveFontSize(10f))
                            // Second line spacer to visually match two-line branch when selected
                            Spacer(Modifier.height(0.dp))
                        }
                    }
                    if (selectedSupplierId != null) {
                        androidx.compose.material3.IconButton(onClick = { selectedSupplierId = null; selectedBranchId = null }) {
                            Icon(imageVector = Icons.Filled.Close, contentDescription = "נקה ספק")
                        }
                    }
                    // Branch FAB (to the right of supplier)
                    val branchEnabled = (selectedSupplierId != null) && !airportMode
                    androidx.compose.material3.FloatingActionButton(
                        onClick = { if (branchEnabled) showBranchDialog = true },
                        containerColor = branchBtnBg,
                        modifier = Modifier.focusRequester(branchFocus).alpha(if (branchEnabled) 1f else 0.4f)
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp).height(56.dp)) {
                            Icon(imageVector = Icons.Filled.LocationOn, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.height(2.dp))
                            if (airportMode) {
                                Text("נתב\"ג", fontSize = responsiveFontSize(10f))
                            } else if (selectedBranchId == null) {
                                Text("סניף *", fontSize = responsiveFontSize(10f))
                            } else {
                                val cityVal = selectedBranchObj?.city?.trim().orEmpty()
                                Text(if (cityVal.isNotBlank()) cityVal else selectedBranchName, fontSize = responsiveFontSize(10f))
                            }
                        }
                    }
                    if (selectedBranchId != null) {
                        androidx.compose.material3.IconButton(onClick = { selectedBranchId = null }) {
                            Icon(imageVector = Icons.Filled.Close, contentDescription = "נקה סניף")
                        }
                    }
                }
                Spacer(Modifier.weight(1f))
                // Airport toggle on the right of branch
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    val airportLabelColor = if (airportMode) androidx.compose.ui.graphics.Color.Unspecified else androidx.compose.ui.graphics.Color.Gray
                    Text("נתב\"ג", color = airportLabelColor)
                    androidx.compose.material3.Switch(checked = airportMode, onCheckedChange = {
                        airportMode = it
                        if (it) {
                            selectedBranchId = null
                        }
                    })
                }
            }
            if (showSupplierPicker) {
                SupplierPickerDialog(
                    suppliers = suppliers,
                    onDismiss = { showSupplierPicker = false },
                    onSelect = { sel -> selectedSupplierId = sel; showSupplierPicker = false }
                )
            }

            // סניף (השורה הנפרדת הוסרה כדי למנוע כפילות)
            if (showBranchDialog) {
                BranchPickerDialog(
                    branches = branches,
                    onDismiss = { showBranchDialog = false },
                    onSelect = { bid -> selectedBranchId = bid; showBranchDialog = false },
                    onEdit = { b -> vm.updateBranch(b) { } },
                    supplierId = selectedSupplierId,
                    onAddBranchScreen = {
                        showBranchDialog = false
                        selectedSupplierId?.let { sid -> navController.navigate("supplier_edit/$sid") }
                    }
                )
            }

            Spacer(Modifier.height(16.dp))
            // כפתור סוכן הועבר לשורת הלקוח למעלה כדי למנוע כפילות
            
            // Dates/times row: From date, From time, עד, To date, To time - responsive one-row layout
            run {
                val requiredBg = Color(0xFFFFC1B6)
                BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                    val spacing = 8.dp
                    val labelWidth = 28.dp
                    val buttonWidth = (maxWidth - labelWidth - spacing * 4) / 4
                    
                    // Shared text style for all pill texts to prevent clipping across font scales
                    val pillTextStyle = MaterialTheme.typography.labelMedium.copy(
                        fontSize = responsiveFontSize(9f),
                        lineHeight = responsiveFontSize(10.8f)
                    )
                    
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(spacing),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // From date
                        androidx.compose.material3.FloatingActionButton(
                            onClick = { showFromDatePicker = true },
                            containerColor = if (fromDateMillis == null) requiredBg else LocalButtonColor.current,
                            modifier = Modifier.width(buttonWidth).heightIn(min = 48.dp)
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 4.dp)) {
                                Text("🗓")
                                Spacer(Modifier.height(2.dp))
                                val dateLabel = if (fromDateMillis == null) "ת.התחלה *" else java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault()).format(java.util.Date(fromDateMillis!!))
                                Text(
                                    dateLabel, 
                                    style = pillTextStyle,
                                    maxLines = 1,
                                    softWrap = false,
                                    overflow = TextOverflow.Clip
                                )
                            }
                        }
                        // From time
                        androidx.compose.material3.FloatingActionButton(
                            onClick = { showFromTimePicker = true },
                            modifier = Modifier.width(buttonWidth).heightIn(min = 48.dp)
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 4.dp)) {
                                Text("⏰")
                                Spacer(Modifier.height(2.dp))
                                val t = "%02d:%02d".format(fromHour, fromMinute)
                                Text(
                                    t, 
                                    style = pillTextStyle,
                                    maxLines = 1,
                                    softWrap = false,
                                    overflow = TextOverflow.Clip
                                )
                            }
                        }
                        // עד label
                        Text(
                            "עד",
                            modifier = Modifier.width(labelWidth),
                            textAlign = TextAlign.Center,
                            fontSize = responsiveFontSize(14f)
                        )
                        // To date
                        androidx.compose.material3.FloatingActionButton(
                            onClick = { showToDatePicker = true },
                            containerColor = if (toDateMillis == null) requiredBg else LocalButtonColor.current,
                            modifier = Modifier.width(buttonWidth).heightIn(min = 48.dp)
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 4.dp)) {
                                Text("🗓")
                                Spacer(Modifier.height(2.dp))
                                val dateLabel = if (toDateMillis == null) "ת.סיום *" else java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault()).format(java.util.Date(toDateMillis!!))
                                Text(
                                    dateLabel, 
                                    style = pillTextStyle,
                                    maxLines = 1,
                                    softWrap = false,
                                    overflow = TextOverflow.Clip
                                )
                            }
                        }
                        // To time
                        androidx.compose.material3.FloatingActionButton(
                            onClick = { showToTimePicker = true },
                            modifier = Modifier.width(buttonWidth).heightIn(min = 48.dp)
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 4.dp)) {
                                Text("⏰")
                                Spacer(Modifier.height(2.dp))
                                val t = "%02d:%02d".format(toHour, toMinute)
                                Text(
                                    t, 
                                    style = pillTextStyle,
                                    maxLines = 1,
                                    softWrap = false,
                                    overflow = TextOverflow.Clip
                                )
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            // כולל מע"מ Switch (ברירת מחדל: כולל) + המרה ישירה של מחיר מסוכם
            val ctxVatForm = LocalContext.current
            val vatStoreForm = remember(ctxVatForm) { SettingsStore(ctxVatForm) }
            val vatStrForm = vatStoreForm.decimalOnePlace().collectAsState(initial = "17.0").value
            val vatPctForm = vatStrForm.toDoubleOrNull() ?: 17.0
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                // Left: Days label
                val daysLabel = run {
                    val s = fromDateMillis
                    val e = toDateMillis
                    if (s != null && e != null) {
                        val start = combineDateTime(s, fromHour, fromMinute)
                        val end = combineDateTime(e, toHour, toMinute)
                        val d = diffDays(start, end).coerceAtLeast(1)
                        d.toString()
                    } else "—"
                }
                Text("סה\"כ ימים לתקופה: $daysLabel")

                // Right: VAT toggle cluster
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(if (includeVat) "כולל מע\"מ" else "לא כולל מע\"מ")
                    androidx.compose.material3.Switch(
                        checked = includeVat,
                        onCheckedChange = { checked ->
                            val currentPrice = price.toDoubleOrNull()
                            if (currentPrice != null) {
                                val factor = 1.0 + (vatPctForm / 100.0)
                                val adjusted = if (checked && !includeVat) {
                                    // מעבר ללא כולל -> כולל: הוסף מע"מ
                                    (currentPrice * factor)
                                } else if (!checked && includeVat) {
                                    // מעבר כולל -> ללא כולל: הורד מע"מ
                                    (currentPrice / factor)
                                } else currentPrice
                                price = adjusted.roundToInt().toString()
                            }
                            includeVat = checked
                        }
                    )
                }
            }
            Spacer(Modifier.height(8.dp))

            // אזהרת שבת: תאריך התחלה/סיום בשבת
            run {
                val startSat = fromDateMillis?.let { millis ->
                    val cal = java.util.Calendar.getInstance().apply { timeInMillis = millis }
                    cal.get(java.util.Calendar.DAY_OF_WEEK) == java.util.Calendar.SATURDAY
                } ?: false
                val endSat = toDateMillis?.let { millis ->
                    val cal = java.util.Calendar.getInstance().apply { timeInMillis = millis }
                    cal.get(java.util.Calendar.DAY_OF_WEEK) == java.util.Calendar.SATURDAY
                } ?: false
                if (startSat || endSat) {
                    val msg = when {
                        startSat && endSat -> "שימו לב: יום ההזמנה ויום ההחזרה חלים בשבת"
                        startSat -> "שימו לב: יום ההזמנה חל בשבת"
                        else -> "שימו לב: יום ההחזרה חל בשבת"
                    }
                    Text(msg, color = Color(0xFFD32F2F))
                }
            }

            // אזהרת התאמה (פעם אחת)
            run {
                val startMillisWarn = fromDateMillis
                val endMillisWarn = toDateMillis
                if (startMillisWarn != null && endMillisWarn != null && periodTypeDays != null) {
                    val daysWarn = diffDays(
                        combineDateTime(startMillisWarn, fromHour, fromMinute),
                        combineDateTime(endMillisWarn, toHour, toMinute)
                    ).coerceAtLeast(0)
                    val matches = when (periodTypeDays ?: 0) {
                        1 -> daysWarn in 0..5
                        7 -> daysWarn in 6..22
                        24 -> daysWarn >= 23
                        30 -> daysWarn >= 30
                        else -> true
                    }
                    if (!matches) {
                        Spacer(Modifier.height(4.dp))
                        Text("אזהרה: תאריכי ההזמנה לא תואמים את סוג ההזמנה שנבחר", color = Color(0xFFB00020))
                    }
                }
            }

            if (showPeriodMenu) {
                com.rentacar.app.ui.dialogs.ModernSelectionDialog(
                    title = "בחר סוג הזמנה",
                    headerIcon = Icons.Filled.Category,
                    items = listOf(
                        com.rentacar.app.ui.dialogs.ModernSelectionItem(
                            key = "1",
                            title = "יומי",
                            subtitle = "הזמנה ליום",
                            icon = Icons.Filled.Today
                        ),
                        com.rentacar.app.ui.dialogs.ModernSelectionItem(
                            key = "7",
                            title = "שבועי",
                            subtitle = "הזמנה לשבוע",
                            icon = Icons.Filled.DateRange
                        ),
                        com.rentacar.app.ui.dialogs.ModernSelectionItem(
                            key = "30",
                            title = "חודשי",
                            subtitle = "הזמנה לחודש",
                            icon = Icons.Filled.CalendarMonth
                        )
                    ),
                    selectedKey = periodTypeDays.toString(),
                    onItemSelected = { key ->
                        key.toIntOrNull()?.let { periodTypeDays = it }
                        showPeriodMenu = false
                    },
                    onDismiss = { showPeriodMenu = false }
                )
            }

            // Quote switch
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = !isQuote, onClick = { isQuote = false })
                    Text("הזמנה רגילה")
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = isQuote, onClick = { isQuote = true })
                    Text("הצעת מחיר")
                }
            }
            Spacer(Modifier.height(8.dp))

            OutlinedTextField(
                value = price,
                onValueChange = { new -> price = new.filter { ch -> ch.isDigit() } },
                label = { Text("מחיר מסוכם *") },
                singleLine = true,
                colors = TextFieldDefaults.outlinedTextFieldColors(
                    containerColor = if (price.isBlank()) Color(0xFFFFC1B6) else Color.Unspecified
                ),
                modifier = Modifier.fillMaxWidth().focusRequester(priceFocus),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number),
                textStyle = TextStyle(textDirection = TextDirection.Ltr)
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = kmIncluded,
                onValueChange = { kmIncluded = it },
                label = { Text("ק\"מ כלול *") },
                singleLine = true,
                colors = TextFieldDefaults.outlinedTextFieldColors(
                    containerColor = if (kmIncluded.isBlank()) Color(0xFFFFC1B6) else Color.Unspecified
                ),
                modifier = Modifier.fillMaxWidth().focusRequester(kmFocus),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number),
                textStyle = TextStyle(textDirection = TextDirection.Ltr)
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = holdAmount,
                onValueChange = { new -> holdAmount = new.filter { ch -> ch.isDigit() } },
                label = { Text("מסגרת אשראי נדרשת *") },
                singleLine = true,
                colors = TextFieldDefaults.outlinedTextFieldColors(
                    containerColor = if (holdAmount.isBlank()) Color(0xFFFFC1B6) else Color.Unspecified
                ),
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number),
                textStyle = TextStyle(textDirection = TextDirection.Ltr)
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = carTypeText,
                onValueChange = { carTypeText = it },
                label = { Text("סוג רכב *") },
                singleLine = true,
                colors = TextFieldDefaults.outlinedTextFieldColors(
                    containerColor = if (carTypeText.isBlank()) Color(0xFFFFC1B6) else Color.Unspecified
                ),
                modifier = Modifier.fillMaxWidth()
            )
            // הצעות להשלמה אוטומטית מתוך סוגי רכב קיימים בהזמנות ובמאגר סוגים
            run {
                val knownCarTypes = remember(carTypes, allReservations) {
                    (carTypes.map { it.name } + allReservations.mapNotNull { it.carTypeName })
                        .map { it.trim() }
                        .filter { it.isNotBlank() }
                        .distinct()
                        .sorted()
                }
                val suggestions = if (carTypeText.isBlank()) emptyList() else knownCarTypes.filter { it.contains(carTypeText, ignoreCase = true) && it != carTypeText }.take(6)
                if (suggestions.isNotEmpty()) {
                    Spacer(Modifier.height(4.dp))
                    LazyColumn(modifier = Modifier.fillMaxWidth().height(120.dp)) {
                        items(suggestions) { name ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { carTypeText = name }
                                    .padding(vertical = 6.dp)
                            ) { Text(name) }
                        }
                    }
                }
            }
            if ((kmIncluded.isBlank()) || holdAmount.toIntOrNull().let { it == null || it <= 0 } || carTypeText.isBlank() || selectedSupplierId == null || (!airportMode && selectedBranchId == null) || periodTypeDays == null || fromDateMillis == null || toDateMillis == null || price.toIntOrNull().let { it == null || it <= 0 }) {
                Text("לא ניתן להמשיך בהזמנה עד למילוי כל שדות החובה!", color = Color(0xFFD32F2F))
            }
            Spacer(Modifier.height(8.dp))
            // הצגת שדות מתקדמים רק לאחר מילוי שדות חובה
            val parsedPriceIntEarly = price.toIntOrNull()
            val parsedKmEarly = kmIncluded.toIntOrNull()
            val parsedHoldEarly = holdAmount.toIntOrNull()
            val requiredComplete = (selectedSupplierId != null && (airportMode || selectedBranchId != null) && periodTypeDays != null && fromDateMillis != null && toDateMillis != null && (parsedPriceIntEarly != null && parsedPriceIntEarly > 0) && (parsedKmEarly != null && parsedKmEarly > 0) && (parsedHoldEarly != null && parsedHoldEarly > 0) && carTypeText.isNotBlank())

            if (requiredComplete) {
                OutlinedTextField(
                    value = supplierOrderNumber,
                    onValueChange = { supplierOrderNumber = it },
                    label = { Text("מס׳ הזמנה מהספק") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(12.dp))

                // פרטי אשראי (מוצג רק אם showCardFields=true)
                if (showCardFields) {
                val numberBlank = cardNumber.isBlank()
                val numberInvalid = if (!numberBlank) {
                    val digits = cardNumber.filter { it.isDigit() }
                    if (digits.length !in 12..19) true else {
                        var sum = 0
                        var alt = false
                        for (i in digits.length - 1 downTo 0) {
                            var n = digits[i] - '0'
                            if (alt) {
                                n *= 2
                                if (n > 9) n -= 9
                            }
                            sum += n
                            alt = !alt
                        }
                        sum % 10 != 0
                    }
                } else false
                OutlinedTextField(
                    value = cardNumber,
                    onValueChange = { cardNumber = it },
                    label = { Text("מספר כרטיס אשראי") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    isError = (!numberBlank && numberInvalid),
                    supportingText = { if (!numberBlank && numberInvalid) Text("מספר כרטיס לא תקין") },
                    colors = TextFieldDefaults.outlinedTextFieldColors(
                        containerColor = if (!numberBlank && numberInvalid) Color(0xFFFFC1B6) else Color.Unspecified
                    ),
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number)
                )
                Spacer(Modifier.height(8.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = cardHolderFirst,
                        onValueChange = { cardHolderFirst = it },
                        label = { Text("שם פרטי בעל הכרטיס") },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = cardHolderLast,
                        onValueChange = { cardHolderLast = it },
                        label = { Text("שם משפחה בעל הכרטיס") },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = cardHolderTz,
                    onValueChange = { cardHolderTz = it },
                    label = { Text("ת" + "ז בעל הכרטיס") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                var showCvv by rememberSaveable { mutableStateOf(false) }
                val expiryBlank = cardExpiry.isBlank()
                val expiryInvalid = if (!expiryBlank) {
                    try {
                        val digitsOnly = cardExpiry.filter { it.isDigit() }
                        val mm = digitsOnly.take(2).toIntOrNull()
                        val yyShort = digitsOnly.drop(2).take(2).toIntOrNull()
                        val yy = yyShort?.let { 2000 + it }
                        if (mm == null || yy == null || mm !in 1..12) true else {
                            val now = java.util.Calendar.getInstance()
                            val thisYm = now.get(java.util.Calendar.YEAR) * 100 + (now.get(java.util.Calendar.MONTH) + 1)
                            val expYm = yy * 100 + mm
                            expYm < thisYm
                        }
                    } catch (_: Throwable) { true }
                } else false
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = cardExpiry,
                        onValueChange = { cardExpiry = it },
                        label = { Text("תוקף (MMYY)") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                        isError = (!expiryBlank && expiryInvalid),
                        supportingText = { if (!expiryBlank && expiryInvalid) Text("כרטיס לא בתוקף") },
                        colors = TextFieldDefaults.outlinedTextFieldColors(
                            containerColor = if (!expiryBlank && expiryInvalid) Color(0xFFFFC1B6) else Color.Unspecified
                        ),
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number)
                    )
                    OutlinedTextField(
                        value = cardCvv,
                        onValueChange = { cardCvv = it },
                        label = { Text("CVV") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        visualTransformation = if (showCvv) VisualTransformation.None else androidx.compose.ui.text.input.PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { showCvv = !showCvv }) {
                                Icon(
                                    imageVector = if (showCvv) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                                    contentDescription = if (showCvv) "הסתר CVV" else "הצג CVV"
                                )
                            }
                        }
                    )
                }
                }
                // הערות
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("הערות") },
                    singleLine = false,
                    minLines = 3,
                    maxLines = 3,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                // moved: actual return date picker now a FAB in the bottom action row
            }

            

            val parsedPriceInt = price.toIntOrNull()
            val parsedKm = kmIncluded.toIntOrNull()
            val parsedHold = holdAmount.toIntOrNull()
            val dateOk = (fromDateMillis != null) && (toDateMillis != null)
            val branchOk = airportMode || selectedBranchId != null
            val periodOk = periodTypeDays != null
            val carTypeOk = carTypeText.isNotBlank()
            val canSave = (selectedSupplierId != null) && branchOk && (parsedPriceInt != null && parsedPriceInt > 0) && (parsedKm != null && parsedKm > 0) && (parsedHold != null && parsedHold > 0) && carTypeOk && dateOk && periodOk
            var showShareDialog by rememberSaveable { mutableStateOf(false) }
            var sendToCustomer by rememberSaveable { mutableStateOf(true) }
            var shareLang by rememberSaveable(showShareDialog) { mutableStateOf(ShareLanguage.HE) }

            if (showShareDialog && canSave) {
                val supplierId = selectedSupplierId!!
                val now = System.currentTimeMillis()
                val startMillis = combineDateTime(fromDateMillis ?: now, fromHour, fromMinute)
                val endMillis = combineDateTime(toDateMillis ?: (fromDateMillis ?: now) + 3L * 24 * 60 * 60 * 1000, toHour, toMinute)
                val dfDate = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
                val dfTime = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault())
                val fromDate = dfDate.format(java.util.Date(startMillis))
                val toDate = dfDate.format(java.util.Date(endMillis))
                val fromTime = dfTime.format(java.util.Date(startMillis))
                val toTime = dfTime.format(java.util.Date(endMillis))
                val days = diffDays(startMillis, endMillis)
                val custName = listOfNotNull(firstName.ifBlank { null }, lastName.ifBlank { null }).joinToString(" ")
                val tz = tzId
                val phoneStr = phone
                val supplierNamePdf = suppliers.find { it.id == supplierId }?.name ?: supplierId.toString()
                val carTypeNameOut = carTypeText.ifBlank { carTypes.firstOrNull()?.name.orEmpty() }
                val selectedBranchObjNow = selectedBranchObj
                val branchNameOut = if (airportMode) {
                    "נתב\"ג"
                } else {
                    selectedBranchObjNow?.name ?: ""
                }
                val branchAddressOut = if (airportMode) {
                    ""
                } else {
                    listOfNotNull(selectedBranchObjNow?.street).joinToString(" ").trim()
                }
                val branchPhoneOut = if (airportMode) {
                    ""
                } else {
                    selectedBranchObjNow?.phone ?: ""
                }
                val requiredHold = holdAmount.toIntOrNull() ?: 2000
                val isHebrew = shareLang == ShareLanguage.HE
                val branchNameEn = if (airportMode) "Ben Gurion Airport" else branchNameOut
                val baseLines = if (isHebrew) {
                    buildList<String> {
                        add(if (isQuote) "הצעת מחיר" else "הזמנה")
                        add("שם מלא: $custName")
                        add("טלפון: $phoneStr")
                        add("ת" + "עודת זהות: $tz")
                        add("תאריך התחלה: $fromDate")
                        add("תאריך סיום: $toDate")
                        add("שעת יציאה: $fromTime")
                        add("שעת חזרה: $toTime")
                        add("ימים: $days")
                        add("ספק: $supplierNamePdf")
                        add("סניף: $branchNameOut")
                        if (!airportMode && branchAddressOut.isNotBlank()) add("רחוב סניף: $branchAddressOut")
                        if (!airportMode && branchPhoneOut.isNotBlank()) add("טלפון סניף: $branchPhoneOut")
                        add("סוג רכב: $carTypeNameOut")
                        add("מחיר מסוכם: ${parsedPriceInt ?: 0} ₪")
                        add("ק" + "מ כלול: ${parsedKm}")
                        if (supplierOrderNumber.isNotBlank()) add("מס׳ הזמנה מהספק: $supplierOrderNumber")
                        if (notes.isNotBlank()) add("הערות: $notes")
                    }
                } else {
                    buildList<String> {
                        add(if (isQuote) "Quote" else "Reservation")
                        add("Full name: $custName")
                        add("Phone: $phoneStr")
                        add("ID: $tz")
                        add("Start date: $fromDate")
                        add("End date: $toDate")
                        add("Pickup time: $fromTime")
                        add("Return time: $toTime")
                        add("Days: $days")
                        add("Supplier: $supplierNamePdf")
                        add("Branch: $branchNameEn")
                        if (!airportMode && branchAddressOut.isNotBlank()) add("Branch street: $branchAddressOut")
                        if (!airportMode && branchPhoneOut.isNotBlank()) add("Branch phone: $branchPhoneOut")
                        add("Car type: $carTypeNameOut")
                        add("Agreed price: ₪${parsedPriceInt ?: 0}")
                        add("Included km: ${parsedKm}")
                        if (supplierOrderNumber.isNotBlank()) add("Supplier order #: $supplierOrderNumber")
                        if (notes.isNotBlank()) add("Notes: $notes")
                    }
                }
                val customerTerms = if (isHebrew) {
                    listOf(
                        "",
                        "תנאים והגבלות (יש להגיע עם):",
                        "1. רישיון נהיגה מקורי בתוקף.",
                        "2. תעודת זהות מקורית.",
                        "3. כרטיס אשראי עם מסגרת פנויה (מינ׳ ### ₪ או לפי מדיניות הספק). בעל הכרטיס צריך להיות נוכח.".replace("###", requiredHold.toString()),
                        "4. החברה אינה מתחייבת לדגם או צבע.",
                        "5. אי הגעה בזמן הנקוב עלולה לגרום לביטול ההזמנה!"
                    )
                } else {
                    listOf(
                        "",
                        "Terms & requirements (please bring):",
                        "1. Valid original driver's license.",
                        "2. Original ID card.",
                        "3. Credit card with available limit (min ₪### or per supplier policy). Cardholder must be present.".replace("###", requiredHold.toString()),
                        "4. We do not guarantee model or color.",
                        "5. Late arrival/no-show may result in cancellation!"
                    )
                }
                val supplierLines = baseLines.toMutableList().apply {
                    if (isHebrew) {
                        add(8, "מסגרת אשראי נדרשת: ${requiredHold} ₪")
                    } else {
                        add(8, "Required credit hold: ₪${requiredHold}")
                    }
                }
                val ctx = LocalContext.current
                AlertDialog(
                    onDismissRequest = { showShareDialog = false },
                    confirmButton = {},
                    dismissButton = { AppButton(onClick = { showShareDialog = false }) { Text("סגור") } },
                    title = { Text("בחר סוג שליחה") },
                    text = {
                        Column {
                            // בחירת יעד שליחה: לקוח / ספק
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                AppButton(
                                    onClick = { sendToCustomer = true },
                                    containerColor = if (sendToCustomer) LocalButtonColor.current else Color(0xFFBDBDBD)
                                ) { Text("לקוח") }
                                AppButton(
                                    onClick = { sendToCustomer = false },
                                    containerColor = if (!sendToCustomer) LocalButtonColor.current else Color(0xFFBDBDBD)
                                ) { Text("ספק") }
                            }
                            // Language toggle - only show for customer
                            if (sendToCustomer) {
                                Spacer(Modifier.height(8.dp))
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    AppButton(
                                        onClick = { shareLang = ShareLanguage.HE },
                                        containerColor = if (shareLang == ShareLanguage.HE) LocalButtonColor.current else Color(0xFFBDBDBD)
                                    ) { Text("עברית") }
                                    AppButton(
                                        onClick = { shareLang = ShareLanguage.EN },
                                        containerColor = if (shareLang == ShareLanguage.EN) LocalButtonColor.current else Color(0xFFBDBDBD)
                                    ) { Text("English") }
                                }
                            }
                            Spacer(Modifier.height(8.dp))
                            val isHebrew = shareLang == ShareLanguage.HE
                            val rtl = if (sendToCustomer) isHebrew else true
                            val chosenLines = if (sendToCustomer) (baseLines + customerTerms) else supplierLines
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        val text = chosenLines.joinToString("\n")
                                        ShareService.copyTextToClipboard(ctx, text, label = "reservation")
                                        ShareService.shareText(ctx, text)
                                        showShareDialog = false
                                    }
                                    .padding(vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Filled.Description, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text("טקסט")
                            }
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        val pdf = PdfGenerator.generateSimpleReservationPdf(chosenLines, rtl = rtl)
                                        val uri = ShareService.saveBytesToCacheAndGetUri(ctx, pdf, "reservation.pdf")
                                        ShareService.copyUriToClipboard(ctx, uri, label = "reservation.pdf")
                                        ShareService.sharePdf(ctx, pdf)
                                        showShareDialog = false
                                    }
                                    .padding(vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Filled.PictureAsPdf, contentDescription = null, tint = Color(0xFFF44336))
                                Spacer(Modifier.width(8.dp))
                                Text("PDF")
                            }
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        val png = ShareService.generateImageFromLines(chosenLines, rtl = rtl)
                                        val uri = ShareService.saveBytesToCacheAndGetUri(ctx, png, "reservation.png")
                                        ShareService.copyUriToClipboard(ctx, uri, label = "reservation.png")
                                        ShareService.shareImage(ctx, png)
                                        showShareDialog = false
                                    }
                                    .padding(vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Filled.Image, contentDescription = null, tint = Color(0xFF4CAF50))
                                Spacer(Modifier.width(8.dp))
                                Text("תמונה")
                            }
                            // Share supplier documents option - only show if supplier is selected
                            if (selectedSupplierId != null) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            showShareDialog = false
                                            navController.navigate("supplier_documents/${selectedSupplierId}")
                                        }
                                        .padding(vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(Icons.Filled.InsertDriveFile, contentDescription = null, tint = Color(0xFF2196F3))
                                    Spacer(Modifier.width(8.dp))
                                    Text("שתף מסמכי ספק")
                                }
                            }
                        }
                    }
                )
            }

            // תחתית: שמור + שליחה - RESPONSIVE
            Spacer(Modifier.height(8.dp))
            Spacer(Modifier.weight(1f))
            if (canSave) Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                // שליחה (ימין) — Small FAB (same size as plane) - RESPONSIVE
                androidx.compose.material3.FloatingActionButton(
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp),
                    onClick = {
                        if (editReservationId == null && editReservation == null) {
                            val supplierId = selectedSupplierId!!
                            val now = System.currentTimeMillis()
                            val startMillis = combineDateTime(fromDateMillis ?: now, fromHour, fromMinute)
                            val endMillis = combineDateTime(toDateMillis ?: (fromDateMillis ?: now) + 3L * 24 * 60 * 60 * 1000, toHour, toMinute)
                            val branchId = selectedBranchId ?: 1L
                            val carTypeId = carTypes.firstOrNull()?.id ?: 1L
                            val custId = effectiveCustomerId ?: return@FloatingActionButton
                            val notesForSave = run {
                                val base = notes.trim()
                                val cn = cardNumber.trim()
                                val ce = cardExpiry.trim()
                                val c3 = cardCvv.trim()
                                val triple = listOf(c3, ce, cn).filter { it.isNotBlank() }.joinToString("\n")
                                // Add as first line if notes doesn't already contain the data
                                val hasNumber = cn.isNotBlank() && base.contains(cn)
                                val hasExpiry = ce.isNotBlank() && base.contains(ce)
                                val hasCvv = c3.isNotBlank() && base.contains(c3)
                                val shouldInject = cn.isNotBlank() && ce.isNotBlank() && (!hasNumber || !hasExpiry || (c3.isNotBlank() && !hasCvv))
                                when {
                                    base.isBlank() && cn.isNotBlank() && ce.isNotBlank() -> triple
                                    base.isNotBlank() && shouldInject -> "$triple\n$base"
                                    else -> if (base.isNotBlank()) base else null
                                }
                            }
                            val reservation = com.rentacar.app.data.Reservation(
                                customerId = custId,
                                supplierId = supplierId,
                                branchId = branchId,
                                carTypeId = carTypeId,
                                agentId = selectedAgentId,
                                dateFrom = startMillis,
                                dateTo = endMillis,
                                agreedPrice = (parsedPriceInt!!).toDouble(),
                                kmIncluded = parsedKm!!,
                                requiredHoldAmount = holdAmount.toIntOrNull() ?: 4500,
                                periodTypeDays = periodTypeDays ?: 1,
                                commissionPercentUsed = run {
                                    val daysNow = diffDays(startMillis, endMillis).coerceAtLeast(1)
                                    com.rentacar.app.domain.CommissionCalculator.calculate(daysNow, (parsedPriceInt!!).toDouble()).percent
                                },
                                supplierOrderNumber = supplierOrderNumber.ifBlank { null },
                                status = com.rentacar.app.data.ReservationStatus.Draft,
                                carTypeName = carTypeText.ifBlank { null },
                                notes = notesForSave,
                                actualReturnDate = actualReturnDateMillis,
                                includeVat = includeVat,
                                vatPercentAtCreation = vatPctForm
                            )
                            vm.createReservation(reservation) { newId ->
                                // שמירת CardStub (ללא PAN/CVV)
                                val digits = cardNumber.filter { it.isDigit() }
                                val last4 = digits.takeLast(4)
                                val brand = when (digits.firstOrNull()) {
                                    '4' -> "VISA"
                                    '5' -> "MASTERCARD"
                                    '3' -> "AMEX"
                                    else -> "CARD"
                                }
                                val digitsOnly = cardExpiry.filter { it.isDigit() }
                                val mm = digitsOnly.take(2).toIntOrNull()
                                val yy = digitsOnly.drop(2).take(2).toIntOrNull()?.let { 2000 + it }
                                GlobalScope.launch(Dispatchers.IO) {
                                    val db = com.rentacar.app.di.DatabaseModule.provideDatabase(appContext)
                                    val currentUid = com.rentacar.app.data.auth.CurrentUserProvider.requireCurrentUid()
                                    db.cardStubDao().deleteForReservation(newId, currentUid)
                                    val cardStubId = db.cardStubDao().upsert(
                                        com.rentacar.app.data.CardStub(
                                            reservationId = newId,
                                            brand = brand,
                                            last4 = last4,
                                            expMonth = mm,
                                            expYear = yy,
                                            holderFirstName = cardHolderFirst.ifBlank { null },
                                            holderLastName = cardHolderLast.ifBlank { null },
                                            holderTz = cardHolderTz.ifBlank { null }
                                        )
                                    )
                                    // Mark as dirty for sync
                                    try {
                                        db.syncQueueDao().markDirty("cardStub", cardStubId, System.currentTimeMillis())
                                    } catch (e: Exception) {
                                        android.util.Log.e("CardStubSync", "Failed to mark cardStub dirty", e)
                                    }
                                }
                                showShareDialog = true
                            }
                        } else {
                            showShareDialog = true
                        }
                    }
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(4.dp)) {
                        Icon(imageVector = Icons.Filled.Share, contentDescription = "שליחה", modifier = Modifier.size(20.dp))
                        Text(
                            text = "שתף", 
                            fontSize = responsiveFontSize(8f),
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }

                // כפתור צף להוספת טקסט להערות (מונית צהובה) - RESPONSIVE
                androidx.compose.material3.FloatingActionButton(
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp),
                    onClick = {
                        val phrase = "איסוף במונית "
                        val current = notes
                        if (!current.contains(phrase)) {
                            notes = if (current.isBlank()) phrase else current + "\n" + phrase
                        }
                    }
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(4.dp)) {
                        Text("🚕", fontSize = responsiveFontSize(20f))
                        Text(
                            text = "מונית", 
                            fontSize = responsiveFontSize(8f),
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }

                // כפתור צף לפתיחה/סגירה של פרטי אשראי - RESPONSIVE
                androidx.compose.material3.FloatingActionButton(
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp),
                    onClick = { showCardFields = !showCardFields }
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(4.dp)) {
                        Icon(imageVector = Icons.Filled.CreditCard, contentDescription = "כרטיס אשראי")
                        Text(
                            text = "אשראי", 
                            fontSize = responsiveFontSize(8f),
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }

                // כפתור צף ביטול/שחזור הזמנה - RESPONSIVE
                val isCancelledNow = editReservation?.status == com.rentacar.app.data.ReservationStatus.Cancelled
                androidx.compose.material3.FloatingActionButton(
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp),
                    onClick = {
                        if (editReservationId != null && editReservation != null) {
                            if (isCancelledNow) showConfirmRestore = true else showConfirmCancel = true
                        }
                    }
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(4.dp)) {
                        Text(if (isCancelledNow) "♻" else "🗑")
                        Text(
                            text = if (isCancelledNow) "שחזור" else "ביטול", 
                            fontSize = responsiveFontSize(8f),
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }

                // חזרה בפועל - RESPONSIVE
                run {
                    val dfReturn = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
                    val display = actualReturnDateMillis?.let { dfReturn.format(java.util.Date(it)) } ?: "תאריך חזרה"
                    androidx.compose.material3.FloatingActionButton(
                        modifier = Modifier
                            .weight(1f)
                            .height(64.dp),
                        onClick = { showActualReturnDatePicker = true }
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(4.dp)) {
                            Text("🗓", fontSize = responsiveFontSize(18f))
                            Text(
                                text = display, 
                                fontSize = responsiveFontSize(8f),
                                maxLines = 1,
                                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                    }
                }

                // שמור (שמאל) - RESPONSIVE
                androidx.compose.material3.FloatingActionButton(
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp),
                    onClick = {
                    val supplierId = selectedSupplierId!!
                    val now = System.currentTimeMillis()
                    val startMillis = combineDateTime(fromDateMillis ?: now, fromHour, fromMinute)
                    val endMillis = combineDateTime(toDateMillis ?: (fromDateMillis ?: now) + 3L * 24 * 60 * 60 * 1000, toHour, toMinute)

                    if (editReservationId != null && editReservation != null) {
                        val notesForUpdate = run {
                            val base = notes.trim()
                            val cn = cardNumber.trim()
                            val ce = cardExpiry.trim()
                            val c3 = cardCvv.trim()
                            val triple = listOf(c3, ce, cn).filter { it.isNotBlank() }.joinToString("\n")
                            val hasNumber = cn.isNotBlank() && base.contains(cn)
                            val hasExpiry = ce.isNotBlank() && base.contains(ce)
                            val hasCvv = c3.isNotBlank() && base.contains(c3)
                            val shouldInject = cn.isNotBlank() && ce.isNotBlank() && (!hasNumber || !hasExpiry || (c3.isNotBlank() && !hasCvv))
                            when {
                                base.isBlank() && cn.isNotBlank() && ce.isNotBlank() -> triple
                                base.isNotBlank() && shouldInject -> "$triple\n$base"
                                else -> if (base.isNotBlank()) base else null
                            }
                        }
                        val updated = editReservation.copy(
                            supplierId = supplierId,
                            branchId = selectedBranchId ?: editReservation.branchId,
                            dateFrom = startMillis,
                            dateTo = endMillis,
                            agreedPrice = parsedPriceInt?.toDouble() ?: editReservation.agreedPrice,
                            kmIncluded = parsedKm ?: editReservation.kmIncluded,
                            requiredHoldAmount = holdAmount.toIntOrNull() ?: editReservation.requiredHoldAmount,
                            periodTypeDays = periodTypeDays ?: 1,
                            commissionPercentUsed = run {
                                val daysNow = diffDays(startMillis, endMillis).coerceAtLeast(1)
                                com.rentacar.app.domain.CommissionCalculator.calculate(daysNow, (parsedPriceInt?.toDouble() ?: editReservation.agreedPrice)).percent
                            },
                            supplierOrderNumber = supplierOrderNumber.ifBlank { null },
                            agentId = selectedAgentId,
                            carTypeName = carTypeText.ifBlank { null },
                            notes = notesForUpdate,
                            updatedAt = System.currentTimeMillis(),
                            actualReturnDate = actualReturnDateMillis ?: editReservation.actualReturnDate,
                            includeVat = includeVat,
                            vatPercentAtCreation = null,
                            airportMode = airportMode,
                            isQuote = isQuote
                        )
                        vm.updateReservation(updated) {
                            val resId = updated.id
                            val digits = cardNumber.filter { it.isDigit() }
                            val last4 = digits.takeLast(4)
                            val brand = when (digits.firstOrNull()) {
                                '4' -> "VISA"
                                '5' -> "MASTERCARD"
                                '3' -> "AMEX"
                                else -> "CARD"
                            }
                            val digitsOnly = cardExpiry.filter { it.isDigit() }
                            val mm = digitsOnly.take(2).toIntOrNull()
                            val yy = digitsOnly.drop(2).take(2).toIntOrNull()?.let { 2000 + it }
                            GlobalScope.launch(Dispatchers.IO) {
                                val db = com.rentacar.app.di.DatabaseModule.provideDatabase(appContext)
                                val currentUid = com.rentacar.app.data.auth.CurrentUserProvider.requireCurrentUid()
                                db.cardStubDao().deleteForReservation(resId, currentUid)
                                val cardStubId = db.cardStubDao().upsert(
                                    com.rentacar.app.data.CardStub(
                                        reservationId = resId,
                                        brand = brand,
                                        last4 = last4,
                                        expMonth = mm,
                                        expYear = yy,
                                        holderFirstName = cardHolderFirst.ifBlank { null },
                                        holderLastName = cardHolderLast.ifBlank { null },
                                        holderTz = cardHolderTz.ifBlank { null }
                                    )
                                )
                                // Mark as dirty for sync
                                try {
                                    db.syncQueueDao().markDirty("cardStub", cardStubId, System.currentTimeMillis())
                                } catch (e: Exception) {
                                    android.util.Log.e("CardStubSync", "Failed to mark cardStub dirty", e)
                                }
                            }
                            navController.popBackStack()
                        }
                    } else {
                        val branchId = selectedBranchId ?: 1L
                        val carTypeId = carTypes.firstOrNull()?.id ?: 1L
                        val custId = effectiveCustomerId ?: return@FloatingActionButton
                        val notesForSave2 = run {
                            val base = notes.trim()
                            val cn = cardNumber.trim()
                            val ce = cardExpiry.trim()
                            val c3 = cardCvv.trim()
                            val triple = listOf(c3, ce, cn).filter { it.isNotBlank() }.joinToString("\n")
                            val hasNumber = cn.isNotBlank() && base.contains(cn)
                            val hasExpiry = ce.isNotBlank() && base.contains(ce)
                            val hasCvv = c3.isNotBlank() && base.contains(c3)
                            val shouldInject = cn.isNotBlank() && ce.isNotBlank() && (!hasNumber || !hasExpiry || (c3.isNotBlank() && !hasCvv))
                            when {
                                base.isBlank() && cn.isNotBlank() && ce.isNotBlank() -> triple
                                base.isNotBlank() && shouldInject -> "$triple\n$base"
                                else -> if (base.isNotBlank()) base else null
                            }
                        }
                        val reservation = com.rentacar.app.data.Reservation(
                            customerId = custId,
                            supplierId = supplierId,
                            branchId = branchId,
                            carTypeId = carTypeId,
                            agentId = selectedAgentId,
                            dateFrom = startMillis,
                            dateTo = endMillis,
                            agreedPrice = (parsedPriceInt!!).toDouble(),
                            kmIncluded = parsedKm!!,
                            requiredHoldAmount = holdAmount.toIntOrNull() ?: 4500,
                            periodTypeDays = periodTypeDays ?: 1,
                            commissionPercentUsed = run {
                                val daysNow = diffDays(startMillis, endMillis).coerceAtLeast(1)
                                com.rentacar.app.domain.CommissionCalculator.calculate(daysNow, (parsedPriceInt!!).toDouble()).percent
                            },
                            supplierOrderNumber = supplierOrderNumber.ifBlank { null },
                            status = com.rentacar.app.data.ReservationStatus.Draft,
                            carTypeName = carTypeText.ifBlank { null },
                            notes = notesForSave2,
                            actualReturnDate = actualReturnDateMillis,
                            includeVat = includeVat,
                            vatPercentAtCreation = null,
                            airportMode = airportMode,
                            isQuote = isQuote
                        )
                        vm.createReservation(reservation) {
                            // If opened from a request prefill, delete the source request
                            val reqId = navController.currentBackStackEntry?.savedStateHandle?.get<Long>("prefill_request_id")
                            if (reqId != null) {
                                vm.deleteRequest(reqId)
                                navController.currentBackStackEntry?.savedStateHandle?.remove<Long>("prefill_request_id")
                            }
                            navController.popBackStack()
                        }
                    }
                }) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(4.dp)) {
                        Text("💾")
                        Text(
                            text = "שמור", 
                            fontSize = responsiveFontSize(8f),
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
            }
        }

        // דיאלוגים לבחירת תאריך/שעה + היסטוריית הזמנות
        val context = LocalContext.current
        if (showFromDatePicker) {
            AppDatePickerDialog(
                onDismissRequest = { showFromDatePicker = false },
                onDateSelected = { sel ->
                    if (sel != null) {
                        // Validate that from date is not later than to date
                        if (toDateMillis != null && sel > toDateMillis!!) {
                            android.widget.Toast.makeText(context, "תאריך התחלה לא יכול להיות גדול מתאריך הסיום", android.widget.Toast.LENGTH_LONG).show()
                            // Don't update the date - keep the old valid value
                        } else {
                            fromDateMillis = sel
                            if (!endDateManuallySet) toDateMillis = sel
                        }
                    }
                }
            )
        }
        if (showToDatePicker) {
            AppDatePickerDialog(
                onDismissRequest = { showToDatePicker = false },
                onDateSelected = { sel ->
                    if (sel != null) {
                        // Validate that to date is not earlier than from date
                        if (fromDateMillis != null && sel < fromDateMillis!!) {
                            android.widget.Toast.makeText(context, "תאריך סיום לא יכול להיות קטן מתאריך ההתחלה", android.widget.Toast.LENGTH_LONG).show()
                            // Don't update the date - keep the old valid value
                        } else {
                            toDateMillis = sel
                            endDateManuallySet = true
                        }
                    }
                }
            )
        }
        if (showFromTimePicker) {
            AppTimePickerDialog(
                initialHour = fromHour,
                initialMinute = fromMinute,
                onDismissRequest = { showFromTimePicker = false },
                onTimeSelected = { h, m ->
                    fromHour = h; fromMinute = m
                    if (!endTimeManuallySet) { toHour = h; toMinute = m }
                }
            )
        }
        if (showToTimePicker) {
            AppTimePickerDialog(
                initialHour = toHour,
                initialMinute = toMinute,
                onDismissRequest = { showToTimePicker = false },
                onTimeSelected = { h, m ->
                    toHour = h; toMinute = m
                    endTimeManuallySet = true
                }
            )
        }

        if (showConfirmCancel) {
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { showConfirmCancel = false },
                confirmButton = {
                    Button(onClick = {
                        showConfirmCancel = false
                        editReservation?.let {
                            vm.updateReservationStatus(it, com.rentacar.app.data.ReservationStatus.Cancelled)
                            isCancelledLocal = true
                        }
                    }) { Text("בטל הזמנה") }
                },
                dismissButton = { Button(onClick = { showConfirmCancel = false }) { Text("סגור") } },
                title = { Text("לאשר ביטול הזמנה?") },
                text = { Text("פעולה זו תסמן את ההזמנה כמבוטלת.") }
            )
        }

        if (showConfirmRestore) {
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { showConfirmRestore = false },
                confirmButton = {
                    Button(onClick = {
                        showConfirmRestore = false
                        editReservation?.let {
                            vm.updateReservationStatus(it, com.rentacar.app.data.ReservationStatus.Draft)
                            isCancelledLocal = false
                        }
                    }) { Text("שחזר הזמנה") }
                },
                dismissButton = { Button(onClick = { showConfirmRestore = false }) { Text("סגור") } },
                title = { Text("לשחזר הזמנה מבוטלת?") },
                text = { Text("ההזמנה לא תסומן עוד כמבוטלת.") }
            )
        }

        if (showHistory && effectiveCustomerId != null) {
            val historyState = customerVm.customerReservations(effectiveCustomerId)?.collectAsState(initial = emptyList())
            ReservationHistoryDialog(
                reservations = historyState?.value ?: emptyList(),
                onDismiss = { showHistory = false }
            )
        }
        if (showActualReturnDatePicker) {
            AppDatePickerDialog(
                onDismissRequest = { showActualReturnDatePicker = false },
                onDateSelected = { sel -> actualReturnDateMillis = sel }
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AppDatePickerDialog(
    onDismissRequest: () -> Unit,
    onDateSelected: (Long?) -> Unit
) {
    val context = LocalContext.current
    val shown = rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        if (!shown.value) {
            shown.value = true
            val cal = java.util.Calendar.getInstance()
            val activity = (context as? android.app.Activity)
            if (activity != null && !activity.isFinishing) {
                val prevLocale = java.util.Locale.getDefault()
                val res = activity.resources
                val origConf = android.content.res.Configuration(res.configuration)
                val newConf = android.content.res.Configuration(origConf)
                try {
                    newConf.setLocales(android.os.LocaleList(java.util.Locale.ENGLISH))
                } catch (_: Throwable) {
                    @Suppress("DEPRECATION")
                    newConf.setLocale(java.util.Locale.ENGLISH)
                }
                java.util.Locale.setDefault(java.util.Locale.ENGLISH)
                @Suppress("DEPRECATION")
                res.updateConfiguration(newConf, res.displayMetrics)
                val dlg = android.app.DatePickerDialog(
                    activity,
                    { _, y, m, d ->
                        val sel = java.util.Calendar.getInstance().apply {
                            set(java.util.Calendar.YEAR, y)
                            set(java.util.Calendar.MONTH, m)
                            set(java.util.Calendar.DAY_OF_MONTH, d)
                            set(java.util.Calendar.HOUR_OF_DAY, 0)
                            set(java.util.Calendar.MINUTE, 0)
                            set(java.util.Calendar.SECOND, 0)
                            set(java.util.Calendar.MILLISECOND, 0)
                        }.timeInMillis
                        onDateSelected(sel)
                    },
                    cal.get(java.util.Calendar.YEAR),
                    cal.get(java.util.Calendar.MONTH),
                    cal.get(java.util.Calendar.DAY_OF_MONTH)
                )
                dlg.setOnDismissListener {
                    java.util.Locale.setDefault(prevLocale)
                    @Suppress("DEPRECATION")
                    res.updateConfiguration(origConf, res.displayMetrics)
                    onDismissRequest()
                }
                dlg.setOnCancelListener {
                    java.util.Locale.setDefault(prevLocale)
                    @Suppress("DEPRECATION")
                    res.updateConfiguration(origConf, res.displayMetrics)
                    onDismissRequest()
                }
                if (!activity.isDestroyed) dlg.show() else onDismissRequest()
            } else {
                onDismissRequest()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AppTimePickerDialog(
    initialHour: Int,
    initialMinute: Int,
    onDismissRequest: () -> Unit,
    onTimeSelected: (Int, Int) -> Unit
) {
    val context = LocalContext.current
    val shown = rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        if (!shown.value) {
            shown.value = true
            val activity = (context as? android.app.Activity)
            if (activity != null && !activity.isFinishing) {
                val prevLocale = java.util.Locale.getDefault()
                val res = activity.resources
                val origConf = android.content.res.Configuration(res.configuration)
                val newConf = android.content.res.Configuration(origConf)
                try {
                    newConf.setLocales(android.os.LocaleList(java.util.Locale.ENGLISH))
                } catch (_: Throwable) {
                    @Suppress("DEPRECATION")
                    newConf.setLocale(java.util.Locale.ENGLISH)
                }
                java.util.Locale.setDefault(java.util.Locale.ENGLISH)
                @Suppress("DEPRECATION")
                res.updateConfiguration(newConf, res.displayMetrics)
                val dlg = android.app.TimePickerDialog(
                    activity,
                    { _, h, m -> onTimeSelected(h, m) },
                    initialHour,
                    initialMinute,
                    true
                )
                dlg.setOnDismissListener {
                    java.util.Locale.setDefault(prevLocale)
                    @Suppress("DEPRECATION")
                    res.updateConfiguration(origConf, res.displayMetrics)
                    onDismissRequest()
                }
                dlg.setOnCancelListener {
                    java.util.Locale.setDefault(prevLocale)
                    @Suppress("DEPRECATION")
                    res.updateConfiguration(origConf, res.displayMetrics)
                    onDismissRequest()
                }
                if (!activity.isDestroyed) dlg.show() else onDismissRequest()
            } else {
                onDismissRequest()
            }
        }
    }
}

private fun formatDateTime(millis: Long?, hour: Int, minute: Int): String {
    return if (millis == null) "בחר תאריך" else {
        val cal = java.util.Calendar.getInstance().apply {
            timeInMillis = millis
            set(java.util.Calendar.HOUR_OF_DAY, hour)
            set(java.util.Calendar.MINUTE, minute)
        }
        val df = java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", java.util.Locale.getDefault())
        df.format(cal.time)
    }
}

private fun combineDateTime(dateMillis: Long, hour: Int, minute: Int): Long {
    val cal = java.util.Calendar.getInstance().apply {
        timeInMillis = dateMillis
        set(java.util.Calendar.HOUR_OF_DAY, hour)
        set(java.util.Calendar.MINUTE, minute)
        set(java.util.Calendar.SECOND, 0)
        set(java.util.Calendar.MILLISECOND, 0)
    }
    return cal.timeInMillis
}


@Composable
private fun ReservationHistoryDialog(
    reservations: List<com.rentacar.app.data.Reservation>,
    onDismiss: () -> Unit
) {
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { Button(onClick = onDismiss) { Text("סגור") } },
        title = { Text("היסטוריית הזמנות") },
        text = {
            if (reservations.isEmpty()) {
                Text("אין הזמנות קודמות ללקוח זה")
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxWidth().height(400.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(reservations) { r ->
                        val df = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
                        val from = df.format(java.util.Date(r.dateFrom))
                        val to = df.format(java.util.Date(r.dateTo))
                        val usePlane = (r.notes ?: "").contains("נתב\"ג") || r.airportMode
                        
                        val item = com.rentacar.app.ui.components.ReservationListItem(
                            reservationId = r.id,
                            title = "הזמנה #${r.id}",
                            subtitle = "$from - $to",
                            price = "${r.agreedPrice}₪",
                            usePlaneIcon = usePlane,
                            isQuote = r.isQuote,
                            supplierOrderNumber = r.supplierOrderNumber,
                            commissionText = null,
                            dateFromMillis = r.dateFrom,
                            isCancelled = r.status == com.rentacar.app.data.ReservationStatus.Cancelled,
                            isClosed = r.actualReturnDate != null
                        )
                        
                        com.rentacar.app.ui.components.ReservationRow(
                            item = item,
                            onClick = {}
                        )
                    }
                }
            }
        }
    )
}


@Composable
private fun SupplierPickerDialog(
    suppliers: List<com.rentacar.app.data.Supplier>,
    onDismiss: () -> Unit,
    onSelect: (Long) -> Unit
) {
    com.rentacar.app.ui.dialogs.ModernSelectionDialog(
        title = "בחר ספק",
        headerIcon = Icons.Filled.Business,
        items = suppliers.map { s ->
            com.rentacar.app.ui.dialogs.ModernSelectionItem(
                key = s.id.toString(),
                title = s.name,
                subtitle = listOfNotNull(s.phone, s.email).joinToString(" · ").ifBlank { null },
                icon = Icons.Filled.DirectionsCar
            )
        },
        selectedKey = null,
        onItemSelected = { key ->
            key.toLongOrNull()?.let(onSelect)
        },
        onDismiss = onDismiss,
        searchEnabled = true,
        searchPlaceholder = "חיפוש ספק"
    )
}

@Composable
private fun BranchPickerDialog(
    branches: List<com.rentacar.app.data.Branch>,
    onDismiss: () -> Unit,
    onSelect: (Long) -> Unit,
    onEdit: (com.rentacar.app.data.Branch) -> Unit,
    supplierId: Long?,
    onAddBranchScreen: () -> Unit
) {
    // Selection presentation only. Extra params retained for call-site signature compatibility.
    @Suppress("UNUSED_PARAMETER")
    val _onEdit = onEdit
    @Suppress("UNUSED_PARAMETER")
    val _supplierId = supplierId
    @Suppress("UNUSED_PARAMETER")
    val _onAdd = onAddBranchScreen

    com.rentacar.app.ui.dialogs.ModernSelectionDialog(
        title = "בחר סניף",
        headerIcon = Icons.Filled.Store,
        items = branches.map { b ->
            com.rentacar.app.ui.dialogs.ModernSelectionItem(
                key = b.id.toString(),
                title = b.name,
                subtitle = listOfNotNull(b.city, b.street, b.phone).joinToString(" · ").ifBlank { null },
                icon = Icons.Filled.LocationOn
            )
        },
        selectedKey = null,
        onItemSelected = { key ->
            key.toLongOrNull()?.let(onSelect)
        },
        onDismiss = onDismiss,
        searchEnabled = true,
        searchPlaceholder = "חיפוש סניף"
    )
}

@Composable
private fun AgentPickerDialog(
    agents: List<com.rentacar.app.data.Agent>,
    onDismiss: () -> Unit,
    onSelect: (Long) -> Unit
) {
    com.rentacar.app.ui.dialogs.ModernSelectionDialog(
        title = "בחר סוכן",
        headerIcon = Icons.Filled.Person,
        items = agents.map { a ->
            com.rentacar.app.ui.dialogs.ModernSelectionItem(
                key = a.id.toString(),
                title = a.name,
                subtitle = listOfNotNull(a.phone, a.email).joinToString(" · ").ifBlank { null },
                icon = Icons.Filled.AccountCircle
            )
        },
        selectedKey = null,
        onItemSelected = { key ->
            key.toLongOrNull()?.let(onSelect)
        },
        onDismiss = onDismiss,
        searchEnabled = true,
        searchPlaceholder = "חיפוש סוכן"
    )
}


@Deprecated(
    message = "Legacy commissions screen – use ReservationsManageScreen with showCommissions instead",
    replaceWith = ReplaceWith("ReservationsManageScreen(navController, vm, initialShowCommissions = true)")
)
@Composable
fun CommissionsManageScreen(navController: NavHostController, vm: ReservationViewModel) {
    val reservations by vm.allReservations.collectAsState()
    val customers by vm.customerList.collectAsState()
    val suppliers by vm.suppliers.collectAsState()
    
    var fromDateFilter by rememberSaveable { mutableStateOf("") }
    var toDateFilter by rememberSaveable { mutableStateOf("") }
    var supplierFilterId by rememberSaveable { mutableStateOf<Long?>(null) }
    var supplierExpanded by rememberSaveable { mutableStateOf(false) }
    
    // Calculate all commissions (not just next month)
    fun calculateAllCommissions(): List<CommissionDueItem> {
        return reservations.filter { r ->
            r.status != com.rentacar.app.data.ReservationStatus.Cancelled
        }.map { r ->
            val cust = customers.find { it.id == r.customerId }
            val supplier = suppliers.find { it.id == r.supplierId }
            val days = diffDays(r.dateFrom, r.dateTo).coerceAtLeast(1)
            val basePrice = r.agreedPrice
            val commissionAmount = com.rentacar.app.domain.CommissionCalculator.calculate(days, basePrice).amount
            
            // Calculate commission due date (end date + 1 month)
            val commissionDueDate = java.util.Calendar.getInstance().apply { 
                timeInMillis = r.dateTo 
                add(java.util.Calendar.MONTH, 1)
            }.timeInMillis
            
            CommissionDueItem(
                reservationId = r.id,
                customerName = listOfNotNull(cust?.firstName, cust?.lastName).joinToString(" ").ifBlank { "—" },
                supplierName = supplier?.name ?: "—",
                days = days,
                price = basePrice,
                commissionAmount = commissionAmount,
                endDate = r.dateTo,
                commissionDueDate = commissionDueDate,
                isMonthly = days >= 24
            )
        }
    }
    
    val allCommissions = calculateAllCommissions()
    
    // Apply filters
    val filtered = allCommissions.filter { item ->
        // Date filter based on commission due date
        val matchesDateRange = run {
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
            when {
                fromStart == null && toEnd == null -> true
                fromStart != null && toEnd == null -> item.commissionDueDate >= fromStart
                fromStart == null && toEnd != null -> item.commissionDueDate <= toEnd
                else -> (item.commissionDueDate in fromStart!!..toEnd!!)
            }
        }
        
        // Supplier filter
        val matchesSupplier = supplierFilterId?.let { 
            reservations.find { r -> r.id == item.reservationId }?.supplierId == it 
        } ?: true
        
        matchesDateRange && matchesSupplier
    }
    
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        TitleBar(
            title = "ניהול עמלות",
            color = LocalTitleColor.current,
            onHomeClick = { navController.navigate(com.rentacar.app.ui.navigation.Routes.ReservationsManage) }
        )
        Spacer(Modifier.height(12.dp))
        
        // Filter row
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // From date filter
            val context = LocalContext.current
            androidx.compose.material3.FloatingActionButton(onClick = {
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
                android.app.DatePickerDialog(context, { _, y, m, d ->
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
                                android.widget.Toast.makeText(context, "תאריך התחלה לא יכול להיות גדול מתאריך הסיום", android.widget.Toast.LENGTH_LONG).show()
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
                    Text(if (fromDateFilter.isBlank()) "מתאריך" else fromDateFilter, fontSize = responsiveFontSize(10f))
                }
            }
            
            // To date filter
            androidx.compose.material3.FloatingActionButton(onClick = {
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
                android.app.DatePickerDialog(context, { _, y, m, d ->
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
                                android.widget.Toast.makeText(context, "תאריך סיום לא יכול להיות קטן מתאריך ההתחלה", android.widget.Toast.LENGTH_LONG).show()
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
                    Text(if (toDateFilter.isBlank()) "עד תאריך" else toDateFilter, fontSize = responsiveFontSize(10f))
                }
            }
            
            // Supplier filter
            val currentLabel = if (supplierFilterId == null) "כל הספקים" else suppliers.find { it.id == supplierFilterId }?.name ?: "ספק לא נמצא"
            androidx.compose.material3.FloatingActionButton(onClick = { supplierExpanded = true }) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Icon(Icons.Filled.Domain, contentDescription = null)
                    Spacer(Modifier.height(2.dp))
                    Text(currentLabel, fontSize = responsiveFontSize(10f))
                }
            }
        }
        
        Spacer(Modifier.height(12.dp))
        
        // Supplier dropdown
        if (supplierExpanded) {
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { supplierExpanded = false },
                confirmButton = {},
                title = { Text("סינון לפי ספק") },
                text = {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        androidx.compose.foundation.lazy.LazyColumn(modifier = Modifier.fillMaxWidth().height(200.dp)) {
                            item { 
                                Row(modifier = Modifier.fillMaxWidth().clickable { 
                                    supplierFilterId = null
                                    supplierExpanded = false 
                                }.padding(vertical = 8.dp)) { 
                                    Text("כל הספקים") 
                                } 
                            }
                            items(suppliers) { supplier ->
                                Row(modifier = Modifier.fillMaxWidth().clickable { 
                                    supplierFilterId = supplier.id
                                    supplierExpanded = false 
                                }.padding(vertical = 8.dp)) { 
                                    Text(supplier.name) 
                                }
                            }
                        }
                    }
                },
                dismissButton = { androidx.compose.material3.Button(onClick = { supplierExpanded = false }) { Text("סגור") } }
            )
        }
        
        // Commissions list - using same structure as ReservationsManageScreen
        androidx.compose.foundation.layout.Box(modifier = Modifier.weight(1f)) {
            val itemsUi = filtered.map { item ->
                val dfDt = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
                val dueDate = dfDt.format(java.util.Date(item.commissionDueDate))
                val endDate = dfDt.format(java.util.Date(item.endDate))
                
                // Find the original reservation to get proper status and icons
                val originalReservation = reservations.find { it.id == item.reservationId }
                val usePlane = (originalReservation?.notes ?: "").contains("נתב\"ג") || (originalReservation?.airportMode ?: false)
                
                com.rentacar.app.ui.components.ReservationListItem(
                    reservationId = item.reservationId,
                    title = "· ${item.reservationId} · ${item.customerName}",
                    subtitle = "סיום: $endDate · תשלום: $dueDate",
                    price = item.supplierName,
                    supplierOrderNumber = originalReservation?.supplierOrderNumber,
                    dateFromMillis = originalReservation?.dateFrom ?: item.commissionDueDate, // Use original reservation date for colors
                    isCancelled = originalReservation?.status == com.rentacar.app.data.ReservationStatus.Cancelled,
                    isClosed = originalReservation?.actualReturnDate != null,
                    usePlaneIcon = usePlane,
                    isQuote = originalReservation?.isQuote ?: false,
                    commissionText = "עמלה: ₪${"%.0f".format(item.commissionAmount)}"
                )
            }
            com.rentacar.app.ui.components.ReservationsList(itemsUi) { item ->
                val id = item.reservationId
                if (id != null) navController.navigate("edit_reservation/$id")
            }
        }
        
        // Summary bar
        androidx.compose.foundation.layout.Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp)
                .padding(top = 8.dp)
                .background(LocalTitleColor.current)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp)
                    .align(Alignment.Center),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
            ) {
                Text("עמלות: ${filtered.size}", color = com.rentacar.app.LocalTitleTextColor.current)
                Text("סה\"כ עמלה: ₪${"%.0f".format(filtered.sumOf { it.commissionAmount })}", color = com.rentacar.app.LocalTitleTextColor.current)
            }
        }
    }
}

/**
 * LEGACY DTO – used only by deprecated CommissionsManageScreen.
 * 
 * New commission implementation uses CommissionInstallment from domain layer.
 * 
 * @deprecated Legacy commission data class – use CommissionInstallment instead
 */
@Deprecated("Legacy commission DTO – use CommissionInstallment instead")
data class CommissionDueItem(
    val reservationId: Long,
    val customerName: String,
    val supplierName: String,
    val days: Int,
    val price: Double,
    val commissionAmount: Double,
    val endDate: Long,
    val commissionDueDate: Long,
    val isMonthly: Boolean
)


