package com.rentacar.app.ui.dialogs

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/**
 * Presentation-only single-selection item for [ModernSelectionDialog].
 * Callers map domain entities into this model; keys must be stable.
 */
data class ModernSelectionItem(
    val key: String,
    val title: String,
    val subtitle: String? = null,
    val icon: ImageVector
)

/**
 * Reusable compact Material 3 single-selection dialog.
 *
 * Presentation-focused — no domain/repository dependencies.
 *
 * Default interaction (pilot): tap → [onItemSelected]; caller applies + dismisses.
 * Confirmation-style: set [confirmLabel]/ tap only updates highlight via [onItemSelected];
 * primary button calls [onConfirm].
 */
@Composable
fun ModernSelectionDialog(
    title: String,
    headerIcon: ImageVector,
    items: List<ModernSelectionItem>,
    selectedKey: String?,
    onItemSelected: (String) -> Unit,
    onDismiss: () -> Unit,
    searchEnabled: Boolean = false,
    searchPlaceholder: String = "חיפוש...",
    confirmLabel: String? = null,
    onConfirm: (() -> Unit)? = null,
    cancelLabel: String? = null,
    scrollToSelected: Boolean = false,
    /** Optional custom footer; when set, replaces the default confirm/cancel row. */
    footerContent: (@Composable () -> Unit)? = null
) {
    val shape = RoundedCornerShape(20.dp)
    var query by remember { mutableStateOf("") }
    val filteredItems = remember(items, query, searchEnabled) {
        if (!searchEnabled || query.isBlank()) items
        else {
            val q = query.trim().lowercase()
            items.filter { item ->
                item.title.lowercase().contains(q) ||
                    (item.subtitle?.lowercase()?.contains(q) == true)
            }
        }
    }
    val listState = rememberLazyListState()

    LaunchedEffect(scrollToSelected, selectedKey, filteredItems) {
        if (!scrollToSelected || selectedKey == null) return@LaunchedEffect
        val index = filteredItems.indexOfFirst { it.key == selectedKey }
        if (index >= 0) {
            listState.scrollToItem(index)
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        BoxWithConstraints {
            val listMaxHeight = maxHeight * 0.58f
            Surface(
                modifier = Modifier
                    .fillMaxWidth(0.92f)
                    .widthIn(max = 420.dp),
                shape = shape,
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 3.dp,
                shadowElevation = 6.dp
            ) {
                Column(
                    modifier = Modifier
                        .padding(horizontal = 16.dp, vertical = 14.dp)
                        .selectableGroup()
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = headerIcon,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(22.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = title,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(1f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        IconButton(
                            onClick = onDismiss,
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Close,
                                contentDescription = "סגור",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    if (searchEnabled) {
                        Spacer(modifier = Modifier.size(8.dp))
                        OutlinedTextField(
                            value = query,
                            onValueChange = { query = it },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            placeholder = { Text(searchPlaceholder) },
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Filled.Search,
                                    contentDescription = null
                                )
                            },
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search)
                        )
                    }

                    Spacer(modifier = Modifier.size(10.dp))

                    LazyColumn(
                        state = listState,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = listMaxHeight),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(filteredItems, key = { it.key }) { item ->
                            ModernSelectionOptionRow(
                                item = item,
                                selected = item.key == selectedKey,
                                onClick = { onItemSelected(item.key) }
                            )
                        }
                    }

                    if (footerContent != null) {
                        Spacer(modifier = Modifier.size(12.dp))
                        footerContent()
                    } else if (confirmLabel != null && onConfirm != null) {
                        Spacer(modifier = Modifier.size(12.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            if (cancelLabel != null) {
                                TextButton(onClick = onDismiss) {
                                    Text(cancelLabel)
                                }
                                Spacer(modifier = Modifier.width(4.dp))
                            }
                            Button(
                                onClick = onConfirm,
                                enabled = selectedKey != null
                            ) {
                                Text(confirmLabel)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ModernSelectionOptionRow(
    item: ModernSelectionItem,
    selected: Boolean,
    onClick: () -> Unit
) {
    val shape = RoundedCornerShape(16.dp)
    val borderColor = if (selected) {
        MaterialTheme.colorScheme.primary
    } else {
        MaterialTheme.colorScheme.outlineVariant
    }
    val containerColor = if (selected) {
        MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.55f)
    } else {
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
    }
    val iconTint = if (selected) {
        MaterialTheme.colorScheme.primary
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .border(width = if (selected) 1.5.dp else 1.dp, color = borderColor, shape = shape)
            .selectable(
                selected = selected,
                onClick = onClick,
                role = Role.RadioButton
            ),
        shape = shape,
        color = containerColor
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            RadioButton(
                selected = selected,
                onClick = null
            )
            Spacer(modifier = Modifier.width(4.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (!item.subtitle.isNullOrBlank()) {
                    Text(
                        text = item.subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            Spacer(modifier = Modifier.width(8.dp))
            Icon(
                imageVector = item.icon,
                contentDescription = null,
                tint = iconTint,
                modifier = Modifier.size(22.dp)
            )
        }
    }
}
