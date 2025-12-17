package com.rentacar.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.window.Dialog
import com.rentacar.app.data.sync.SyncProgressState

/**
 * Labeled progress bar with text showing current/total and percentage.
 * Uses purple color (0xFF8E24AA) matching Rent_a_Car theme.
 */
@Composable
fun LabeledProgressBar(
    label: String,      // e.g. "הזמנות"
    current: Int,       // current item index
    total: Int,         // total items
    modifier: Modifier = Modifier
) {
    val fraction = if (total > 0) current.toFloat() / total else 0f
    val percentText = "${(fraction * 100).toInt()}%"

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
    ) {
        Text(
            text = "$label: רשומה $current מתוך $total ($percentText)",
            textAlign = TextAlign.End,
            modifier = Modifier.fillMaxWidth(),
            style = MaterialTheme.typography.bodyMedium
        )

        Spacer(Modifier.height(4.dp))

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(18.dp)
                .clip(RoundedCornerShape(9.dp))
                .background(Color(0xFFE0E0E0)),
            contentAlignment = Alignment.Center
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(fraction)
                    .clip(RoundedCornerShape(9.dp))
                    .background(Color(0xFF8E24AA))
            )

            Text(
                text = percentText,
                color = Color.White,
                style = MaterialTheme.typography.labelMedium
            )
        }
    }
}

/**
 * Professional sync progress dialog showing detailed progress information:
 * - Current table index and name
 * - Current record index within table
 * - Per-table progress bar
 * - Overall progress bar
 * - Status messages
 * 
 * Designed for Hebrew RTL layout matching the app's design.
 */
@Composable
fun SyncProgressDialog(
    visible: Boolean,
    state: SyncProgressState,
    onDismiss: () -> Unit
) {
    if (!visible) return

    Dialog(
        onDismissRequest = {
            // Only allow dismiss when sync is not running
            if (!state.isRunning) {
                onDismiss()
            }
        }
    ) {
        Surface(
            shape = MaterialTheme.shapes.medium,
            tonalElevation = 8.dp,
            modifier = Modifier.widthIn(min = 280.dp, max = 400.dp)
        ) {
            Column(
                modifier = Modifier
                    .padding(horizontal = 24.dp, vertical = 20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Title
                Text(
                    text = "סנכרון נתונים",
                    style = MaterialTheme.typography.titleLarge,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
                
                Divider(modifier = Modifier.fillMaxWidth())
                
                // Table index text at top
                if (state.totalTables > 0) {
                    Text(
                        text = "טבלה ${state.currentTableIndex} מתוך ${state.totalTables}",
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                
                // Table name text
                if (state.currentTableName != null) {
                    Text(
                        text = "סוג טבלה: ${state.currentTableName}",
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                
                // Per-table progress bar
                if (state.currentTableItemTotal > 0) {
                    LabeledProgressBar(
                        label = "טבלה ${state.currentTableIndex} מתוך ${state.totalTables} – ${state.currentTableName ?: ""}",
                        current = state.currentTableItemIndex,
                        total = state.currentTableItemTotal,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                
                Spacer(modifier = Modifier.height(8.dp))
                
                // Global progress bar
                if (state.overallTotalItems > 0) {
                    LabeledProgressBar(
                        label = "סה\"כ כל הטבלאות",
                        current = state.overallProcessedItems,
                        total = state.overallTotalItems,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                
                // Success message when completed
                if (!state.isRunning && !state.isError && state.overallPercent >= 1f && state.overallTotalItems > 0) {
                    Text(
                        text = "הסתיים בהצלחה",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                
                // Last message (muted color) - shown during sync or on error
                if (state.lastMessage != null && (state.isRunning || state.isError)) {
                    Text(
                        text = state.lastMessage,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                
                // Error state
                if (state.isError) {
                    Text(
                        text = "שגיאה בסנכרון",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                
                Divider(modifier = Modifier.fillMaxWidth())
                
                // Close button (enabled only when not running)
                Button(
                    onClick = onDismiss,
                    enabled = !state.isRunning,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("סגור")
                }
            }
        }
    }
}

