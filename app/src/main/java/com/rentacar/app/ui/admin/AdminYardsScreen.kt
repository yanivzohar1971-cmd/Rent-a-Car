package com.rentacar.app.ui.admin

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.rentacar.app.data.admin.YardStatus
import com.rentacar.app.ui.navigation.Routes

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminYardsScreen(
    navController: NavHostController,
    viewModel: AdminYardsViewModel
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    
    // Show error message via Snackbar
    uiState.errorMessage?.let { errorMsg ->
        LaunchedEffect(errorMsg) {
            snackbarHostState.showSnackbar(
                message = errorMsg,
                withDismissAction = true
            )
            viewModel.clearError()
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("מגרשים") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            imageVector = Icons.Filled.ArrowBack,
                            contentDescription = "חזור"
                        )
                    }
                }
            )
        },
        snackbarHost = {
            SnackbarHost(hostState = snackbarHostState)
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Filter chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = uiState.selectedStatus == null,
                    onClick = { viewModel.onStatusFilterChanged(null) },
                    label = { Text("הכל") }
                )
                FilterChip(
                    selected = uiState.selectedStatus == YardStatus.PENDING,
                    onClick = { viewModel.onStatusFilterChanged(YardStatus.PENDING) },
                    label = { Text("בהמתנה") }
                )
                FilterChip(
                    selected = uiState.selectedStatus == YardStatus.APPROVED,
                    onClick = { viewModel.onStatusFilterChanged(YardStatus.APPROVED) },
                    label = { Text("מאושרים") }
                )
                FilterChip(
                    selected = uiState.selectedStatus == YardStatus.NEEDS_INFO,
                    onClick = { viewModel.onStatusFilterChanged(YardStatus.NEEDS_INFO) },
                    label = { Text("דורש מידע") }
                )
                FilterChip(
                    selected = uiState.selectedStatus == YardStatus.REJECTED,
                    onClick = { viewModel.onStatusFilterChanged(YardStatus.REJECTED) },
                    label = { Text("נדחו") }
                )
            }
            
            // Search field
            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = { viewModel.onSearchQueryChanged(it) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                label = { Text("חפש לפי שם / טלפון / עיר") },
                leadingIcon = {
                    Icon(Icons.Filled.Search, contentDescription = null)
                },
                singleLine = true
            )
            
            Spacer(Modifier.height(8.dp))
            
            // List
            if (uiState.isLoading && uiState.items.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            } else if (uiState.items.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text("אין מגרשים")
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(uiState.items) { yard ->
                        YardCard(
                            yard = yard,
                            onClick = {
                                navController.navigate(
                                    Routes.AdminYardDetails.replace(
                                        "{yardUid}",
                                        yard.yardUid
                                    )
                                )
                            }
                        )
                    }
                    
                    // Load more trigger
                    if (uiState.nextPageToken != null) {
                        item {
                            Button(
                                onClick = { viewModel.loadMore() },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text("טען עוד")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun YardCard(
    yard: com.rentacar.app.data.admin.AdminYardSummary,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Text(
                text = yard.displayName,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(8.dp))
            Text("${yard.city} - ${yard.phone}")
            Spacer(Modifier.height(8.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                StatusChip(status = yard.status)
                if (yard.hasImportProfile) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.primaryContainer
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                Icons.Filled.CheckCircle,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp)
                            )
                            Text(
                                "ייבוא מוגדר",
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                    }
                } else {
                    Text(
                        "אין פונקציית ייבוא",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )
                }
            }
        }
    }
}

@Composable
private fun StatusChip(status: YardStatus) {
    val (text, color) = when (status) {
        YardStatus.PENDING -> "בהמתנה" to MaterialTheme.colorScheme.tertiary
        YardStatus.APPROVED -> "מאושר" to MaterialTheme.colorScheme.primary
        YardStatus.NEEDS_INFO -> "דורש מידע" to MaterialTheme.colorScheme.secondary
        YardStatus.REJECTED -> "נדחה" to MaterialTheme.colorScheme.error
    }
    
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = color.copy(alpha = 0.2f)
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            style = MaterialTheme.typography.bodySmall,
            color = color
        )
    }
}

