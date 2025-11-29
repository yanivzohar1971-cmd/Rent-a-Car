package com.rentacar.app.ui.yard

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.ui.navigation.Routes
import com.rentacar.app.ui.vm.yard.YardFleetViewModel
import com.rentacar.app.ui.vm.yard.YardCarItem
import com.rentacar.app.ui.vm.yard.YardCarStatus

/**
 * Yard Home / Dashboard Screen
 * Main entry point for users with YARD role
 */
@Composable
fun YardHomeScreen(
    navController: NavHostController,
    authViewModel: com.rentacar.app.ui.auth.AuthViewModel
) {
    val authState by authViewModel.uiState.collectAsState()
    val userProfile = authState.currentUser
    val yardName = userProfile?.displayName ?: userProfile?.email ?: "שם מגרש לא מוגדר"

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        TitleBar(
            title = "מגרש רכבים",
            color = com.rentacar.app.LocalTitleColor.current,
            onSettingsClick = { navController.navigate(Routes.Settings) }
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        // Yard name subtitle
        Text(
            text = yardName,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
            modifier = Modifier.padding(horizontal = 16.dp)
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Action cards
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            item {
                // Yard Profile Card
                YardActionCard(
                    icon = Icons.Filled.Business,
                    title = "פרטי המגרש",
                    subtitle = "שם, כתובת, טלפון, לוגו",
                    onClick = {
                        navController.navigate(Routes.YardProfile)
                    }
                )
            }
            
            item {
                // Fleet Management Card
                YardActionCard(
                    icon = Icons.Filled.DirectionsCar,
                    title = "צי הרכב שלי",
                    subtitle = "ניהול רכבים במגרש – הוספה, עריכה, פרסום",
                    onClick = {
                        navController.navigate(Routes.YardFleet)
                    }
                )
            }
        }
    }
}

/**
 * Reusable action card for Yard home screen
 */
@Composable
private fun YardActionCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(48.dp),
                tint = MaterialTheme.colorScheme.primary
            )
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                )
            }
        }
    }
}

/**
 * Yard Profile Screen (placeholder)
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun YardProfileScreen(navController: NavHostController) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("פרטי המגרש") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            imageVector = Icons.Filled.ArrowBack,
                            contentDescription = "חזור"
                        )
                    }
                }
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "מסך פרטי מגרש – יפותח בהמשך",
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center
            )
        }
    }
}

/**
 * Yard Fleet Screen
 * Shows list of cars in the yard's fleet
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun YardFleetScreen(
    navController: NavHostController,
    viewModel: YardFleetViewModel
) {
    val uiState by viewModel.uiState.collectAsState()
    val errorMessage = uiState.errorMessage
    
    // Show error snackbar if there's an error
    LaunchedEffect(errorMessage) {
        errorMessage?.let { error ->
            // Show snackbar (could use Scaffold's SnackbarHost for better UX)
            android.util.Log.e("YardFleetScreen", error)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("צי הרכב שלי") },
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
        floatingActionButton = {
            FloatingActionButton(
                onClick = {
                    // Navigate to Yard-only car creation screen
                    navController.navigate(Routes.YardCarEdit)
                }
            ) {
                Icon(
                    imageVector = Icons.Filled.Add,
                    contentDescription = "הוסף רכב"
                )
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when {
                // Loading state
                uiState.isLoading && uiState.items.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
                
                // Error state (show error message, but keep items if available)
                errorMessage != null && uiState.items.isEmpty() -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(
                            text = errorMessage,
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.error,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = { viewModel.refreshFleet() }) {
                            Text("נסה שוב")
                        }
                    }
                }
                
                // Empty state
                uiState.items.isEmpty() -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(
                            text = "אין עדיין רכבים במגרש שלך",
                            style = MaterialTheme.typography.bodyLarge,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = {
                                navController.navigate(Routes.CarPurchase)
                            }
                        ) {
                            Text("הוסף רכב ראשון")
                        }
                    }
                }
                
                // Normal state with items
                else -> {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(vertical = 8.dp)
                    ) {
                        items(uiState.items) { car ->
                            YardCarCard(
                                car = car,
                                onClick = {
                                    // Navigate to Yard-only car edit screen
                                    val carId = car.id.toLongOrNull()
                                    if (carId != null) {
                                        navController.navigate(Routes.YardCarEditWithId.replace("{carId}", carId.toString()))
                                    }
                                }
                            )
                        }
                        
                        // Show error message at bottom if items exist but there's also an error
                        if (errorMessage != null) {
                            item {
                                Surface(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 8.dp),
                                    color = MaterialTheme.colorScheme.errorContainer,
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text(
                                        text = errorMessage,
                                        modifier = Modifier.padding(12.dp),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onErrorContainer,
                                        textAlign = TextAlign.Center
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Car card item for fleet list
 */
@Composable
private fun YardCarCard(
    car: YardCarItem,
    onClick: () -> Unit = {}
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
            // Line 1: Brand + Model + Year (if available)
            val yearText = car.year?.let { ", $it" } ?: ""
            Text(
                text = "${car.brand} ${car.model}$yearText",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            // Line 2: Price
            Text(
                text = car.price?.let { "₪$it" } ?: "מחיר לא מוגדר",
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            // Line 3: Status chip
            val (statusText, statusColor) = when (car.status) {
                YardCarStatus.PUBLISHED -> "מפורסם" to MaterialTheme.colorScheme.primary
                YardCarStatus.HIDDEN -> "מוסתר" to MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                YardCarStatus.DRAFT -> "טיוטה" to MaterialTheme.colorScheme.error
            }
            
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = statusColor.copy(alpha = 0.2f)
            ) {
                Text(
                    text = statusText,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = statusColor
                )
            }
        }
    }
}

