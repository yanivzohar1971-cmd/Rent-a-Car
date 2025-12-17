package com.rentacar.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Domain
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

// ============================================
// Data Classes (Mock Data)
// ============================================

data class ReservationDatesData(
    val startDate: String,      // e.g. "01/11/2025"
    val startTime: String,       // e.g. "10:00"
    val endDate: String,         // e.g. "05/11/2025"
    val endTime: String,         // e.g. "10:00"
    val totalDays: Int           // e.g. 4
)

data class FinancialDetailsData(
    val dailyPrice: String,      // e.g. "250"
    val totalPrice: String,      // e.g. "1000"
    val deposit: String,         // e.g. "2000"
    val kmIncluded: String,      // e.g. "250"
    val includeVat: Boolean      // true/false
)

data class SupplierBranchData(
    val supplierName: String,    // e.g. "אלדן"
    val branchCity: String,      // e.g. "תל אביב"
    val orderNumber: String,     // e.g. "123456"
    val isAirportMode: Boolean   // true/false for נתב"ג
)

data class VehicleDetailsData(
    val carType: String,         // e.g. "יונדאי i20"
    val plateNumber: String,     // e.g. "12-345-67"
    val notes: String            // e.g. "רכב חדש, צבע לבן"
)

// ============================================
// Card 1: תקופת השכרה
// ============================================

@Composable
fun ReservationDatesCard(data: ReservationDatesData) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            // כותרת
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.CalendarToday,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(28.dp)
                )
                Spacer(Modifier.width(12.dp))
                Text(
                    text = "תקופת השכרה",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            
            Spacer(Modifier.height(20.dp))
            
            // From date/time
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(
                        text = "מתאריך",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = data.startDate,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }
                
                Column {
                    Text(
                        text = "שעה",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = data.startTime,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            // To date/time
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(
                        text = "עד תאריך",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = data.endDate,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }
                
                Column {
                    Text(
                        text = "שעה",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = data.endTime,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            // Total days badge
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
                ),
                shape = RoundedCornerShape(12.dp)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "סה״כ ימים:",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "${data.totalDays}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
fun PreviewReservationDatesCard() {
    MaterialTheme {
        ReservationDatesCard(
            data = ReservationDatesData(
                startDate = "01/11/2025",
                startTime = "10:00",
                endDate = "05/11/2025",
                endTime = "10:00",
                totalDays = 4
            )
        )
    }
}

// ============================================
// Card 2: פרטים כספיים
// ============================================

@Composable
fun FinancialDetailsCard(data: FinancialDetailsData) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            // כותרת
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.AttachMoney,
                    contentDescription = null,
                    tint = Color(0xFF4CAF50),
                    modifier = Modifier.size(28.dp)
                )
                Spacer(Modifier.width(12.dp))
                Text(
                    text = "פרטים כספיים",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF4CAF50)
                )
            }
            
            Spacer(Modifier.height(20.dp))
            
            // Daily price
            FinancialRow(label = "מחיר יומי", value = "₪${data.dailyPrice}")
            
            Spacer(Modifier.height(12.dp))
            
            // Total price (highlighted)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "סה״כ מחיר",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = "₪${data.totalPrice}",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF4CAF50)
                )
            }
            
            Spacer(Modifier.height(12.dp))
            
            // Deposit
            FinancialRow(label = "מסגרת אשראי נדרשת", value = "₪${data.deposit}")
            
            Spacer(Modifier.height(12.dp))
            
            // KM included
            FinancialRow(label = "ק״מ כלול", value = data.kmIncluded)
            
            Spacer(Modifier.height(16.dp))
            
            // VAT badge
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = if (data.includeVat) 
                        MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.4f)
                    else 
                        MaterialTheme.colorScheme.surfaceVariant
                ),
                shape = RoundedCornerShape(12.dp)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = if (data.includeVat) "כולל מע״מ" else "לא כולל מע״מ",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        color = if (data.includeVat) 
                            MaterialTheme.colorScheme.secondary
                        else 
                            MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun FinancialRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Preview(showBackground = true)
@Composable
fun PreviewFinancialDetailsCard() {
    MaterialTheme {
        FinancialDetailsCard(
            data = FinancialDetailsData(
                dailyPrice = "250",
                totalPrice = "1000",
                deposit = "2000",
                kmIncluded = "250",
                includeVat = true
            )
        )
    }
}

// ============================================
// Card 3: ספק וסניף
// ============================================

@Composable
fun SupplierBranchCard(data: SupplierBranchData) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            // כותרת
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Domain,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.tertiary,
                    modifier = Modifier.size(28.dp)
                )
                Spacer(Modifier.width(12.dp))
                Text(
                    text = "ספק וסניף",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.tertiary
                )
            }
            
            Spacer(Modifier.height(20.dp))
            
            // Supplier
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Domain,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp)
                )
                Column {
                    Text(
                        text = "ספק",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = data.supplierName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            // Branch or Airport
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.LocationOn,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp)
                )
                Column {
                    Text(
                        text = if (data.isAirportMode) "נתב״ג" else "סניף",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = if (data.isAirportMode) "נתב״ג בן גוריון" else data.branchCity,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            // Order number (if exists)
            if (data.orderNumber.isNotBlank()) {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.3f)
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "מספר הזמנה:",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.tertiary
                        )
                        Text(
                            text = data.orderNumber,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.tertiary
                        )
                    }
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
fun PreviewSupplierBranchCard() {
    MaterialTheme {
        SupplierBranchCard(
            data = SupplierBranchData(
                supplierName = "אלדן השכרת רכב",
                branchCity = "תל אביב - דיזנגוף",
                orderNumber = "AB123456",
                isAirportMode = false
            )
        )
    }
}

@Preview(showBackground = true)
@Composable
fun PreviewSupplierBranchCardAirport() {
    MaterialTheme {
        SupplierBranchCard(
            data = SupplierBranchData(
                supplierName = "סיקסט",
                branchCity = "",
                orderNumber = "NTB789",
                isAirportMode = true
            )
        )
    }
}

// ============================================
// Card 4: פרטי רכב
// ============================================

@Composable
fun VehicleDetailsCard(data: VehicleDetailsData) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            // כותרת
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.DirectionsCar,
                    contentDescription = null,
                    tint = Color(0xFF2196F3),
                    modifier = Modifier.size(28.dp)
                )
                Spacer(Modifier.width(12.dp))
                Text(
                    text = "פרטי רכב",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF2196F3)
                )
            }
            
            Spacer(Modifier.height(20.dp))
            
            // Car type
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "סוג רכב",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = data.carType,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            
            if (data.plateNumber.isNotBlank()) {
                Spacer(Modifier.height(12.dp))
                
                // Plate number
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "לוחית רישוי",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = data.plateNumber,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
            
            if (data.notes.isNotBlank()) {
                Spacer(Modifier.height(16.dp))
                
                // Notes
                Column {
                    Text(
                        text = "הערות",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(8.dp))
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                        ),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(
                            text = data.notes,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
fun PreviewVehicleDetailsCard() {
    MaterialTheme {
        VehicleDetailsCard(
            data = VehicleDetailsData(
                carType = "יונדאי i20 אוטומט",
                plateNumber = "12-345-67",
                notes = "רכב חדש, צבע לבן, מצב מצוין. יש GPS ומצלמת רוורס."
            )
        )
    }
}

@Preview(showBackground = true)
@Composable
fun PreviewVehicleDetailsCardMinimal() {
    MaterialTheme {
        VehicleDetailsCard(
            data = VehicleDetailsData(
                carType = "טויוטה יאריס",
                plateNumber = "",
                notes = ""
            )
        )
    }
}

// ============================================
// Full Preview - All Cards Together
// ============================================

@Preview(showBackground = true, heightDp = 1200)
@Composable
fun PreviewAllReservationCards() {
    MaterialTheme {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            ReservationDatesCard(
                data = ReservationDatesData(
                    startDate = "01/11/2025",
                    startTime = "10:00",
                    endDate = "05/11/2025",
                    endTime = "10:00",
                    totalDays = 4
                )
            )
            
            FinancialDetailsCard(
                data = FinancialDetailsData(
                    dailyPrice = "250",
                    totalPrice = "1000",
                    deposit = "2000",
                    kmIncluded = "250",
                    includeVat = true
                )
            )
            
            SupplierBranchCard(
                data = SupplierBranchData(
                    supplierName = "אלדן השכרת רכב",
                    branchCity = "תל אביב - דיזנגוף",
                    orderNumber = "AB123456",
                    isAirportMode = false
                )
            )
            
            VehicleDetailsCard(
                data = VehicleDetailsData(
                    carType = "יונדאי i20 אוטומט",
                    plateNumber = "12-345-67",
                    notes = "רכב חדש, צבע לבן, GPS ומצלמת רוורס"
                )
            )
        }
    }
}

