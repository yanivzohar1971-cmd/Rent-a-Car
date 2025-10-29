package com.rentacar.app.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import com.rentacar.app.prefs.SettingsStore

data class ReservationListItem(
    val reservationId: Long? = null,
    val title: String,
    val subtitle: String,
    val price: String,
    val supplierOrderNumber: String? = null,
    val icon: Any? = null,
    val dateFromMillis: Long? = null,
    val isCancelled: Boolean = false,
    val isClosed: Boolean = false,
    val usePlaneIcon: Boolean = false,
    val isQuote: Boolean = false,
    val commissionText: String? = null
)

@Composable
fun ReservationRow(item: ReservationListItem, onClick: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val settings = remember { SettingsStore(context) }
    val futureHex = settings.reservationIconFutureColor().collectAsState(initial = "#2196F3").value
    val todayHex = settings.reservationIconTodayColor().collectAsState(initial = "#4CAF50").value
    val pastHex = settings.reservationIconPastColor().collectAsState(initial = "#9E9E9E").value
    val closedHex = settings.reservationIconClosedColor().collectAsState(initial = "#795548").value
    val now = System.currentTimeMillis()
    val (startDay, endDay) = run {
        val cal = java.util.Calendar.getInstance().apply {
            timeInMillis = now
            set(java.util.Calendar.HOUR_OF_DAY, 0)
            set(java.util.Calendar.MINUTE, 0)
            set(java.util.Calendar.SECOND, 0)
            set(java.util.Calendar.MILLISECOND, 0)
        }
        val start = cal.timeInMillis
        val end = start + 24L*60*60*1000 - 1
        start to end
    }
    
    val tintHex = when {
        item.isCancelled -> "#F44336"
        item.isClosed -> closedHex
        else -> item.dateFromMillis?.let { df ->
            when {
                df < startDay -> pastHex
                df in startDay..endDay -> todayHex
                else -> futureHex
            }
        } ?: futureHex
    }
    val cardColor = Color(android.graphics.Color.parseColor(tintHex))
    
    val icon = when {
        item.usePlaneIcon -> Icons.Filled.Flight
        item.isQuote -> Icons.Filled.Help
        else -> Icons.Filled.DirectionsCar
    }
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 6.dp),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
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
                // Header: Title + Icon
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = item.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f)
                    )
                    
                    // Icon bubble
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .background(cardColor, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = icon,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
                
                Spacer(Modifier.height(1.5.dp))
                
                // Subtitle (dates/car type)
                Text(
                    text = item.subtitle,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                
                Spacer(Modifier.height(1.5.dp))
                
                // Commission + Supplier order number + Supplier name (all in one row)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Left side: commission and order number
                    val comm = item.commissionText
                    val ord = item.supplierOrderNumber
                    val parts = mutableListOf<String>()
                    if (!comm.isNullOrBlank()) parts += comm
                    if (!ord.isNullOrBlank()) parts += ("הזמנת ספק: $ord")
                    
                    if (parts.isNotEmpty()) {
                        Text(
                            text = parts.joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f, fill = false)
                        )
                    } else {
                        Spacer(Modifier.weight(1f))
                    }
                    
                    Spacer(Modifier.width(8.dp))
                    
                    // Right side: Supplier name chip
                    Box(
                        modifier = Modifier
                            .background(
                                cardColor.copy(alpha = 0.15f),
                                RoundedCornerShape(8.dp)
                            )
                            .padding(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = item.price,
                            style = MaterialTheme.typography.labelMedium,
                            color = cardColor,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
            
            Spacer(Modifier.width(8.dp))
        }
    }
}

@Composable
fun ReservationListRow(item: ReservationListItem, onClick: () -> Unit) {
    ReservationRow(item, onClick)
}

@Composable
fun ReservationsList(items: List<ReservationListItem>, onItemClick: (ReservationListItem) -> Unit) {
    LazyColumn {
        items(items) { item ->
            ReservationRow(item) { onItemClick(item) }
        }
    }
}


