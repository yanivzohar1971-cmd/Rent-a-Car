package com.rentacar.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.rentacar.app.LocalTitleColor
import com.rentacar.app.data.Agent
import com.rentacar.app.ui.components.AppButton
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.ui.components.AppSearchBar
import com.rentacar.app.ui.components.AppEmptySearchState
import com.rentacar.app.ui.vm.AgentsViewModel
import com.rentacar.app.ui.components.StandardList
import com.rentacar.app.ui.components.ListItemModel
import androidx.compose.runtime.remember
import androidx.compose.runtime.derivedStateOf
import kotlinx.coroutines.delay
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContactEmergency
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Save
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.ui.Alignment
import androidx.compose.foundation.Canvas
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import kotlin.math.min
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.sp
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.ui.platform.LocalContext
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.alpha

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgentsListScreen(navController: NavHostController, vm: AgentsViewModel, reservationVm: com.rentacar.app.ui.vm.ReservationViewModel) {
    val allAgents by vm.list.collectAsState()
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
    val list by remember(debouncedQuery, allAgents) {
        derivedStateOf {
            if (debouncedQuery.trim().isEmpty()) {
                allAgents
            } else {
                val q = debouncedQuery.trim().lowercase()
                allAgents.filter { agent ->
                    val agentName = agent.name.lowercase()
                    val phone = (agent.phone ?: "").lowercase()
                    val email = (agent.email ?: "").lowercase()
                    
                    agentName.contains(q) || 
                    phone.contains(q) || 
                    email.contains(q)
                }
            }
        }
    }

    androidx.compose.foundation.layout.Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
            TitleBar(
                title = "סוכנים",
                color = LocalTitleColor.current,
                onHomeClick = { navController.navigate(com.rentacar.app.ui.navigation.Routes.Dashboard) }
            )
            Spacer(Modifier.height(12.dp))
            
            // Modern search bar
            AppSearchBar(
                query = searchQuery,
                onQueryChange = { searchQuery = it },
                placeholder = "חיפוש סוכן לפי שם, חברה או טלפון..."
            )
            
            Spacer(Modifier.height(12.dp))

            // Scrollable list area or empty state
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
                            "אין סוכנים להצגה."
                        }
                    )
                }
            } else {
                androidx.compose.foundation.layout.Box(modifier = Modifier.weight(1f)) {
                    androidx.compose.foundation.lazy.LazyColumn {
                        items(list, key = { it.id }) { agent ->
                            val isSelected = agent.id == selectedId
                            val context = LocalContext.current
                            
                            AgentCard(
                                agent = agent,
                                isSelected = isSelected,
                                onClick = { selectedId = agent.id },
                                onCallClick = {
                                    val intent = Intent(Intent.ACTION_DIAL).apply {
                                        data = Uri.parse("tel:${agent.phone}")
                                    }
                                    context.startActivity(intent)
                                }
                            )
                        }
                    }
                }
            }

        Spacer(Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(), 
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End), 
            verticalAlignment = Alignment.Bottom
        ) {
            // History button
            val selectedAgent = list.firstOrNull { it.id == selectedId }
            val history = selectedAgent?.id?.let { agentId ->
                reservationVm.reservationsByAgent(agentId).collectAsState(initial = emptyList()).value
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
            
            // Edit button
            FloatingActionButton(
                onClick = { 
                    if (selectedId != null) {
                        navController.navigate("agent_edit/$selectedId")
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
            
            // New button
            FloatingActionButton(onClick = { navController.navigate("agent_edit") }) {
                androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    androidx.compose.material3.Icon(imageVector = Icons.Filled.ContactEmergency, contentDescription = null, modifier = Modifier.size(24.dp))
                    Spacer(Modifier.height(2.dp))
                    Text("חדש", fontSize = 10.sp)
                }
            }
            
            // Delete button
            val hasReservations = history.isNotEmpty()
            val deleteEnabled = selectedId != null && !hasReservations
            FloatingActionButton(
                onClick = {
                    if (deleteEnabled) showConfirmDelete = true
                },
                modifier = Modifier.alpha(if (deleteEnabled) 1f else 0.3f)
            ) {
                androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    androidx.compose.material3.Icon(imageVector = Icons.Filled.Delete, contentDescription = null, modifier = Modifier.size(24.dp))
                    Spacer(Modifier.height(2.dp))
                    Text("מחק", fontSize = 10.sp)
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        }
    }
    
    // Delete confirmation dialog
    if (showConfirmDelete) {
        val selectedAgent = list.firstOrNull { it.id == selectedId }
        val hasReservations = selectedAgent?.id?.let { agentId ->
            reservationVm.reservationsByAgent(agentId).collectAsState(initial = emptyList()).value.isNotEmpty()
        } ?: false
        
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showConfirmDelete = false },
            title = { Text("מחיקת סוכן") },
            text = { 
                if (hasReservations) {
                    Text("לא ניתן למחוק סוכן שבוצעה לו הזמנה בעבר!")
                } else {
                    Text("האם אתה בטוח שברצונך למחוק את הסוכן?")
                }
            },
            confirmButton = {
                if (!hasReservations) {
                    androidx.compose.material3.TextButton(
                        onClick = {
                            selectedId?.let { id ->
                                vm.delete(id)
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
        val selectedAgent = list.firstOrNull { it.id == selectedId }
        val history = selectedAgent?.id?.let { agentId ->
            reservationVm.reservationsByAgent(agentId).collectAsState(initial = emptyList()).value
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
                    // Agent name line with modern styling
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
                            imageVector = Icons.Filled.ContactEmergency,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = selectedAgent?.name ?: "",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            },
            text = {
                if (history.isEmpty()) {
                    Text("אין הזמנות קודמות לסוכן זה")
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
fun AgentEditScreen(
    navController: NavHostController, 
    vm: AgentsViewModel,
    agentId: Long? = null
) {
    val list by vm.list.collectAsState()
    val existing = list.firstOrNull { it.id == agentId }
    
    var name by rememberSaveable { mutableStateOf(existing?.name ?: "") }
    var phone by rememberSaveable { mutableStateOf(existing?.phone ?: "") }
    var email by rememberSaveable { mutableStateOf(existing?.email ?: "") }
    var attemptedSave by rememberSaveable { mutableStateOf(false) }
    
    val isEdit = existing != null

    // Update fields when existing data changes
    LaunchedEffect(existing?.id) {
        if (existing != null) {
            name = existing.name
            phone = existing.phone ?: ""
            email = existing.email ?: ""
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
                title = if (isEdit) "עריכת סוכן" else "סוכן חדש",
                color = LocalTitleColor.current,
                onHomeClick = { navController.popBackStack() }
            )
            Spacer(Modifier.height(16.dp))

            // פרטי סוכן - Card
            androidx.compose.material3.Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                elevation = androidx.compose.material3.CardDefaults.cardElevation(defaultElevation = 2.dp),
                colors = androidx.compose.material3.CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    // כותרת הקטגוריה
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.ContactEmergency,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "פרטי סוכן",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // שם
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("שם *") },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Person,
                                contentDescription = null,
                                tint = if (attemptedSave && name.isBlank()) 
                                    MaterialTheme.colorScheme.error 
                                else 
                                    MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        singleLine = true,
                        colors = androidx.compose.material3.TextFieldDefaults.outlinedTextFieldColors(
                            containerColor = if (name.isBlank()) androidx.compose.ui.graphics.Color(0xFFFFC1B6) else androidx.compose.ui.graphics.Color.Unspecified
                        ),
                        isError = attemptedSave && name.isBlank(),
                        supportingText = { if (attemptedSave && name.isBlank()) Text("שדה חובה") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // טלפון
                    OutlinedTextField(
                        value = phone,
                        onValueChange = { phone = it },
                        label = { Text("טלפון") },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Phone,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
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
            val isSaveEnabled = name.isNotBlank()

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

            // כפתור שמירה
            FloatingActionButton(
                onClick = {
                    if (!isSaveEnabled) { 
                        attemptedSave = true
                        android.widget.Toast.makeText(context, "יש למלא שם", android.widget.Toast.LENGTH_SHORT).show()
                        return@FloatingActionButton 
                    }
                    val agent = if (agentId != null) {
                        Agent(id = agentId, name = name, phone = phone.ifBlank { null }, email = email.ifBlank { null })
                    } else {
                        Agent(name = name, phone = phone.ifBlank { null }, email = email.ifBlank { null })
                    }
                    vm.save(agent) { 
                        navController.popBackStack()
                    }
                },
                modifier = Modifier
                    .weight(1f)
                    .alpha(if (isSaveEnabled) 1f else 0.5f),
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

@Composable
fun AgentCard(
    agent: Agent,
    isSelected: Boolean,
    onClick: () -> Unit,
    onCallClick: () -> Unit
) {
    val cardColor = Color(0xFF2196F3) // Blue for agents
    
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
                        text = agent.name,
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
                
                // Phone line
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
                            text = agent.phone?.ifBlank { "—" } ?: "—",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    
                    // Call button if selected and has phone
                    if (isSelected && !agent.phone.isNullOrBlank()) {
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
                
                // Email line
                if (!agent.email.isNullOrBlank()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Email,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = agent.email ?: "",
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


