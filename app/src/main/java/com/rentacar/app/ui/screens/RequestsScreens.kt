package com.rentacar.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.TextButton
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.NewReleases
import androidx.compose.material.icons.filled.Help
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.PriorityHigh
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Search
import androidx.compose.runtime.remember
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.runtime.derivedStateOf
import kotlinx.coroutines.delay
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import android.content.Intent
import android.net.Uri
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.rentacar.app.LocalTitleColor
import com.rentacar.app.data.CarSaleCommissionPaymentDraft
import com.rentacar.app.data.CarSaleCommissionPaymentLogic
import com.rentacar.app.data.CarSaleVehicleFieldsValidation
import com.rentacar.app.data.Request
import com.rentacar.app.ui.components.IsraeliLicensePlateField
import com.rentacar.app.ui.components.ListItemModel
import com.rentacar.app.ui.components.StandardList
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.ui.components.AppSearchBar
import com.rentacar.app.ui.components.AppEmptySearchState
import com.rentacar.app.ui.vm.RequestsViewModel
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Calendar
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RequestsScreen(navController: NavHostController, vm: RequestsViewModel) {
    val list by vm.list.collectAsState()
    var selectedId by rememberSaveable { mutableStateOf<Long?>(null) }
    var showConfirmDelete by rememberSaveable { mutableStateOf(false) }
    var showConfirmCreateReservation by rememberSaveable { mutableStateOf(false) }
    var showConfirmCreatePurchase by rememberSaveable { mutableStateOf(false) }
    
    // Search state
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var debouncedQuery by remember { mutableStateOf("") }
    
    // Filter state for summary chips
    var activeFilter by rememberSaveable { mutableStateOf<String?>(null) }
    
    // Debounce search query
    LaunchedEffect(searchQuery) {
        delay(300)
        debouncedQuery = searchQuery
    }
    
    // Update selectedId when list changes (after saving new request)
    LaunchedEffect(list.size) {
        if (selectedId != null && !list.any { it.id == selectedId }) {
            // If the selected item was deleted or doesn't exist, select the first item
            if (list.isNotEmpty()) {
                selectedId = list.first().id
            }
        }
    }

    // Filtered list based on activeFilter
    val filteredByType = when (activeFilter) {
        "rentals" -> list.filter { !it.isPurchase && !it.isQuote }
        "quotes" -> list.filter { it.isQuote && !it.isPurchase }
        "purchases" -> list.filter { it.isPurchase }
        "total" -> list
        else -> list
    }
    
    // Apply search filter
    val filtered by remember(debouncedQuery, filteredByType) {
        derivedStateOf {
            if (debouncedQuery.trim().isEmpty()) {
                filteredByType
            } else {
                val query = debouncedQuery.trim().lowercase()
                filteredByType.filter { request ->
                    val fullName = "${request.firstName} ${request.lastName}".lowercase()
                    val phone = request.phone.lowercase()
                    val carType = request.carTypeName.lowercase()
                    
                    fullName.contains(query) || 
                    phone.contains(query) || 
                    carType.contains(query)
                }
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Modern header section
            RequestsHeaderSection(
                searchQuery = searchQuery,
                onQueryChange = { searchQuery = it },
                onHomeClick = { navController.popBackStack() }
            )
            
            Spacer(Modifier.height(8.dp))

            // Scrollable list or empty state
            if (filtered.isEmpty()) {
                // Empty state
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                ) {
                    AppEmptySearchState(
                        message = if (debouncedQuery.isNotEmpty()) {
                            "לא נמצאו תוצאות תואמות לחיפוש שלך."
                        } else {
                            "אין בקשות להצגה."
                        }
                    )
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .padding(bottom = 132.dp)
                ) {
                    items(filtered, key = { it.id }) { request ->
                        val isSelected = request.id == selectedId
                        
                        RequestCard(
                            request = request,
                            isSelected = isSelected,
                            onClick = { selectedId = request.id }
                                )
                            }
                        }
                    }
                }
        
        // Summary row at bottom (above buttons)
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
        ) {
            RequestsSummaryRow(
                requests = list,
                activeFilter = activeFilter,
                onFilterClick = { filter ->
                    activeFilter = if (activeFilter == filter) null else filter
                }
            )

        Spacer(Modifier.height(8.dp))
        // All buttons in one responsive row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
                val selectedRequest = list.firstOrNull { it.id == selectedId }
                val canCreateReservation = selectedRequest != null && !selectedRequest.isPurchase
                val canCreateSale = selectedRequest != null && selectedRequest.isPurchase
                FloatingActionButton(
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp)
                        .alpha(if (canCreateReservation) 1f else 0.3f),
                    onClick = {
                        if (!canCreateReservation) return@FloatingActionButton
                        showConfirmCreateReservation = true
                    }
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("📄")
                        Spacer(Modifier.height(2.dp))
                        Text("הזמנה", fontSize = 10.sp)
                    }
                }
                FloatingActionButton(
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp)
                        .alpha(if (canCreateSale) 1f else 0.3f),
                    onClick = {
                        if (!canCreateSale) return@FloatingActionButton
                        showConfirmCreatePurchase = true
                    }
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("💰", fontSize = 20.sp)
                        Spacer(Modifier.height(2.dp))
                        Text("מכירה", fontSize = 10.sp)
                    }
                }
                // Keep spacing equal; place manage right after sale with same spacing (always enabled)
                FloatingActionButton(
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp),
                    onClick = {
                        navController.navigate(com.rentacar.app.ui.navigation.Routes.CarSalesManage) {
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("⚙️", fontSize = 20.sp)
                        Spacer(Modifier.height(2.dp))
                        Text("ניהול", fontSize = 10.sp)
                }
            }

            // Edit button
                val editEnabled = selectedId != null
                FloatingActionButton(
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp)
                        .alpha(if (editEnabled) 1f else 0.3f),
                    onClick = {
                        if (editEnabled) {
                            navController.navigate("request_edit/${selectedId}")
                        }
                    }
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                        Text("✏️", modifier = Modifier.graphicsLayer(scaleX = -1f, scaleY = 1f))
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = "עריכה", 
                            fontSize = responsiveFontSize(8f),
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
                FloatingActionButton(
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp),
                    onClick = {
                        navController.navigate("request_edit")
                    }
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                        Text("➕", fontSize = 20.sp)
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = "הוספה", 
                            fontSize = responsiveFontSize(8f),
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
                val deleteEnabled = selectedId != null
                FloatingActionButton(
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp)
                        .alpha(if (deleteEnabled) 1f else 0.3f),
                    onClick = {
                        if (deleteEnabled) showConfirmDelete = true
                    }
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                        Text("🗑")
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = "מחק", 
                            fontSize = responsiveFontSize(8f),
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
            }
        }
        
        if (showConfirmDelete) {
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { showConfirmDelete = false },
                confirmButton = {
                    androidx.compose.material3.Button(onClick = {
                        val id = selectedId
                        if (id != null) {
                            vm.delete(id)
                            selectedId = null
                        }
                        showConfirmDelete = false
                    }) { Text("מחק") }
                },
                dismissButton = {
                    androidx.compose.material3.Button(onClick = { showConfirmDelete = false }) { Text("ביטול") }
                },
                title = { Text("אישור מחיקה") },
                text = { Text("האם למחוק את הבקשה?") }
            )
        }
        if (showConfirmCreateReservation) {
            val sel = list.firstOrNull { it.id == selectedId }
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { showConfirmCreateReservation = false },
                confirmButton = {
                    androidx.compose.material3.Button(onClick = {
                        val pick = sel ?: return@Button
                        val handle = navController.currentBackStackEntry?.savedStateHandle
                        handle?.set("prefill_first", pick.firstName)
                        handle?.set("prefill_last", pick.lastName)
                        handle?.set("prefill_phone", pick.phone)
                        handle?.set("prefill_carType", pick.carTypeName)
                        handle?.set("prefill_isQuote", pick.isQuote)
                        handle?.set("prefill_request_id", pick.id)
                        showConfirmCreateReservation = false
                        navController.navigate(com.rentacar.app.ui.navigation.Routes.NewReservation)
                    }) { Text("הקם") }
                },
                dismissButton = {
                    androidx.compose.material3.Button(onClick = { showConfirmCreateReservation = false }) { Text("ביטול") }
                },
                title = { Text("אישור הקמת הזמנה") },
                text = { Text("האם להקים הזמנה מהבקשה הנבחרת?") }
            )
        }
        if (showConfirmCreatePurchase) {
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { showConfirmCreatePurchase = false },
                confirmButton = {
                    androidx.compose.material3.Button(onClick = {
                        val sel = list.firstOrNull { it.id == selectedId }
                        showConfirmCreatePurchase = false
                        val handle = navController.currentBackStackEntry?.savedStateHandle
                        if (sel != null) {
                            handle?.set("prefill_sale_first", sel.firstName)
                            handle?.set("prefill_sale_last", sel.lastName)
                            handle?.set("prefill_sale_phone", sel.phone)
                            handle?.set("prefill_sale_carType", sel.carTypeName)
                            handle?.set("prefill_sale_request_id", sel.id)
                        }
                        navController.navigate(com.rentacar.app.ui.navigation.Routes.CarPurchase)
                    }) { Text("הקם") }
                },
                dismissButton = {
                    androidx.compose.material3.Button(onClick = { showConfirmCreatePurchase = false }) { Text("ביטול") }
                },
                title = { Text("אישור הקמת מכירה") },
                text = { Text("האם להקים מכירה מהבקשה הנבחרת?") }
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RequestEditScreen(
    navController: NavHostController, 
    vm: RequestsViewModel,
    requestId: Long? = null
) {
    val list by vm.list.collectAsState()
    val existing = list.firstOrNull { it.id == requestId }
    
    var isPurchase by rememberSaveable { mutableStateOf(existing?.isPurchase ?: false) }
    var isQuote by rememberSaveable { mutableStateOf(existing?.isQuote ?: false) }
    var firstName by rememberSaveable { mutableStateOf(existing?.firstName ?: "") }
    var lastName by rememberSaveable { mutableStateOf(existing?.lastName ?: "") }
    var phone by rememberSaveable { mutableStateOf(existing?.phone ?: "") }
    var carType by rememberSaveable { mutableStateOf(existing?.carTypeName ?: "") }
    var attemptedSave by rememberSaveable { mutableStateOf(false) }
    
    val isEdit = existing != null

    // Update fields when existing data changes
    LaunchedEffect(existing?.id) {
        if (existing != null) {
            isPurchase = existing.isPurchase
            isQuote = existing.isQuote
            firstName = existing.firstName
            lastName = existing.lastName
            phone = existing.phone
            carType = existing.carTypeName
        }
    }

    val context = LocalContext.current
    
    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
                .padding(bottom = 80.dp)
                .verticalScroll(rememberScrollState())
        ) {
        TitleBar(
            title = if (isEdit) "עריכת בקשה" else "בקשה חדשה",
            color = LocalTitleColor.current,
            onHomeClick = { navController.popBackStack() }
            )
            Spacer(Modifier.height(16.dp))

            // סוג בקשה - Card
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
                        text = "סוג בקשה",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
        )
        Spacer(Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                RadioButton(selected = !isPurchase, onClick = { isPurchase = false })
                Text("השכרה")
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                RadioButton(selected = isPurchase, onClick = { isPurchase = true })
                Text("מכירה")
            }
        }

        // Quote switch - only show for rental requests
        if (!isPurchase) {
                        Spacer(Modifier.height(12.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceEvenly
                        ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = !isQuote, onClick = { isQuote = false })
                    Text("הזמנה רגילה")
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = isQuote, onClick = { isQuote = true })
                    Text("הצעת מחיר")
                }
            }
                    }
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            // פרטי לקוח - Card
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
                            text = "פרטי לקוח",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // שם פרטי
                    val firstNameHasError = attemptedSave && firstName.isBlank()
        OutlinedTextField(
            value = firstName,
            onValueChange = { firstName = it },
            label = { Text("שם פרטי *") },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Person,
                                contentDescription = null,
                                tint = if (firstNameHasError) 
                                    MaterialTheme.colorScheme.error 
                                else 
                                    MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
            isError = firstNameHasError,
            colors = androidx.compose.material3.TextFieldDefaults.outlinedTextFieldColors(
                containerColor = if (firstNameHasError) Color(0xFFFFC1B6) else Color.Unspecified
            ),
            supportingText = { if (firstNameHasError) Text("שדה חובה") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            textStyle = TextStyle(fontSize = 18.sp),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Text)
        )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // שם משפחה
                    val lastNameHasError = attemptedSave && lastName.isBlank()
        OutlinedTextField(
            value = lastName,
            onValueChange = { lastName = it },
            label = { Text("שם משפחה *") },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Person,
                                contentDescription = null,
                                tint = if (lastNameHasError) 
                                    MaterialTheme.colorScheme.error 
                                else 
                                    MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
            isError = lastNameHasError,
            colors = androidx.compose.material3.TextFieldDefaults.outlinedTextFieldColors(
                containerColor = if (lastNameHasError) Color(0xFFFFC1B6) else Color.Unspecified
            ),
            supportingText = { if (lastNameHasError) Text("שדה חובה") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            textStyle = TextStyle(fontSize = 18.sp),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Text)
        )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // טלפון
                    val phoneHasError = attemptedSave && phone.isBlank()
        OutlinedTextField(
            value = phone,
            onValueChange = { phone = it },
            label = { Text("טלפון *") },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Phone,
                                contentDescription = null,
                                tint = if (phoneHasError) 
                                    MaterialTheme.colorScheme.error 
                                else 
                                    MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
            isError = phoneHasError,
            colors = androidx.compose.material3.TextFieldDefaults.outlinedTextFieldColors(
                containerColor = if (phoneHasError) Color(0xFFFFC1B6) else Color.Unspecified
            ),
            supportingText = { if (phoneHasError) Text("שדה חובה") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            textStyle = TextStyle(fontSize = 18.sp),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Phone)
        )
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            // פרטי רכב - Card
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
                            imageVector = Icons.Default.DirectionsCar,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "פרטי רכב",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // סוג רכב
                    val carTypeHasError = attemptedSave && carType.isBlank()
        OutlinedTextField(
            value = carType,
            onValueChange = { carType = it },
            label = { Text("סוג רכב *") },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.DirectionsCar,
                                contentDescription = null,
                                tint = if (carTypeHasError) 
                                    MaterialTheme.colorScheme.error 
                                else 
                                    MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
            isError = carTypeHasError,
            colors = androidx.compose.material3.TextFieldDefaults.outlinedTextFieldColors(
                containerColor = if (carTypeHasError) Color(0xFFFFC1B6) else Color.Unspecified
            ),
            supportingText = { if (carTypeHasError) Text("שדה חובה") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            textStyle = TextStyle(fontSize = 18.sp),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Text)
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
            val isCallEnabled = phone.isNotBlank()
            val isSaveEnabled = firstName.isNotBlank() && lastName.isNotBlank() && phone.isNotBlank() && carType.isNotBlank()

            // כפתור ביטול
            FloatingActionButton(
                onClick = { navController.popBackStack() },
                modifier = Modifier.weight(1f),
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp)) {
                    Text("❌", fontSize = 18.sp)
                    Spacer(Modifier.height(2.dp))
                    Text("בטל", fontSize = 10.sp, fontWeight = FontWeight.Medium)
                }
            }
            
            // כפתור חייג (מוצג תמיד, פעיל רק אם יש טלפון)
            FloatingActionButton(
                onClick = {
                    if (isCallEnabled) {
                        val intent = Intent(Intent.ACTION_DIAL).apply { data = Uri.parse("tel:$phone") }
                        context.startActivity(intent)
                    }
                },
                modifier = Modifier.weight(1f).alpha(if (isCallEnabled) 1f else 0.5f),
                containerColor = Color(0xFF4CAF50)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp)) {
                    Text("📞", fontSize = 18.sp, color = Color.White)
                    Spacer(Modifier.height(2.dp))
                    Text("חייג", fontSize = 10.sp, color = Color.White, fontWeight = FontWeight.Medium)
                }
            }
            
            // כפתור שמירה
            FloatingActionButton(
                onClick = {
                    if (!isSaveEnabled) {
                        attemptedSave = true
                        android.widget.Toast.makeText(context, "יש למלא את כל השדות", android.widget.Toast.LENGTH_SHORT).show()
                        return@FloatingActionButton
                    }
                    val req = Request(
                        id = requestId ?: 0L,
                        isPurchase = isPurchase,
                        isQuote = isQuote,
                        firstName = firstName,
                        lastName = lastName,
                        phone = phone,
                        carTypeName = carType
                    )
                    vm.save(req) { 
                        navController.popBackStack()
                    }
                },
                modifier = Modifier
                    .weight(1f)
                    .alpha(if (firstName.isNotBlank() && lastName.isNotBlank() && phone.isNotBlank() && carType.isNotBlank()) 1f else 0.5f),
                containerColor = MaterialTheme.colorScheme.primaryContainer
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp)) {
                    Text("💾", fontSize = 18.sp, color = MaterialTheme.colorScheme.onPrimaryContainer)
                    Spacer(Modifier.height(2.dp))
                    Text("שמור", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimaryContainer)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CarPurchaseScreen(navController: NavHostController, vm: com.rentacar.app.ui.vm.CarSaleViewModel, editSaleId: Long? = null) {
    val ctx = LocalContext.current
    val salesList = vm.list.collectAsState().value
    val existing = salesList.firstOrNull { it.id == editSaleId }
    var firstName by rememberSaveable { mutableStateOf("") }
    var lastName by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var carType by rememberSaveable { mutableStateOf("") }
    var licensePlate by rememberSaveable { mutableStateOf("") }
    var vehicleYear by rememberSaveable { mutableStateOf("") }
    var vehicleYearMenuExpanded by rememberSaveable { mutableStateOf(false) }
    var saleDateMillis by rememberSaveable { mutableStateOf<Long?>(existing?.saleDate ?: System.currentTimeMillis()) }
    var showSaleDatePicker by rememberSaveable { mutableStateOf(false) }
    var salePrice by rememberSaveable { mutableStateOf(existing?.salePrice?.toInt()?.toString() ?: "") }
    var commissionPrice by rememberSaveable { mutableStateOf(existing?.commissionPrice?.toInt()?.toString() ?: "") }
    var notes by rememberSaveable { mutableStateOf(existing?.notes ?: "") }
    var attemptedSave by rememberSaveable { mutableStateOf(false) }
    val isEdit = existing != null
    val commissionPaymentDrafts by vm.commissionPayments.collectAsState()
    val activeCommissionPayments = commissionPaymentsChronological(
        commissionPaymentDrafts.filter { !it.markedForDeletion }
    )
    val commissionValue = commissionPrice.toDoubleOrNull() ?: 0.0
    val commissionTotals = CarSaleCommissionPaymentLogic.totals(
        commissionValue,
        activeCommissionPayments.map { it.amount }
    )
    var showPaymentDialog by rememberSaveable { mutableStateOf(false) }
    var editingPaymentKey by rememberSaveable { mutableStateOf<String?>(null) }
    var paymentToDeleteKey by rememberSaveable { mutableStateOf<String?>(null) }

    // When editing, ensure fields are populated once existing loads
    androidx.compose.runtime.LaunchedEffect(existing?.id) {
        if (existing != null) {
            firstName = existing.firstName
            lastName = existing.lastName
            phone = existing.phone
            carType = existing.carTypeName
            saleDateMillis = existing.saleDate
            salePrice = existing.salePrice.toInt().toString()
            commissionPrice = existing.commissionPrice.toInt().toString()
            notes = existing.notes ?: ""
            licensePlate = existing.licensePlate.orEmpty()
            vehicleYear = existing.vehicleYear?.toString().orEmpty()
        }
    }

    androidx.compose.runtime.LaunchedEffect(editSaleId) {
        if (editSaleId != null && editSaleId > 0L) {
            vm.loadCommissionPayments(editSaleId)
        } else {
            vm.clearCommissionPayments()
        }
    }

    // Prefill from Requests (one-time to avoid overriding user typing)
    var appliedPrefill by rememberSaveable { mutableStateOf(false) }
    androidx.compose.runtime.LaunchedEffect(existing?.id) {
        if (existing == null && !appliedPrefill) {
            val handle = navController.previousBackStackEntry?.savedStateHandle
            val f = handle?.get<String>("prefill_sale_first")
            val l = handle?.get<String>("prefill_sale_last")
            val p = handle?.get<String>("prefill_sale_phone")
            val c = handle?.get<String>("prefill_sale_carType")
            if (!f.isNullOrBlank()) firstName = f
            if (!l.isNullOrBlank()) lastName = l
            if (!p.isNullOrBlank()) phone = p
            if (!c.isNullOrBlank()) carType = c
            appliedPrefill = true
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        androidx.compose.foundation.layout.Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
                .padding(bottom = 80.dp)
                .verticalScroll(rememberScrollState())
        ) {
            TitleBar(title = if (isEdit) "עריכת מכירה" else "מכירת רכב", color = LocalTitleColor.current, onHomeClick = { navController.popBackStack() })
            Spacer(Modifier.height(16.dp))

            // פרטי לקוח - Card
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
                            text = "פרטי לקוח",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // שם פרטי
                    val firstNameHasError = attemptedSave && firstName.isBlank()
                    OutlinedTextField(
                        value = firstName,
                        onValueChange = { firstName = it },
                        label = { Text("שם פרטי *") },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Person,
                                contentDescription = null,
                                tint = if (firstNameHasError) 
                                    MaterialTheme.colorScheme.error 
                                else 
                                    MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        singleLine = true,
                        isError = firstNameHasError,
                        colors = TextFieldDefaults.outlinedTextFieldColors(
                            containerColor = if (firstNameHasError) Color(0xFFFFC1B6) else Color.Unspecified
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // שם משפחה
                    val lastNameHasError = attemptedSave && lastName.isBlank()
                    OutlinedTextField(
                        value = lastName,
                        onValueChange = { lastName = it },
                        label = { Text("שם משפחה *") },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Person,
                                contentDescription = null,
                                tint = if (lastNameHasError) 
                                    MaterialTheme.colorScheme.error 
                                else 
                                    MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        singleLine = true,
                        isError = lastNameHasError,
                        colors = TextFieldDefaults.outlinedTextFieldColors(
                            containerColor = if (lastNameHasError) Color(0xFFFFC1B6) else Color.Unspecified
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // טלפון
                    val phoneHasError = attemptedSave && phone.isBlank()
                    OutlinedTextField(
                        value = phone,
                        onValueChange = { phone = it },
                        label = { Text("טלפון *") },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Phone,
                                contentDescription = null,
                                tint = if (phoneHasError) 
                                    MaterialTheme.colorScheme.error 
                                else 
                                    MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        singleLine = true,
                        isError = phoneHasError,
                        colors = TextFieldDefaults.outlinedTextFieldColors(
                            containerColor = if (phoneHasError) Color(0xFFFFC1B6) else Color.Unspecified
                        ),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            // פרטי רכב ומכירה - Card
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
                            imageVector = Icons.Default.DirectionsCar,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "פרטי רכב ומכירה",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // סוג רכב
                    val carTypeHasError = attemptedSave && carType.isBlank()
                    OutlinedTextField(
                        value = carType,
                        onValueChange = { carType = it },
                        label = { Text("סוג רכב *") },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.DirectionsCar,
                                contentDescription = null,
                                tint = if (carTypeHasError) 
                                    MaterialTheme.colorScheme.error 
                                else 
                                    MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        singleLine = true,
                        isError = carTypeHasError,
                        colors = TextFieldDefaults.outlinedTextFieldColors(
                            containerColor = if (carTypeHasError) Color(0xFFFFC1B6) else Color.Unspecified
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(Modifier.height(12.dp))

                    // מספר רישוי (אופציונלי) — Israeli-style plate UI; raw digits only in state
                    val licensePlateValidation =
                        CarSaleVehicleFieldsValidation.validateLicensePlate(licensePlate)
                    val licensePlateError = attemptedSave &&
                        licensePlateValidation is CarSaleVehicleFieldsValidation.ValidationResult.Error
                    val licensePlateErrorText =
                        (licensePlateValidation as? CarSaleVehicleFieldsValidation.ValidationResult.Error)
                            ?.messageHe
                    IsraeliLicensePlateField(
                        value = licensePlate,
                        onValueChange = {
                            licensePlate = CarSaleVehicleFieldsValidation.normalizeLicensePlate(it)
                        },
                        isError = licensePlateError,
                        errorText = licensePlateErrorText,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(Modifier.height(12.dp))

                    // שנתון הרכב (אופציונלי) — הקלדה או בחירה
                    val vehicleYearError = attemptedSave &&
                        CarSaleVehicleFieldsValidation.validateVehicleYear(vehicleYear) is
                            CarSaleVehicleFieldsValidation.ValidationResult.Error
                    val yearOptions = remember {
                        val maxYear = Calendar.getInstance().get(Calendar.YEAR) + 1
                        (maxYear downTo 1900).toList()
                    }
                    ExposedDropdownMenuBox(
                        expanded = vehicleYearMenuExpanded,
                        onExpandedChange = { vehicleYearMenuExpanded = it },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        OutlinedTextField(
                            value = vehicleYear,
                            onValueChange = {
                                vehicleYear = CarSaleVehicleFieldsValidation.normalizeVehicleYearInput(it)
                            },
                            label = { Text("שנתון הרכב") },
                            supportingText = { Text("4 ספרות") },
                            singleLine = true,
                            isError = vehicleYearError,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            trailingIcon = {
                                ExposedDropdownMenuDefaults.TrailingIcon(expanded = vehicleYearMenuExpanded)
                            },
                            modifier = Modifier
                                .menuAnchor()
                                .fillMaxWidth()
                        )
                        ExposedDropdownMenu(
                            expanded = vehicleYearMenuExpanded,
                            onDismissRequest = { vehicleYearMenuExpanded = false }
                        ) {
                            yearOptions.forEach { year ->
                                DropdownMenuItem(
                                    text = { Text(year.toString()) },
                                    onClick = {
                                        vehicleYear = year.toString()
                                        vehicleYearMenuExpanded = false
                                    }
                                )
                            }
                        }
                    }
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // תאריך מכירה
                    Text(
                        text = "תאריך מכירה",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(8.dp))
                    androidx.compose.material3.FloatingActionButton(
                        onClick = { showSaleDatePicker = true },
                        containerColor = MaterialTheme.colorScheme.primaryContainer
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 16.dp)
                        ) {
                            Text("🗓", fontSize = 20.sp)
                            val dateLabel = saleDateMillis?.let { 
                                java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault()).format(java.util.Date(it)) 
                            } ?: "בחר תאריך"
                            Text(
                                dateLabel,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            // פרטים כספיים - Card
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
                            imageVector = Icons.Filled.AttachMoney,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "פרטים כספיים",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // מחיר מכירה
                    OutlinedTextField(
                        value = salePrice,
                        onValueChange = { salePrice = it.filter { ch -> ch.isDigit() } },
                        label = { Text("מחיר מכירה *") },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Filled.AttachMoney,
                                contentDescription = null,
                                tint = if (attemptedSave && (salePrice.toIntOrNull().let { it == null || it <= 0 })) 
                                    MaterialTheme.colorScheme.error 
                                else 
                                    Color(0xFF4CAF50)
                            )
                        },
                        singleLine = true,
                        isError = attemptedSave && (salePrice.toIntOrNull().let { it == null || it <= 0 }),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // עמלה
                    OutlinedTextField(
                        value = commissionPrice,
                        onValueChange = { commissionPrice = it.filter { ch -> ch.isDigit() } },
                        label = { Text("עמלה *") },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Filled.AttachMoney,
                                contentDescription = null,
                                tint = if (attemptedSave && (commissionPrice.toIntOrNull().let { it == null || it < 0 })) 
                                    MaterialTheme.colorScheme.error 
                                else 
                                    MaterialTheme.colorScheme.primary
                            )
                        },
                        singleLine = true,
                        isError = attemptedSave && (commissionPrice.toIntOrNull().let { it == null || it < 0 }),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(Modifier.height(12.dp))

                    CommissionPaymentsSection(
                        payments = activeCommissionPayments,
                        totals = commissionTotals,
                        commissionPrice = commissionValue,
                        onAddClick = {
                            editingPaymentKey = null
                            showPaymentDialog = true
                        },
                        onEditClick = { draft ->
                            editingPaymentKey = draft.draftKey
                            showPaymentDialog = true
                        },
                        onDeleteClick = { draft ->
                            paymentToDeleteKey = draft.draftKey
                        }
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
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
            FloatingActionButton(
                onClick = { navController.popBackStack() },
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
            
            // כפתור שמירה
            FloatingActionButton(
                onClick = {
                    val valid = firstName.isNotBlank() && lastName.isNotBlank() && phone.isNotBlank() && carType.isNotBlank() && (salePrice.toIntOrNull()?.let { it > 0 } == true) && (commissionPrice.toIntOrNull()?.let { it >= 0 } == true)
                    if (!valid || saleDateMillis == null) { 
                        attemptedSave = true
                        android.widget.Toast.makeText(ctx, "יש למלא את כל השדות", android.widget.Toast.LENGTH_SHORT).show()
                        return@FloatingActionButton 
                    }
                    when (
                        val plateCheck = CarSaleVehicleFieldsValidation.validateLicensePlate(licensePlate)
                    ) {
                        is CarSaleVehicleFieldsValidation.ValidationResult.Error -> {
                            attemptedSave = true
                            android.widget.Toast.makeText(ctx, plateCheck.messageHe, android.widget.Toast.LENGTH_SHORT).show()
                            return@FloatingActionButton
                        }
                        CarSaleVehicleFieldsValidation.ValidationResult.Ok -> Unit
                    }
                    when (
                        val yearCheck = CarSaleVehicleFieldsValidation.validateVehicleYear(vehicleYear)
                    ) {
                        is CarSaleVehicleFieldsValidation.ValidationResult.Error -> {
                            attemptedSave = true
                            android.widget.Toast.makeText(ctx, yearCheck.messageHe, android.widget.Toast.LENGTH_SHORT).show()
                            return@FloatingActionButton
                        }
                        CarSaleVehicleFieldsValidation.ValidationResult.Ok -> Unit
                    }
                    val commissionAmount = commissionPrice.toInt().toDouble()
                    val paid = CarSaleCommissionPaymentLogic.totalPaid(activeCommissionPayments.map { it.amount })
                    when (
                        val commissionCheck = CarSaleCommissionPaymentLogic.validateCommissionAgainstPaid(
                            commissionAmount,
                            paid
                        )
                    ) {
                        is CarSaleCommissionPaymentLogic.ValidationResult.Error -> {
                            attemptedSave = true
                            android.widget.Toast.makeText(ctx, commissionCheck.messageHe, android.widget.Toast.LENGTH_LONG).show()
                            return@FloatingActionButton
                        }
                        CarSaleCommissionPaymentLogic.ValidationResult.Ok -> Unit
                    }
                val persistedPlate = CarSaleVehicleFieldsValidation.licensePlateForPersistence(licensePlate)
                val persistedYear = CarSaleVehicleFieldsValidation.vehicleYearForPersistence(vehicleYear)
                val sale = existing?.copy(
                    firstName = firstName,
                    lastName = lastName,
                    phone = phone,
                    carTypeName = carType,
                    saleDate = saleDateMillis!!,
                    salePrice = salePrice.toInt().toDouble(),
                    commissionPrice = commissionAmount,
                    notes = notes.ifBlank { null },
                    licensePlate = persistedPlate,
                    vehicleYear = persistedYear
                ) ?: com.rentacar.app.data.CarSale(
                    firstName = firstName,
                    lastName = lastName,
                    phone = phone,
                    carTypeName = carType,
                    saleDate = saleDateMillis!!,
                    salePrice = salePrice.toInt().toDouble(),
                    commissionPrice = commissionAmount,
                    notes = notes.ifBlank { null },
                    licensePlate = persistedPlate,
                    vehicleYear = persistedYear
                )
                vm.saveWithCommissionPayments(
                    sale,
                    onDone = {
                        // If created from request, delete it
                        if (existing == null) {
                            val handle = navController.previousBackStackEntry?.savedStateHandle
                            val reqId = handle?.get<Long>("prefill_sale_request_id")
                            if (reqId != null) {
                                kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
                                    com.rentacar.app.di.DatabaseModule.requestRepository(ctx).delete(reqId)
                                }
                            }
                        }
                        navController.popBackStack()
                    },
                    onError = { msg ->
                        attemptedSave = true
                        android.widget.Toast.makeText(ctx, msg, android.widget.Toast.LENGTH_LONG).show()
                    }
                )
                },
                modifier = Modifier
                    .weight(1f)
                    .alpha(if (firstName.isNotBlank() && lastName.isNotBlank() && phone.isNotBlank() && carType.isNotBlank() && (salePrice.toIntOrNull()?.let { it > 0 } == true)) 1f else 0.5f),
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
    
    if (showSaleDatePicker) {
        com.rentacar.app.ui.screens.AppDatePickerDialog(
            onDismissRequest = { showSaleDatePicker = false },
            onDateSelected = { sel -> saleDateMillis = sel }
        )
    }

    if (showPaymentDialog) {
        val editing = activeCommissionPayments.firstOrNull { it.draftKey == editingPaymentKey }
        val remainingForDialog = if (editing != null) {
            commissionTotals.remaining + editing.amount
        } else {
            commissionTotals.remaining
        }
        CommissionPaymentDialog(
            initialAmount = editing?.amount
                ?: commissionTotals.remaining.takeIf { it > 0.0 },
            initialDateMillis = editing?.paymentDate ?: System.currentTimeMillis(),
            remainingBalance = remainingForDialog,
            isEdit = editing != null,
            onDismiss = { showPaymentDialog = false },
            onSave = { amount, dateMillis ->
                val result = if (editing != null) {
                    vm.updateCommissionPaymentValidated(
                        draftKey = editing.draftKey,
                        amount = amount,
                        paymentDate = dateMillis,
                        commissionPrice = commissionValue
                    )
                } else {
                    vm.addCommissionPaymentValidated(
                        amount = amount,
                        paymentDate = dateMillis,
                        commissionPrice = commissionValue
                    )
                }
                when (result) {
                    is CarSaleCommissionPaymentLogic.ValidationResult.Error -> {
                        android.widget.Toast.makeText(ctx, result.messageHe, android.widget.Toast.LENGTH_SHORT).show()
                        false
                    }
                    CarSaleCommissionPaymentLogic.ValidationResult.Ok -> {
                        showPaymentDialog = false
                        true
                    }
                }
            }
        )
    }

    val deleteTarget = activeCommissionPayments.firstOrNull { it.draftKey == paymentToDeleteKey }
    if (deleteTarget != null) {
        val deleteDateLabel = java.text.SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
            .format(java.util.Date(deleteTarget.paymentDate))
        AlertDialog(
            onDismissRequest = { paymentToDeleteKey = null },
            title = { Text("מחיקת תשלום עמלה") },
            text = {
                Text(
                    "האם למחוק את תשלום העמלה בסך ₪${formatCommissionShekel(deleteTarget.amount)} מתאריך $deleteDateLabel?"
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        vm.markCommissionPaymentDeleted(deleteTarget.draftKey)
                        paymentToDeleteKey = null
                    }
                ) { Text("מחק") }
            },
            dismissButton = {
                TextButton(onClick = { paymentToDeleteKey = null }) { Text("בטל") }
            }
        )
    }
}

private fun formatCommissionShekel(amount: Double): String {
    val nf = NumberFormat.getNumberInstance(Locale("he", "IL"))
    nf.maximumFractionDigits = if (amount == amount.toLong().toDouble()) 0 else 2
    nf.minimumFractionDigits = if (amount == amount.toLong().toDouble()) 0 else 2
    return nf.format(amount)
}

private fun commissionPaymentsChronological(
    payments: List<CarSaleCommissionPaymentDraft>
): List<CarSaleCommissionPaymentDraft> =
    payments.sortedWith(compareBy({ it.paymentDate }, { it.id }, { it.draftKey }))

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CommissionPaymentsSection(
    payments: List<CarSaleCommissionPaymentDraft>,
    totals: CarSaleCommissionPaymentLogic.Totals,
    commissionPrice: Double,
    onAddClick: () -> Unit,
    onEditClick: (CarSaleCommissionPaymentDraft) -> Unit,
    onDeleteClick: (CarSaleCommissionPaymentDraft) -> Unit
) {
    val orderedPayments = commissionPaymentsChronological(payments)
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = "תשלומי עמלה",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            if (orderedPayments.isNotEmpty()) {
                Text(
                    text = "${orderedPayments.size} תשלומים",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(Modifier.height(10.dp))

        if (orderedPayments.isEmpty()) {
            Text(
                text = "טרם נרשמו תשלומי עמלה",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        } else {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                orderedPayments.forEach { payment ->
                    CommissionPaymentRow(
                        payment = payment,
                        onEditClick = { onEditClick(payment) },
                        onDeleteClick = { onDeleteClick(payment) }
                    )
                }
            }
        }

        Spacer(Modifier.height(12.dp))

        OutlinedButton(
            onClick = onAddClick,
            enabled = commissionPrice > 0.0 && totals.remaining > 0.0,
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(
                imageVector = Icons.Default.Add,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Spacer(Modifier.width(8.dp))
            Text("הוסף תשלום")
        }

        Spacer(Modifier.height(12.dp))

        CommissionPaymentsSummary(totals = totals)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CommissionPaymentsSummary(totals: CarSaleCommissionPaymentLogic.Totals) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
    ) {
        Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "סה״כ שולם",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "₪${formatCommissionShekel(totals.totalPaid)}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }
                Column(modifier = Modifier.weight(1f), horizontalAlignment = Alignment.End) {
                    Text(
                        text = "נותר לתשלום",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "₪${formatCommissionShekel(totals.remaining)}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
            if (totals.fullyPaid) {
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.tertiary,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = "שולם במלואו",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.tertiary
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CommissionPaymentRow(
    payment: CarSaleCommissionPaymentDraft,
    onEditClick: () -> Unit,
    onDeleteClick: () -> Unit
) {
    val dateLabel = java.text.SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
        .format(java.util.Date(payment.paymentDate))
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
        tonalElevation = 0.dp,
        shadowElevation = 0.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "₪${formatCommissionShekel(payment.amount)}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.CalendarMonth,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = dateLabel,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "תשלום עמלה",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            IconButton(
                onClick = onEditClick,
                modifier = Modifier.size(40.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Edit,
                    contentDescription = "עריכת תשלום",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp)
                )
            }
            IconButton(
                onClick = onDeleteClick,
                modifier = Modifier.size(40.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.DeleteOutline,
                    contentDescription = "מחיקת תשלום",
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CommissionPaymentDialog(
    initialAmount: Double?,
    initialDateMillis: Long?,
    remainingBalance: Double,
    isEdit: Boolean,
    onDismiss: () -> Unit,
    onSave: (amount: Double?, dateMillis: Long?) -> Boolean
) {
    var amountText by rememberSaveable {
        mutableStateOf(initialAmount?.let { CarSaleCommissionPaymentLogic.formatAmount(it) } ?: "")
    }
    var paymentDateMillis by rememberSaveable { mutableStateOf(initialDateMillis ?: System.currentTimeMillis()) }
    var showDatePicker by rememberSaveable { mutableStateOf(false) }
    var errorText by rememberSaveable { mutableStateOf<String?>(null) }
    val dateLabel = java.text.SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
        .format(java.util.Date(paymentDateMillis))

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = if (isEdit) "עריכת תשלום עמלה" else "הוספת תשלום עמלה",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
        },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "נותר לתשלום: ₪${formatCommissionShekel(remainingBalance)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = amountText,
                    onValueChange = {
                        amountText = it.filter { ch -> ch.isDigit() || ch == '.' }
                        errorText = null
                    },
                    label = { Text("סכום ששולם") },
                    leadingIcon = {
                        Text(
                            text = "₪",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    singleLine = true,
                    isError = errorText != null,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(12.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { showDatePicker = true }
                ) {
                    OutlinedTextField(
                        value = dateLabel,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("תאריך תשלום") },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.CalendarMonth,
                                contentDescription = "בחירת תאריך",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        enabled = false,
                        colors = TextFieldDefaults.outlinedTextFieldColors(
                            disabledTextColor = MaterialTheme.colorScheme.onSurface,
                            disabledBorderColor = MaterialTheme.colorScheme.outline,
                            disabledLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
                            disabledLeadingIconColor = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    )
                }
                if (errorText != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = errorText!!,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val amount = amountText.toDoubleOrNull()
                    if (amountText.isBlank()) {
                        errorText = "יש להזין סכום ששולם"
                        return@Button
                    }
                    val ok = onSave(amount, paymentDateMillis)
                    if (!ok && errorText == null) {
                        // Keep open; toast already shown by caller for validation errors
                    }
                }
            ) { Text("שמור") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("בטל") }
        }
    )

    if (showDatePicker) {
        AppDatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            onDateSelected = { sel ->
                if (sel != null) paymentDateMillis = sel
                showDatePicker = false
            }
        )
    }
}

// Helper functions for request type styling
private fun getRequestColor(request: Request): Color {
    return when {
        request.isPurchase -> Color(0xFF673AB7) // Purple for "מכירה"
        request.isQuote -> Color(0xFF2196F3)    // Blue for "הצעת מחיר"
        else -> Color(0xFF4CAF50)                // Green for "הזמנה"
    }
}

private fun getRequestIcon(request: Request): ImageVector {
    return when {
        request.isPurchase -> Icons.Default.PriorityHigh // Purple star/exclamation for seller lead
        request.isQuote -> Icons.Default.Help             // Blue question mark for quote
        else -> Icons.Default.DirectionsCar               // Green car for booking
    }
}

private fun getRequestTypeLabel(request: Request): String {
    return when {
        request.isPurchase -> "מכירה"
        request.isQuote -> "הצעת מחיר"
        else -> "הזמנה"
    }
}

@Composable
fun RequestsSummaryRow(
    requests: List<Request>,
    activeFilter: String?,
    onFilterClick: (String) -> Unit
) {
    val purchases = requests.count { it.isPurchase }
    val quotes = requests.count { it.isQuote && !it.isPurchase }
    val rentals = requests.count { !it.isPurchase && !it.isQuote }
    val total = requests.size
    
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        SummaryChip(
            label = "הזמנות",
            count = rentals,
            color = Color(0xFF4CAF50),
            emoji = "📦",
            isActive = activeFilter == "rentals",
            onClick = { onFilterClick("rentals") }
        )
        SummaryChip(
            label = "הצעות מחיר",
            count = quotes,
            color = Color(0xFF2196F3),
            emoji = "📑",
            isActive = activeFilter == "quotes",
            onClick = { onFilterClick("quotes") }
        )
        SummaryChip(
            label = "מכירות",
            count = purchases,
            color = Color(0xFF673AB7),
            emoji = "💰",
            isActive = activeFilter == "purchases",
            onClick = { onFilterClick("purchases") }
        )
        SummaryChip(
            label = "סה״כ",
            count = total,
            color = Color(0xFF9E9E9E),
            emoji = "🧮",
            isActive = activeFilter == "total",
            onClick = { onFilterClick("total") }
        )
    }
}

@Composable
fun SummaryChip(
    label: String,
    count: Int,
    color: Color,
    emoji: String,
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
                        color = Color.Black,
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
            modifier = Modifier.padding(vertical = 0.dp)
        ) {
            Text(
                text = emoji,
                fontSize = 14.sp,
                modifier = Modifier.padding(end = 2.dp)
            )
            Text(
                text = count.toString(),
                color = Color.Black,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                lineHeight = 13.sp
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = Color.Black,
                textAlign = TextAlign.Center,
                maxLines = 1,
                fontSize = 11.sp,
                lineHeight = 12.sp
            )
        }
    }
}

@Composable
fun RequestCard(
    request: Request,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val cardColor = getRequestColor(request)
    val icon = getRequestIcon(request)
    val typeLabel = getRequestTypeLabel(request)
    val context = LocalContext.current
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
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
                    .height(90.dp)
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
                // Header row: Name + icon bubble
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "${request.firstName} ${request.lastName}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f)
                    )
                    
                    // Circular icon chip
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .background(cardColor, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = icon,
                            contentDescription = typeLabel,
                            tint = Color.White,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
                
                Spacer(Modifier.height(3.dp))
                
                // Phone line with icon + Type chip below icon
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                        Icon(
                            imageVector = Icons.Default.Phone,
                            contentDescription = null,
                            tint = Color.Gray,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = request.phone,
                            style = MaterialTheme.typography.bodyMedium
                        )
                        
                        // Call button if selected
                        if (isSelected) {
                            Spacer(Modifier.width(8.dp))
                            IconButton(
                                onClick = {
                                    val intent = Intent(Intent.ACTION_DIAL).apply {
                                        data = Uri.parse("tel:${request.phone}")
                                    }
                                    context.startActivity(intent)
                                },
                                modifier = Modifier.size(32.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.Phone,
                                    contentDescription = "חייג",
                                    tint = Color(0xFF4CAF50),
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                    }
                    
                    // Type chip on the right, below icon
                    Box(
                        modifier = Modifier
                            .background(cardColor.copy(alpha = 0.15f), RoundedCornerShape(6.dp))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = typeLabel,
                            style = MaterialTheme.typography.labelSmall,
                            color = cardColor,
                            fontWeight = FontWeight.Bold,
                            fontSize = 8.sp
                        )
                    }
                }
                
                Spacer(Modifier.height(3.dp))
                
                // Car type / need text
                if (request.carTypeName.isNotBlank()) {
                    Text(
                        text = request.carTypeName,
                        style = MaterialTheme.typography.bodyMedium,
                        color = cardColor,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
            
            Spacer(Modifier.width(8.dp))
        }
    }
}

@Composable
private fun RequestsHeaderSection(
    searchQuery: String,
    onQueryChange: (String) -> Unit,
    onHomeClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
    ) {
        // Title bar with home button
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 6.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "בקשות",
                style = MaterialTheme.typography.titleLarge.copy(
                    fontWeight = FontWeight.Bold
                ),
                color = LocalTitleColor.current,
                textAlign = TextAlign.Center
            )
            IconButton(
                onClick = onHomeClick,
                modifier = Modifier.align(Alignment.CenterEnd)
            ) {
                Text("🏠", fontSize = 20.sp)
            }
        }
        
        Spacer(Modifier.height(12.dp))
        
        // Modern search bar
        AppSearchBar(
            query = searchQuery,
            onQueryChange = onQueryChange,
            placeholder = "חיפוש לפי שם, טלפון או סוג רכב..."
        )
    }
}
