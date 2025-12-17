package com.rentacar.app.ui.admin

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.rentacar.app.ui.navigation.Routes

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminHomeScreen(
    navController: NavHostController,
    viewModel: AdminDashboardViewModel
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val adminRepository = remember { com.rentacar.app.data.admin.FirebaseAdminRepository() }
    var isAdmin by remember { mutableStateOf<Boolean?>(null) }
    
    // Check admin status on load
    LaunchedEffect(Unit) {
        isAdmin = adminRepository.amIAdmin()
        if (isAdmin == false) {
            // Not admin - navigate away or show access denied
        }
    }
    
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
                title = { Text("לוח ניהול") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            imageVector = Icons.Filled.ArrowBack,
                            contentDescription = "חזור"
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.refresh() }) {
                        Icon(
                            imageVector = Icons.Filled.Refresh,
                            contentDescription = "רענן"
                        )
                    }
                }
            )
        },
        snackbarHost = {
            SnackbarHost(hostState = snackbarHostState)
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { navController.navigate(Routes.AdminYards) }
            ) {
                Text("ניהול מגרשים", fontWeight = FontWeight.Bold)
            }
        }
    ) { paddingValues ->
        // Show access denied if not admin
        if (isAdmin == false) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text(
                        "אין גישה",
                        style = MaterialTheme.typography.headlineMedium
                    )
                    Text("רק מנהלים יכולים לגשת למסך זה")
                    Button(onClick = { navController.popBackStack() }) {
                        Text("חזור")
                    }
                }
            }
            return@Scaffold
        }
        
        if (uiState.isLoading && uiState.data == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(16.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                val data = uiState.data
                
                if (data != null) {
                    // Yards Status Card
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = "סטטוס מגרשים",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Spacer(Modifier.height(12.dp))
                            Text("מגרשים בהמתנה: ${data.yards.pending}")
                            Spacer(Modifier.height(8.dp))
                            Text("מגרשים מאושרים: ${data.yards.approved}")
                            Spacer(Modifier.height(8.dp))
                            Text("מגרשים דורשים מידע נוסף: ${data.yards.needsInfo}")
                            Spacer(Modifier.height(8.dp))
                            Text("מגרשים שנדחו: ${data.yards.rejected}")
                        }
                    }
                    
                    Spacer(Modifier.height(16.dp))
                    
                    // Imports Card
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = "יבוא רכבים",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Spacer(Modifier.height(12.dp))
                            Text("יבוא ב-7 ימים אחרונים: ${data.imports.carsImportedLast7d}")
                            Spacer(Modifier.height(8.dp))
                            Text("יבוא ב-30 ימים אחרונים: ${data.imports.carsImportedLast30d}")
                        }
                    }
                    
                    Spacer(Modifier.height(16.dp))
                    
                    // Views Card
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = "צפיות במערכת",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Spacer(Modifier.height(12.dp))
                            Text("סה\"כ צפיות: ${data.views.totalCarViews}")
                            Spacer(Modifier.height(8.dp))
                            Text("צפיות ב-7 ימים אחרונים: ${data.views.carViewsLast7d}")
                            Spacer(Modifier.height(8.dp))
                            Text("צפיות ב-30 ימים אחרונים: ${data.views.carViewsLast30d}")
                        }
                    }
                    
                    Spacer(Modifier.height(16.dp))
                    
                    // Top Yards Card
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = "מגרשים מובילים (7 ימים אחרונים)",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Spacer(Modifier.height(12.dp))
                            if (data.topYardsLast7d.isEmpty()) {
                                Text(
                                    "אין נתונים",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                                )
                            } else {
                                data.topYardsLast7d.forEachIndexed { index, item ->
                                    Text("${index + 1}. ${item.displayName}: ${item.views} צפיות")
                                    if (index < data.topYardsLast7d.size - 1) {
                                        Spacer(Modifier.height(4.dp))
                                    }
                                }
                            }
                        }
                    }
                    
                    Spacer(Modifier.height(16.dp))
                    
                    // Top Cars Card
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = "רכבים מובילים (7 ימים אחרונים)",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Spacer(Modifier.height(12.dp))
                            if (data.topCarsLast7d.isEmpty()) {
                                Text(
                                    "אין נתונים",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                                )
                            } else {
                                data.topCarsLast7d.forEachIndexed { index, item ->
                                    Text("${index + 1}. ${item.yardName} - רכב ${item.carId}: ${item.views} צפיות")
                                    if (index < data.topCarsLast7d.size - 1) {
                                        Spacer(Modifier.height(4.dp))
                                    }
                                }
                            }
                        }
                    }
                }
                
                Spacer(Modifier.height(16.dp))
            }
        }
    }
}

