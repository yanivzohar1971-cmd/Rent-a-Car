package com.rentacar.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.Switch
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.rentacar.app.data.Customer
import com.rentacar.app.ui.vm.CustomerViewModel
import com.rentacar.app.ui.components.BackButton
import com.rentacar.app.ui.components.CustomerCard
import com.rentacar.app.ui.components.StandardList
import com.rentacar.app.ui.components.ListItemModel
import com.rentacar.app.ui.components.AppButton
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.ui.components.AppSearchBar
import com.rentacar.app.ui.components.AppEmptySearchState
import com.rentacar.app.LocalTitleColor
import androidx.compose.runtime.remember
import androidx.compose.runtime.derivedStateOf
import kotlinx.coroutines.delay
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Domain
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Save
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.Canvas
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.alpha
import kotlin.math.min
import androidx.compose.material3.FloatingActionButton
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.TextStyle
import android.widget.Toast
import androidx.compose.material3.ExperimentalMaterial3Api
import android.content.Intent
import android.net.Uri

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomersListScreen(navController: NavHostController, vm: CustomerViewModel, reservationVm: com.rentacar.app.ui.vm.ReservationViewModel) {
    val allCustomers by vm.list.collectAsState()
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var debouncedQuery by remember { mutableStateOf("") }
    var selectedId by rememberSaveable { mutableStateOf<Long?>(null) }
    var showConfirmDelete by rememberSaveable { mutableStateOf(false) }
    var showHistory by rememberSaveable { mutableStateOf(false) }
    
    // Debounce search query
    LaunchedEffect(searchQuery) {
        delay(300)
        debouncedQuery = searchQuery
    }
    
    // Apply search filter
    val list by remember(debouncedQuery, allCustomers) {
        derivedStateOf {
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

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        TitleBar(
            title = "לקוחות",
            color = LocalTitleColor.current,
            onHomeClick = { navController.navigate(com.rentacar.app.ui.navigation.Routes.Dashboard) }
        )
        Spacer(Modifier.height(12.dp))
        
        // Modern search bar
        AppSearchBar(
            query = searchQuery,
            onQueryChange = { searchQuery = it },
            placeholder = "חיפוש לקוח לפי שם, טלפון או ת.ז..."
        )
        
        Spacer(Modifier.height(12.dp))
        
        // Show list or empty state
        if (list.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
            ) {
                AppEmptySearchState(
                    message = if (debouncedQuery.isNotEmpty()) {
                        "לא נמצאו תוצאות תואמות לחיפוש שלך."
                    } else {
                        "אין לקוחות להצגה."
                    }
                )
            }
        } else {
            androidx.compose.foundation.lazy.LazyColumn(modifier = Modifier.fillMaxWidth().weight(1f)) {
                items(list, key = { it.id }) { customer ->
                    val isSelected = customer.id == selectedId
                    val context = androidx.compose.ui.platform.LocalContext.current
                    
                    CustomerCard(
                        customer = customer,
                        isSelected = isSelected,
                        onClick = { selectedId = customer.id },
                        onCallClick = {
                            val intent = Intent(Intent.ACTION_DIAL).apply {
                                data = Uri.parse("tel:${customer.phone}")
                            }
                            context.startActivity(intent)
                        }
                    )
                }
            }
        }
        
        Spacer(Modifier.height(8.dp))
        
        // Bottom buttons - aligned to the right side with spacing
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
            verticalAlignment = Alignment.Bottom
        ) {
            // Edit button
            FloatingActionButton(
                onClick = { 
                    if (selectedId != null) {
                        navController.navigate("customer_edit/$selectedId")
                    }
                },
                modifier = Modifier.alpha(if (selectedId != null) 1f else 0.3f)
            ) {
                androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Text("✏️", modifier = Modifier.graphicsLayer(scaleX = -1f, scaleY = 1f))
                    Spacer(Modifier.height(2.dp))
                    Text("עריכה", fontSize = 10.sp)
                }
            }
            
            // New Reservation button
            FloatingActionButton(
                onClick = { 
                    if (selectedId != null) {
                        navController.navigate("new_reservation/$selectedId")
                    }
                },
                modifier = Modifier.alpha(if (selectedId != null) 1f else 0.3f)
            ) {
                androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Icon(imageVector = Icons.Filled.DirectionsCar, contentDescription = null, modifier = Modifier.size(24.dp))
                    Spacer(Modifier.height(2.dp))
                    Text("הזמנה", fontSize = 10.sp)
                }
            }
            
            // New button
            FloatingActionButton(onClick = { navController.navigate("customer_edit") }) {
            androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                Icon(imageVector = Icons.Filled.Person, contentDescription = null, modifier = Modifier.size(24.dp))
                Spacer(Modifier.height(2.dp))
                Text("חדש", fontSize = 10.sp)
            }
        }
            
                    // History button
            val history = selectedId?.let { custId ->
                val cust = list.firstOrNull { it.id == custId }
                cust?.id?.let { customerId ->
                    vm.customerReservations(customerId)?.collectAsState(initial = emptyList())?.value ?: emptyList()
                } ?: emptyList()
            } ?: emptyList()
            FloatingActionButton(
                onClick = { 
                    if (selectedId != null && history.isNotEmpty()) {
                        showHistory = true
                    }
                },
                modifier = Modifier.alpha(if (selectedId != null && history.isNotEmpty()) 1f else 0.3f)
            ) {
                androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Text("🕘", fontSize = 18.sp)
                    Spacer(Modifier.height(2.dp))
                    Text("היסטוריה", fontSize = 10.sp)
                }
            }
            
            // Delete button
            val selectedCustomer = list.firstOrNull { it.id == selectedId }
            val hasReservations = selectedCustomer?.id?.let { customerId ->
                reservationVm.reservationsByCustomer(customerId).collectAsState(initial = emptyList()).value.isNotEmpty()
            } ?: false
            val deleteEnabled = selectedId != null && !hasReservations
            FloatingActionButton(
                onClick = {
                    if (deleteEnabled) showConfirmDelete = true
                },
                modifier = Modifier.alpha(if (deleteEnabled) 1f else 0.3f)
            ) {
                androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Icon(imageVector = Icons.Filled.Delete, contentDescription = null, modifier = Modifier.size(24.dp))
                    Spacer(Modifier.height(2.dp))
                    Text("מחק", fontSize = 10.sp)
                }
            }
        }
    }
    
    // Delete confirmation dialog
    if (showConfirmDelete) {
        val selectedCustomer = list.firstOrNull { it.id == selectedId }
        val hasReservations = selectedCustomer?.id?.let { customerId ->
            reservationVm.reservationsByCustomer(customerId).collectAsState(initial = emptyList()).value.isNotEmpty()
        } ?: false
        
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showConfirmDelete = false },
            title = { Text("מחיקת לקוח") },
            text = { 
                if (hasReservations) {
                    Text("לא ניתן למחוק לקוח שבוצעה לו הזמנה בעבר!")
                } else {
                    Text("האם אתה בטוח שברצונך למחוק את הלקוח?")
                }
            },
            confirmButton = {
                if (!hasReservations) {
                        androidx.compose.material3.TextButton(
                            onClick = {
                                selectedId?.let { id ->
                                    // TODO: Add delete method to CustomerViewModel
                                    // vm.delete(id)
                                    selectedId = null
                                }
                                showConfirmDelete = false
                            }
                        ) {
                            Text("מחק")
                        }
                }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(
                    onClick = { showConfirmDelete = false }
                ) {
                    Text(if (hasReservations) "אישור" else "בטל")
                }
            }
        )
    }
    
    // History dialog
    if (showHistory && selectedId != null) {
        val selectedCustomer = list.firstOrNull { it.id == selectedId }
        val history = selectedCustomer?.id?.let { customerId ->
            vm.customerReservations(customerId)?.collectAsState(initial = emptyList())?.value ?: emptyList()
        } ?: emptyList()
        
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showHistory = false },
            confirmButton = { AppButton(onClick = { showHistory = false }) { Text("סגור") } },
            title = { 
                Column(modifier = Modifier.fillMaxWidth()) {
                    // Title line
                    Text(
                        text = "היסטוריית הזמנות",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.height(8.dp))
                    // Customer name line with modern styling
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f),
                                RoundedCornerShape(12.dp)
                            )
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "${selectedCustomer?.firstName} ${selectedCustomer?.lastName}",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            },
            text = {
                if (history.isEmpty()) {
                    Text("אין הזמנות קודמות ללקוח זה")
                } else {
                    androidx.compose.foundation.lazy.LazyColumn(
                        modifier = Modifier.fillMaxWidth().height(400.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(history) { r ->
                            val df = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
                            val from = df.format(java.util.Date(r.dateFrom))
                            val to = df.format(java.util.Date(r.dateTo))
                            val usePlane = (r.notes ?: "").contains("נתב\"ג") || r.airportMode
                            
                            val item = com.rentacar.app.ui.components.ReservationListItem(
                                reservationId = r.id,
                                title = "הזמנה #${r.id}",
                                subtitle = "$from - $to",
                                price = "${r.agreedPrice}₪",
                                dateFromMillis = r.dateFrom,
                                supplierOrderNumber = r.supplierOrderNumber,
                                usePlaneIcon = usePlane,
                                isQuote = r.isQuote,
                                commissionText = null,
                                isCancelled = r.status == com.rentacar.app.data.ReservationStatus.Cancelled,
                                isClosed = r.actualReturnDate != null
                            )
                            
                            com.rentacar.app.ui.components.ReservationRow(
                                item = item,
                                onClick = { navController.navigate("edit_reservation/${r.id}") }
                            )
                        }
                    }
                }
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomerEditScreen(navController: NavHostController, vm: CustomerViewModel, id: Long? = null) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val existing = id?.let { vm.customer(it).collectAsState(initial = null).value }

    var firstName by rememberSaveable { mutableStateOf(existing?.firstName ?: "") }
    var lastName by rememberSaveable { mutableStateOf(existing?.lastName ?: "") }
    var phone by rememberSaveable { mutableStateOf(existing?.phone ?: "") }
    var tzId by rememberSaveable { mutableStateOf(existing?.tzId ?: "") }
    var isCompany by rememberSaveable { mutableStateOf(existing?.isCompany ?: false) }
    var address by rememberSaveable { mutableStateOf(existing?.address ?: "") }
    var email by rememberSaveable { mutableStateOf(existing?.email ?: "") }

    var appliedPrefill by rememberSaveable { mutableStateOf(false) }
    var attemptedSave by rememberSaveable { mutableStateOf(false) }
    var showHistory by rememberSaveable { mutableStateOf(false) }
    val history = existing?.id?.let { cid -> vm.customerReservations(cid)?.collectAsState(initial = emptyList())?.value } ?: emptyList()
    LaunchedEffect(existing?.id) {
        if (!appliedPrefill && existing != null) {
            firstName = existing.firstName
            lastName = existing.lastName
            phone = existing.phone
            tzId = existing.tzId ?: ""
            address = existing.address ?: ""
            email = existing.email ?: ""
            isCompany = existing.isCompany
            appliedPrefill = true
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
                .padding(bottom = 80.dp)
                .verticalScroll(rememberScrollState())
        ) {
            TitleBar(
                if (id == null) "לקוח חדש" else "עריכת לקוח",
                LocalTitleColor.current,
                onHomeClick = { navController.navigate(com.rentacar.app.ui.navigation.Routes.Dashboard) }
            )
            Spacer(Modifier.height(16.dp))
            
            // סוג לקוח
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "סוג לקוח",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.clickable { isCompany = false }
                        ) {
                            RadioButton(selected = !isCompany, onClick = { isCompany = false })
                            Text("פרטי", modifier = Modifier.padding(start = 6.dp))
                        }
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.clickable { isCompany = true }
                        ) {
                            RadioButton(selected = isCompany, onClick = { isCompany = true })
                            Text("חברה", modifier = Modifier.padding(start = 6.dp))
                        }
                    }
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            // פרטים אישיים - Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    // כותרת
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "פרטים אישיים",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // שם פרטי / חברה
                    OutlinedTextField(
                        value = firstName,
                        onValueChange = { firstName = it },
                        label = { Text(if (isCompany) "שם חברה *" else "שם פרטי *") },
                        leadingIcon = {
                            Icon(
                                imageVector = if (isCompany) Icons.Default.Domain else Icons.Default.Person,
                                contentDescription = null,
                                tint = if (attemptedSave && firstName.isBlank()) 
                                    MaterialTheme.colorScheme.error 
                                else 
                                    MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        singleLine = true,
                        colors = TextFieldDefaults.outlinedTextFieldColors(
                            containerColor = if (firstName.isBlank()) Color(0xFFFFC1B6) else Color.Unspecified
                        ),
                        isError = attemptedSave && firstName.isBlank(),
                        supportingText = { if (attemptedSave && firstName.isBlank()) Text("שדה חובה") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    if (!isCompany) {
                        Spacer(Modifier.height(12.dp))
                        // שם משפחה
                        OutlinedTextField(
                            value = lastName,
                            onValueChange = { lastName = it },
                            label = { Text("שם משפחה *") },
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Default.Person,
                                    contentDescription = null,
                                    tint = if (attemptedSave && lastName.isBlank()) 
                                        MaterialTheme.colorScheme.error 
                                    else 
                                        MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            },
                            singleLine = true,
                            colors = TextFieldDefaults.outlinedTextFieldColors(
                                containerColor = if (lastName.isBlank()) Color(0xFFFFC1B6) else Color.Unspecified
                            ),
                            isError = attemptedSave && lastName.isBlank(),
                            supportingText = { if (attemptedSave && lastName.isBlank()) Text("שדה חובה") },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // ת.ז / ח.פ.
                    OutlinedTextField(
                        value = tzId,
                        onValueChange = { tzId = it },
                        label = { Text((if (isCompany) "ח.פ." else "ת" + "ז") + " *") },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Description,
                                contentDescription = null,
                                tint = if (attemptedSave && tzId.isBlank()) 
                                    MaterialTheme.colorScheme.error 
                                else 
                                    MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        singleLine = true,
                        colors = TextFieldDefaults.outlinedTextFieldColors(
                            containerColor = if (tzId.isBlank()) Color(0xFFFFC1B6) else Color.Unspecified
                        ),
                        isError = attemptedSave && tzId.isBlank(),
                        supportingText = { if (attemptedSave && tzId.isBlank()) Text("שדה חובה") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            // פרטי קשר - Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    // כותרת
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Phone,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "פרטי קשר",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // טלפון
                    OutlinedTextField(
                        value = phone,
                        onValueChange = { phone = it },
                        label = { Text("טלפון *") },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Phone,
                                contentDescription = null,
                                tint = if (attemptedSave && phone.isBlank()) 
                                    MaterialTheme.colorScheme.error 
                                else 
                                    MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        singleLine = true,
                        colors = TextFieldDefaults.outlinedTextFieldColors(
                            containerColor = if (phone.isBlank()) Color(0xFFFFC1B6) else Color.Unspecified
                        ),
                        isError = attemptedSave && phone.isBlank(),
                        supportingText = { if (attemptedSave && phone.isBlank()) Text("שדה חובה") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // כתובת
                    OutlinedTextField(
                        value = address,
                        onValueChange = { address = it },
                        label = { Text("כתובת") },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.LocationOn,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // Email
                    OutlinedTextField(
                        value = email,
                        onValueChange = { new ->
                            val allowed: (Char) -> Boolean = { ch ->
                                (ch in 'a'..'z') || (ch in 'A'..'Z') || ch.isDigit() || ch in setOf('@', '.', '_', '-', '+', '\'')
                            }
                            email = new.filter(allowed)
                        },
                        label = { Text("Email", textAlign = TextAlign.End, modifier = Modifier.fillMaxWidth()) },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Email,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        textStyle = TextStyle(textDirection = TextDirection.Ltr),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
            
            Spacer(Modifier.height(16.dp))
        }
        
        // Fixed bottom action bar
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface)
                .padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // כפתור ביטול
            androidx.compose.material3.FloatingActionButton(
                onClick = { navController.navigate(com.rentacar.app.ui.navigation.Routes.Dashboard) },
                modifier = Modifier.weight(1f),
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            ) {
                Row(
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(horizontal = 16.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "בטל",
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text("בטל", fontWeight = FontWeight.Medium)
                }
            }
            
            // Call button - only if phone is not blank
            if (phone.isNotBlank()) {
                androidx.compose.material3.FloatingActionButton(
                    onClick = {
                        val intent = Intent(Intent.ACTION_DIAL).apply {
                            data = Uri.parse("tel:$phone")
                        }
                        context.startActivity(intent)
                    },
                    containerColor = Color(0xFF4CAF50)
                ) {
                    Row(
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 12.dp)
                    ) {
                        androidx.compose.material3.Icon(
                            imageVector = Icons.Filled.Phone,
                            contentDescription = "חייג",
                            modifier = Modifier.size(20.dp),
                            tint = Color.White
                        )
                        Spacer(Modifier.width(6.dp))
                        Text("חייג", fontSize = 12.sp, color = Color.White, fontWeight = FontWeight.Medium)
                    }
                }
            }
            
            // History button - only if editing existing customer
            if (id != null && history.isNotEmpty()) {
                androidx.compose.material3.FloatingActionButton(
                    onClick = { showHistory = true },
                    containerColor = MaterialTheme.colorScheme.secondaryContainer
                ) {
                    Row(
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 12.dp)
                    ) {
                        Text("🕘", fontSize = 18.sp)
                        Spacer(Modifier.width(4.dp))
                        Text("היסטוריה", fontSize = 10.sp, fontWeight = FontWeight.Medium)
                    }
                }
            }
            
            // כפתור שמירה
            androidx.compose.material3.FloatingActionButton(
                onClick = {
                    val isValid = firstName.isNotBlank() && phone.isNotBlank() && (if (isCompany) true else lastName.isNotBlank())
                    if (!isValid) {
                        attemptedSave = true
                        Toast.makeText(
                            context,
                            if (isCompany) "יש למלא שם חברה וטלפון" else "יש למלא שם פרטי, שם משפחה וטלפון",
                            Toast.LENGTH_SHORT
                        ).show()
                        return@FloatingActionButton
                    }
                    val customer = if (existing != null) existing.copy(
                        firstName = firstName,
                        lastName = lastName,
                        phone = phone,
                        tzId = tzId.ifBlank { null },
                        isCompany = isCompany,
                        address = address.ifBlank { null },
                        email = email.ifBlank { null }
                    ) else Customer(
                        firstName = firstName,
                        lastName = lastName,
                        phone = phone,
                        tzId = tzId.ifBlank { null },
                        isCompany = isCompany,
                        address = address.ifBlank { null },
                        email = email.ifBlank { null }
                    )
                    vm.save(customer, onDone = { navController.popBackStack() }, onError = {
                        Toast.makeText(context, it, Toast.LENGTH_SHORT).show()
                    })
                },
                modifier = Modifier
                    .weight(1f)
                    .alpha(if (firstName.isNotBlank() && phone.isNotBlank() && (if (isCompany) true else lastName.isNotBlank())) 1f else 0.5f),
                containerColor = MaterialTheme.colorScheme.primaryContainer
            ) {
                Row(
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(horizontal = 16.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Save,
                        contentDescription = "שמור",
                        modifier = Modifier.size(20.dp),
                        tint = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "שמור",
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }
        }
    }
    
    // History dialog
    if (id != null && showHistory) {
        val df = java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", java.util.Locale.getDefault())
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showHistory = false },
            confirmButton = { AppButton(onClick = { showHistory = false }) { Text("סגור") } },
            title = { 
                Column(modifier = Modifier.fillMaxWidth()) {
                    // Title line
                    Text(
                        text = "היסטוריית הזמנות",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.height(8.dp))
                    // Customer name line with modern styling
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f),
                                RoundedCornerShape(12.dp)
                            )
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "${existing?.firstName} ${existing?.lastName}",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            },
            text = {
                if (history.isEmpty()) {
                    Text("אין הזמנות קודמות ללקוח זה")
                } else {
                    androidx.compose.foundation.lazy.LazyColumn(
                        modifier = Modifier.fillMaxWidth().height(400.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(history) { r ->
                            val dfDt = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
                            val from = dfDt.format(java.util.Date(r.dateFrom))
                            val to = dfDt.format(java.util.Date(r.dateTo))
                            val usePlane = (r.notes ?: "").contains("נתב\"ג") || r.airportMode
                            
                            val item = com.rentacar.app.ui.components.ReservationListItem(
                                reservationId = r.id,
                                title = "הזמנה #${r.id}",
                                subtitle = "$from - $to",
                                price = "${r.agreedPrice}₪",
                                dateFromMillis = r.dateFrom,
                                supplierOrderNumber = r.supplierOrderNumber,
                                usePlaneIcon = usePlane,
                                isQuote = r.isQuote,
                                commissionText = null,
                                isCancelled = r.status == com.rentacar.app.data.ReservationStatus.Cancelled,
                                isClosed = r.actualReturnDate != null
                            )
                            
                            com.rentacar.app.ui.components.ReservationRow(
                                item = item,
                                onClick = { navController.navigate("edit_reservation/${r.id}") }
                            )
                        }
                    }
                }
            }
        )
    }
}

@Composable
fun CustomerDetailsScreen(navController: NavHostController, customer: Customer, reservationVm: com.rentacar.app.ui.vm.ReservationViewModel? = null) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        TitleBar("פרטי לקוח", LocalTitleColor.current, onHomeClick = { navController.navigate(com.rentacar.app.ui.navigation.Routes.Dashboard) })
        Spacer(Modifier.height(8.dp))
        Text("${customer.firstName} ${customer.lastName}")
        Spacer(Modifier.height(12.dp))
        if (reservationVm != null) {
            val history = reservationVm.reservationsByCustomer(customer.id).collectAsState(initial = emptyList()).value
            val suppliers = reservationVm.suppliers.collectAsState().value
            val df = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
            val itemsUi = history.map { r ->
                val from = df.format(java.util.Date(r.dateFrom))
                val to = df.format(java.util.Date(r.dateTo))
                val supplierName = suppliers.find { it.id == r.supplierId }?.name ?: "—"
                val usePlane = (r.notes ?: "").contains("נתב\"ג") || r.airportMode
                com.rentacar.app.ui.components.ReservationListItem(
                    reservationId = r.id,
                    title = "· ${r.id} · ${supplierName}",
                    subtitle = "$from - $to",
                    price = "${r.agreedPrice}₪",
                    usePlaneIcon = usePlane,
                    isQuote = r.isQuote,
                    supplierOrderNumber = r.supplierOrderNumber,
                    commissionText = null
                )
            }
            com.rentacar.app.ui.components.ReservationsList(itemsUi) { item ->
                val id = item.reservationId
                if (id != null) navController.navigate("edit_reservation/$id")
            }
        }
        Spacer(Modifier.height(12.dp))
    }
}

@Composable
fun CustomerCard(
    customer: Customer,
    isSelected: Boolean,
    onClick: () -> Unit,
    onCallClick: () -> Unit
) {
    val cardColor = Color(0xFF9C27B0) // Purple for customers
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 6.dp),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = if (isSelected) 8.dp else 2.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) {
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
            } else {
                MaterialTheme.colorScheme.surface
            }
        )
    ) {
        Row(modifier = Modifier.fillMaxWidth()) {
            // Vertical color bar (RIGHT side for RTL)
            Box(
                modifier = Modifier
                    .width(8.dp)
                    .height(78.dp)
                    .background(
                        cardColor,
                        RoundedCornerShape(topEnd = 16.dp, bottomEnd = 16.dp)
                    )
            )
            
            Spacer(Modifier.width(12.dp))
            
            // Main content
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(vertical = 12.dp, horizontal = 4.dp)
            ) {
                // Header: Name + icon bubble
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "${customer.firstName} ${customer.lastName}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f)
                    )
                    
                    // Icon bubble
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .background(cardColor, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
                
                Spacer(Modifier.height(1.5.dp))
                
                // Phone + TZ line
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Phone,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = customer.phone ?: "—",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    
                    // Call button if selected and has phone
                    if (isSelected && !customer.phone.isNullOrBlank()) {
                        IconButton(
                            onClick = onCallClick,
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Phone,
                                contentDescription = "חייג",
                                tint = Color(0xFF4CAF50),
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }
                
                Spacer(Modifier.height(1.5.dp))
                
                // TZ ID
                if (!customer.tzId.isNullOrBlank()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "ת.ז: ${customer.tzId}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
            
            Spacer(Modifier.width(8.dp))
        }
    }
}
