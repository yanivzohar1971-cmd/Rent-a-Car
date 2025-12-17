package com.rentacar.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Domain
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun CustomerCard(
    customer: com.rentacar.app.data.Customer,
    isSelected: Boolean,
    onClick: () -> Unit,
    onCallClick: () -> Unit
) {
    val cardColor = Color(0xFF9C27B0) // Purple for customers
    
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
            
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(vertical = 12.dp, horizontal = 4.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "${customer.firstName} ${customer.lastName}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f)
                    )
                    
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
                            text = customer.phone ?: "—",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    
                    if (isSelected && !customer.phone.isNullOrBlank()) {
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
                
                if (!customer.tzId.isNullOrBlank()) {
                    Text(
                        text = "ת.ז: ${customer.tzId}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            
            Spacer(Modifier.width(8.dp))
        }
    }
}


@Composable
fun SupplierCard(
    supplier: com.rentacar.app.data.Supplier,
    isSelected: Boolean,
    onClick: () -> Unit,
    onCallClick: () -> Unit,
    priceListsCount: Int = 0,
    onPriceListsClick: (() -> Unit)? = null
) {
    val cardColor = Color(0xFFFF9800) // Orange for suppliers
    
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
            
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(vertical = 12.dp, horizontal = 4.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = supplier.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f)
                    )
                    
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .background(cardColor, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Domain,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
                
                Spacer(Modifier.height(1.5.dp))
                
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
                            text = supplier.phone ?: "—",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    
                    if (isSelected) {
                        // Determine icon tint: blue when price lists exist, salmon when none
                        val priceListIconTint = if (priceListsCount > 0) {
                            Color(0xFF2196F3) // Blue - existing color when price lists exist
                        } else {
                            Color(0xFFFFA07A) // Salmon - soft attention color when no price lists
                        }
                        
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            if (!supplier.phone.isNullOrBlank()) {
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
                            if (onPriceListsClick != null) {
                                IconButton(
                                    onClick = onPriceListsClick,
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.AutoMirrored.Filled.List,
                                        contentDescription = "מחירונים",
                                        tint = priceListIconTint,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
            
            Spacer(Modifier.width(8.dp))
        }
    }
}

@Composable
fun BranchCard(
    branch: com.rentacar.app.data.Branch,
    isSelected: Boolean,
    onClick: () -> Unit,
    onCallClick: (() -> Unit)?
) {
    val cardColor = Color(0xFF009688) // Teal for branches
    
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
            
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(vertical = 12.dp, horizontal = 4.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = branch.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f)
                    )
                    
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .background(cardColor, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.LocationOn,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
                
                Spacer(Modifier.height(1.5.dp))
                
                if (!branch.city.isNullOrBlank()) {
                    Text(
                        text = branch.city ?: "",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                
                Spacer(Modifier.height(1.5.dp))
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (!branch.street.isNullOrBlank()) {
                        Text(
                            text = branch.street ?: "",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f)
                        )
                    }
                    
                    if (isSelected && onCallClick != null && !branch.phone.isNullOrBlank()) {
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
            }
            
            Spacer(Modifier.width(8.dp))
        }
    }
}

