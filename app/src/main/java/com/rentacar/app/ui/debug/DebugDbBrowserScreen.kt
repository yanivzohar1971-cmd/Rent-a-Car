package com.rentacar.app.ui.debug

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import android.app.Activity
import android.content.pm.ActivityInfo
import androidx.navigation.NavHostController
import com.rentacar.app.data.debug.DebugDatabaseRepository
import com.rentacar.app.data.debug.DebugTableDefinition
import com.rentacar.app.di.DatabaseModule
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.LocalTitleColor

@Composable
fun DebugDbBrowserScreen(
    navController: NavHostController,
    viewModel: DebugDbBrowserViewModel? = null
) {
    val context = LocalContext.current
    val vm = viewModel ?: remember {
        val db = DatabaseModule.provideDatabase(context)
        val repository = DebugDatabaseRepository(db)
        DebugDbBrowserViewModel(repository)
    }
    val tables by vm.tables.collectAsState()
    val selectedTable by vm.selectedTable.collectAsState()
    val tableData by vm.tableData.collectAsState()
    val isLoading by vm.isLoading.collectAsState()
    val errorMessage by vm.errorMessage.collectAsState()
    val rowCount by vm.rowCount.collectAsState()
    val titleColor = LocalTitleColor.current
    
    // Enable rotation only for this screen
    val activity = context as? Activity
    DisposableEffect(Unit) {
        val originalOrientation = activity?.requestedOrientation
        activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
        onDispose {
            // Restore original orientation (or PORTRAIT if null)
            activity?.requestedOrientation = originalOrientation ?: ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        }
    }
    
    Column(modifier = Modifier.fillMaxSize()) {
        TitleBar(
            title = "תצוגת טבלאות (Debug)",
            color = titleColor,
            onHomeClick = { navController.popBackStack() },
            startIcon = Icons.AutoMirrored.Filled.ArrowBack,
            onStartClick = { navController.popBackStack() }
        )
        
        Row(modifier = Modifier.fillMaxSize()) {
            // Left panel: Table list
            Column(
                modifier = Modifier
                    .width(200.dp)
                    .fillMaxHeight()
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .verticalScroll(rememberScrollState())
            ) {
                Text(
                    text = "טבלאות",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(16.dp)
                )
                HorizontalDivider()
                
                tables.forEach { table ->
                    val isSelected = selectedTable?.tableName == table.tableName
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                            .clickable { vm.selectTable(table) },
                        colors = CardDefaults.cardColors(
                            containerColor = if (isSelected) {
                                MaterialTheme.colorScheme.primaryContainer
                            } else {
                                MaterialTheme.colorScheme.surface
                            }
                        )
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(
                                text = table.displayName,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                            )
                            Text(
                                text = table.tableName,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
            
            // Main content: Table data view
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
            ) {
                when {
                    selectedTable == null -> {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "בחר טבלה להצגה",
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    isLoading -> {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(16.dp)
                            ) {
                                CircularProgressIndicator()
                                Text("טוען נתונים...")
                            }
                        }
                    }
                    errorMessage != null -> {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = errorMessage ?: "שגיאה",
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                    tableData != null -> {
                        val data = tableData!!
                        if (data.columns.isEmpty()) {
                            Box(
                                modifier = Modifier.fillMaxSize(),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "הטבלה ריקה",
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        } else {
                            // Fixed column width for all cells
                            val cellWidth = 140.dp
                            
                            Column(modifier = Modifier.fillMaxSize()) {
                                // Row count display
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 8.dp),
                                    horizontalArrangement = Arrangement.Start
                                ) {
                                    Text(
                                        text = "סה״כ רשומות: $rowCount",
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                                
                                // Horizontally scrollable container
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .horizontalScroll(rememberScrollState())
                                ) {
                                    Column(modifier = Modifier.fillMaxWidth()) {
                                        // Header row
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .background(MaterialTheme.colorScheme.primaryContainer)
                                        ) {
                                            data.columns.forEach { columnName ->
                                                Text(
                                                    text = columnName,
                                                    modifier = Modifier
                                                        .width(cellWidth)
                                                        .padding(8.dp),
                                                    style = MaterialTheme.typography.labelMedium,
                                                    fontWeight = FontWeight.Bold
                                                )
                                            }
                                        }
                                        
                                        HorizontalDivider()
                                        
                                        // Data rows
                                        LazyColumn {
                                            items(data.rows) { row ->
                                                Row(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .background(
                                                            if (data.rows.indexOf(row) % 2 == 0) {
                                                                MaterialTheme.colorScheme.surface
                                                            } else {
                                                                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
                                                            }
                                                        )
                                                ) {
                                                    row.forEach { cell ->
                                                        Text(
                                                            text = cell ?: "NULL",
                                                            modifier = Modifier
                                                                .width(cellWidth)
                                                                .padding(8.dp),
                                                            style = MaterialTheme.typography.bodySmall
                                                        )
                                                    }
                                                }
                                                HorizontalDivider(modifier = Modifier.height(1.dp))
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

