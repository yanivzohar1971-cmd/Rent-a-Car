package com.rentacar.app.ui.admin

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.rentacar.app.data.auth.PrimaryRole
import com.rentacar.app.data.auth.UserProfile
import com.rentacar.app.ui.components.AppButton
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.LocalTitleColor
import android.widget.Toast

@Composable
fun AdminRoleManagementScreen(
    navController: NavHostController,
    viewModel: AdminViewModel
) {
    val context = LocalContext.current
    val titleColor = LocalTitleColor.current
    val uiState by viewModel.uiState.collectAsState()
    var selectedTab by remember { mutableStateOf(0) } // 0 = Pending Requests, 1 = User Search
    
    // Load pending requests on first load
    LaunchedEffect(Unit) {
        viewModel.loadPendingRequests()
    }
    
    Column(modifier = Modifier.fillMaxSize()) {
        TitleBar(
            title = "ניהול תפקידים - מנהל",
            color = titleColor,
            onHomeClick = { navController.popBackStack() }
        )
        
        // Tabs
        TabRow(selectedTabIndex = selectedTab) {
            Tab(
                selected = selectedTab == 0,
                onClick = { selectedTab = 0 },
                text = { Text("בקשות ממתינות") }
            )
            Tab(
                selected = selectedTab == 1,
                onClick = { selectedTab = 1 },
                text = { Text("חיפוש משתמשים") }
            )
        }
        
        // Content
        when (selectedTab) {
            0 -> PendingRequestsTab(viewModel, uiState)
            1 -> UserSearchTab(viewModel, uiState)
        }
        
        // Error message
        uiState.errorMessage?.let { error ->
            LaunchedEffect(error) {
                Toast.makeText(context, error, Toast.LENGTH_LONG).show()
                viewModel.clearError()
            }
        }
    }
}

@Composable
private fun PendingRequestsTab(
    viewModel: AdminViewModel,
    uiState: AdminUiState
) {
    if (uiState.isLoading) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator()
        }
    } else if (uiState.pendingRequests.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "אין בקשות ממתינות",
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center
            )
        }
    } else {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(uiState.pendingRequests) { profile ->
                PendingRequestItem(profile, viewModel)
            }
        }
    }
}

@Composable
private fun PendingRequestItem(
    profile: UserProfile,
    viewModel: AdminViewModel
) {
    var showReasonDialog by remember { mutableStateOf(false) }
    var reason by remember { mutableStateOf("") }
    
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Text(
                text = profile.displayName ?: profile.email,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "אימייל: ${profile.email}",
                style = MaterialTheme.typography.bodySmall
            )
            if (profile.phoneNumber != null) {
                Text(
                    text = "טלפון: ${profile.phoneNumber}",
                    style = MaterialTheme.typography.bodySmall
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "מבקש תפקיד: ${profile.requestedRole ?: "לא ידוע"}",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                AppButton(
                    onClick = {
                        showReasonDialog = true
                    },
                    modifier = Modifier.weight(1f)
                ) {
                    Text("אשר", fontSize = 14.sp)
                }
                AppButton(
                    onClick = {
                        viewModel.resolveRoleRequest(profile.uid, "REJECT", reason.takeIf { it.isNotBlank() })
                    },
                    modifier = Modifier.weight(1f)
                ) {
                    Text("דחה", fontSize = 14.sp)
                }
            }
        }
    }
    
    if (showReasonDialog) {
        AlertDialog(
            onDismissRequest = { showReasonDialog = false },
            title = { Text("אשר בקשה") },
            text = {
                Column {
                    Text("האם לאשר את הבקשה לתפקיד ${profile.requestedRole}?")
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = reason,
                        onValueChange = { reason = it },
                        label = { Text("סיבה (אופציונלי)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.resolveRoleRequest(profile.uid, "APPROVE", reason.takeIf { it.isNotBlank() })
                        showReasonDialog = false
                        reason = ""
                    }
                ) {
                    Text("אשר")
                }
            },
            dismissButton = {
                TextButton(onClick = { showReasonDialog = false }) {
                    Text("ביטול")
                }
            }
        )
    }
}

@Composable
private fun UserSearchTab(
    viewModel: AdminViewModel,
    uiState: AdminUiState
) {
    var searchQuery by remember { mutableStateOf("") }
    var selectedUser by remember { mutableStateOf<UserProfile?>(null) }
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        OutlinedTextField(
            value = searchQuery,
            onValueChange = {
                searchQuery = it
                viewModel.searchUsers(it)
            },
            label = { Text("חיפוש לפי אימייל, טלפון או UID") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        if (uiState.isLoading) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else if (searchQuery.isBlank()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "הזן שאילתת חיפוש",
                    style = MaterialTheme.typography.bodyLarge,
                    textAlign = TextAlign.Center
                )
            }
        } else if (uiState.searchResults.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "לא נמצאו תוצאות",
                    style = MaterialTheme.typography.bodyLarge,
                    textAlign = TextAlign.Center
                )
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(uiState.searchResults) { profile ->
                    UserSearchResultItem(
                        profile = profile,
                        onClick = { selectedUser = profile }
                    )
                }
            }
        }
    }
    
    // User details dialog
    selectedUser?.let { user ->
        UserRoleEditDialog(
            user = user,
            onDismiss = { selectedUser = null },
            onSave = { role, reason ->
                viewModel.setUserRole(user.uid, role, reason)
                selectedUser = null
            }
        )
    }
}

@Composable
private fun UserSearchResultItem(
    profile: UserProfile,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Text(
                text = profile.displayName ?: profile.email,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "אימייל: ${profile.email}",
                style = MaterialTheme.typography.bodySmall
            )
            Text(
                text = "תפקיד נוכחי: ${profile.primaryRole ?: "לא מוגדר"}",
                style = MaterialTheme.typography.bodySmall
            )
            if (profile.requestedRole != null) {
                Text(
                    text = "בקשה ממתינה: ${profile.requestedRole}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }
    }
}

@Composable
private fun UserRoleEditDialog(
    user: UserProfile,
    onDismiss: () -> Unit,
    onSave: (PrimaryRole, String?) -> Unit
) {
    var selectedRole by remember { mutableStateOf<PrimaryRole?>(null) }
    var reason by remember { mutableStateOf("") }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("ערוך תפקיד משתמש") },
        text = {
            Column {
                Text("משתמש: ${user.displayName ?: user.email}")
                Spacer(modifier = Modifier.height(16.dp))
                Text("בחר תפקיד:", fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(8.dp))
                PrimaryRole.values().forEach { role ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clickable { selectedRole = role }
                    ) {
                        RadioButton(
                            selected = selectedRole == role,
                            onClick = { selectedRole = role }
                        )
                        Text(role.displayName)
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it },
                    label = { Text("סיבה (אופציונלי)") },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    selectedRole?.let { onSave(it, reason.takeIf { it.isNotBlank() }) }
                },
                enabled = selectedRole != null
            ) {
                Text("שמור")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("ביטול")
            }
        }
    )
}

