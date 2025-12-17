package com.rentacar.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.input.pointer.pointerInput
import com.rentacar.app.prefs.SettingsStore
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.filled.Check

data class ListItemModel(
    val id: Long? = null,
    val title: String,
    val subtitle: String? = null,
    val meta: String? = null,
    val icon: ImageVector? = null,
    val iconTint: Color? = null
)

@Composable
fun ListRow(
    item: ListItemModel,
    isSelected: Boolean = false,
    onClick: () -> Unit,
    onDoubleClick: (() -> Unit)? = null
) {
    val context = LocalContext.current
    val store = remember { SettingsStore(context) }
    val privateHex = store.customerPrivateColor().collectAsState(initial = "#2196F3").value
    val companyHex = store.customerCompanyColor().collectAsState(initial = "#4CAF50").value
    val defaultTint = MaterialTheme.colorScheme.primary
    val resolvedTint = item.iconTint ?: defaultTint
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .pointerInput(Unit) {
                detectTapGestures(
                    onDoubleTap = { onDoubleClick?.invoke() },
                    onTap = { onClick() }
                )
            }
            .then(
                if (isSelected) Modifier
                    .background(Color(0x1A4CAF50), RoundedCornerShape(8.dp))
                    .border(1.dp, Color(0xFF4CAF50), RoundedCornerShape(8.dp))
                else Modifier
            )
            .padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Icon(
            imageVector = item.icon ?: Icons.AutoMirrored.Filled.List,
            contentDescription = null,
            modifier = Modifier.size(28.dp),
            tint = resolvedTint
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(item.title, style = MaterialTheme.typography.titleMedium)
            item.subtitle?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
        }
        if (isSelected) {
            Icon(imageVector = androidx.compose.material.icons.Icons.Filled.Check, contentDescription = "נבחר", tint = Color(0xFF4CAF50))
        }
        item.meta?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
    }
}

@Composable
fun StandardList(
    items: List<ListItemModel>,
    onItemClick: (ListItemModel) -> Unit,
    onItemDoubleClick: ((ListItemModel) -> Unit)? = null,
    modifier: Modifier = Modifier,
    isSelected: ((ListItemModel) -> Boolean)? = null
) {
    LazyColumn(modifier = modifier) {
        items(items, key = { item -> item.id ?: (item.title + (item.subtitle ?: "")).hashCode().toLong() }) { item ->
            val selected = isSelected?.invoke(item) == true
            ListRow(
                item = item,
                isSelected = selected,
                onClick = { onItemClick(item) },
                onDoubleClick = onItemDoubleClick?.let { { it(item) } }
            )
        }
    }
}


