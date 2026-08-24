package com.rentacar.app.ui.screens

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.rentacar.app.LocalButtonColor
import com.rentacar.app.LocalTitleColor
import com.rentacar.app.share.ShareLanguage
import com.rentacar.app.share.TemplateVariableRegistry
import com.rentacar.app.share.TermColorPalette
import com.rentacar.app.ui.components.AppButton
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.ui.dialogs.ModernSelectionDialog
import com.rentacar.app.ui.share.TemplateVariableSelection
import com.rentacar.app.ui.vm.SupplierCustomerTermsViewModel
import com.rentacar.app.ui.vm.TermEditorItem

private data class VariableInsertRequest(
    val termId: String,
    val selectionStart: Int,
    val selectionEnd: Int
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SupplierCustomerTermsScreen(
    navController: NavHostController,
    vm: SupplierCustomerTermsViewModel
) {
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    var fieldValues by remember { mutableStateOf<Map<String, TextFieldValue>>(emptyMap()) }
    var insertRequest by remember { mutableStateOf<VariableInsertRequest?>(null) }
    var refocusTermId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(state.terms.map { it.localId to it.text to it.selectionStart to it.selectionEnd }) {
        fieldValues = state.terms.associate { term ->
            val existing = fieldValues[term.localId]
            val nextValue = if (existing != null && existing.text == term.text) {
                existing
            } else {
                TextFieldValue(
                    text = term.text,
                    selection = TextRange(
                        term.selectionStart.coerceIn(0, term.text.length),
                        term.selectionEnd.coerceIn(0, term.text.length)
                    )
                )
            }
            term.localId to nextValue
        }
    }

    LaunchedEffect(state.saveSucceeded) {
        if (state.saveSucceeded) {
            Toast.makeText(context, "התנאים נשמרו", Toast.LENGTH_SHORT).show()
            vm.consumeSaveSucceeded()
        }
    }

    BackHandler(enabled = true) {
        if (!vm.requestBack()) {
            navController.popBackStack()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState())
    ) {
        TitleBar(
            title = "תנאי הזמנה ללקוח",
            color = LocalTitleColor.current,
            onHomeClick = {
                if (!vm.requestBack()) navController.popBackStack()
            }
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = state.supplierName.ifBlank { "ספק #${state.supplierId}" },
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = if (state.customized) "מותאם אישית" else "ברירת מחדל (לא נשמר עד שמירה)",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(12.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            AppButton(
                onClick = { vm.selectLanguage(ShareLanguage.HE) },
                containerColor = if (state.language == ShareLanguage.HE) LocalButtonColor.current else Color(0xFFBDBDBD)
            ) { Text("עברית") }
            AppButton(
                onClick = { vm.selectLanguage(ShareLanguage.EN) },
                containerColor = if (state.language == ShareLanguage.EN) LocalButtonColor.current else Color(0xFFBDBDBD)
            ) { Text("English") }
        }
        Spacer(Modifier.height(12.dp))

        var visibleNumber = 0
        state.terms.forEachIndexed { index, term ->
            if (term.enabled && term.text.isNotBlank()) visibleNumber++
            TermEditorCard(
                index = index,
                displayNumber = if (term.enabled && term.text.isNotBlank()) visibleNumber else null,
                term = term,
                language = state.language,
                value = fieldValues[term.localId] ?: TextFieldValue(term.text),
                requestFocus = refocusTermId == term.localId,
                onFocusConsumed = { if (refocusTermId == term.localId) refocusTermId = null },
                onValueChange = { next ->
                    fieldValues = fieldValues + (term.localId to next)
                    vm.updateTermText(term.localId, next.text, next.selection.start, next.selection.end)
                },
                onFocus = { },
                onInsertField = { selection ->
                    insertRequest = VariableInsertRequest(
                        termId = term.localId,
                        selectionStart = selection.min,
                        selectionEnd = selection.max
                    )
                },
                onEnabled = { vm.updateTermEnabled(term.localId, it) },
                onBold = { vm.updateTermBold(term.localId, it) },
                onColor = { vm.updateTermColor(term.localId, it) },
                onMoveUp = { vm.moveUp(term.localId) },
                onMoveDown = { vm.moveDown(term.localId) },
                onDelete = { vm.deleteTerm(term.localId) },
                canMoveUp = index > 0,
                canMoveDown = index < state.terms.lastIndex
            )
            Spacer(Modifier.height(8.dp))
        }

        state.validationMessage?.let {
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
        }

        val compactPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp)
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                AppButton(
                    onClick = { vm.addTerm() },
                    modifier = Modifier
                        .weight(1.15f)
                        .defaultMinSize(minHeight = 40.dp),
                    contentPadding = compactPadding
                ) {
                    Text(
                        text = if (state.language == ShareLanguage.HE) "הוסף תנאי" else "Add Term",
                        maxLines = 1,
                        softWrap = false,
                        fontSize = 13.sp
                    )
                }
                AppButton(
                    onClick = { vm.requestReset() },
                    modifier = Modifier
                        .weight(0.8f)
                        .defaultMinSize(minHeight = 40.dp),
                    containerColor = Color(0xFFBDBDBD),
                    contentPadding = compactPadding
                ) {
                    Text(
                        text = if (state.language == ShareLanguage.HE) "איפוס" else "Reset",
                        maxLines = 1,
                        softWrap = false,
                        fontSize = 13.sp
                    )
                }
                AppButton(
                    onClick = { vm.save() },
                    enabled = !state.isSaving,
                    modifier = Modifier
                        .weight(1f)
                        .defaultMinSize(minHeight = 40.dp),
                    contentPadding = compactPadding
                ) {
                    Text(
                        text = if (state.language == ShareLanguage.HE) "שמור" else "Save",
                        maxLines = 1,
                        softWrap = false,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }

    insertRequest?.let { request ->
        ModernSelectionDialog(
            title = TemplateVariableSelection.dialogTitle(state.language),
            headerIcon = TemplateVariableSelection.headerIcon,
            items = TemplateVariableSelection.items(state.language),
            selectedKey = null,
            onItemSelected = { key ->
                TemplateVariableRegistry.find(key)?.let { variable ->
                    vm.insertVariable(
                        request.termId,
                        variable,
                        request.selectionStart,
                        request.selectionEnd
                    )
                }
                insertRequest = null
                refocusTermId = request.termId
            },
            onDismiss = { insertRequest = null }
        )
    }

    if (state.showResetConfirm) {
        AlertDialog(
            onDismissRequest = { vm.cancelReset() },
            title = { Text("איפוס לברירת מחדל") },
            text = { Text("התאמה אישית לשפה זו תימחק. חמשת התנאים המקוריים יוצגו שוב.") },
            confirmButton = { AppButton(onClick = { vm.confirmReset() }) { Text("אפס") } },
            dismissButton = { AppButton(onClick = { vm.cancelReset() }) { Text("בטל") } }
        )
    }
    if (state.showDiscardConfirm) {
        AlertDialog(
            onDismissRequest = { vm.cancelDiscard() },
            title = { Text("לצאת בלי לשמור?") },
            text = { Text("יש שינויים שלא נשמרו. הם יאבדו.") },
            confirmButton = {
                AppButton(onClick = {
                    val leavingScreen = state.pendingLanguage == null
                    vm.confirmDiscard()
                    if (leavingScreen) navController.popBackStack()
                }) { Text("בטל שינויים") }
            },
            dismissButton = { AppButton(onClick = { vm.cancelDiscard() }) { Text("המשך לערוך") } }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun TermEditorCard(
    index: Int,
    displayNumber: Int?,
    term: TermEditorItem,
    language: ShareLanguage,
    value: TextFieldValue,
    requestFocus: Boolean,
    onFocusConsumed: () -> Unit,
    onValueChange: (TextFieldValue) -> Unit,
    onFocus: () -> Unit,
    onInsertField: (TextRange) -> Unit,
    onEnabled: (Boolean) -> Unit,
    onBold: (Boolean) -> Unit,
    onColor: (Int?) -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
    onDelete: () -> Unit,
    canMoveUp: Boolean,
    canMoveDown: Boolean
) {
    val focusRequester = remember(term.localId) { FocusRequester() }
    val interactionSource = remember(term.localId) { MutableInteractionSource() }
    var focused by remember(term.localId) { mutableStateOf(false) }
    var selectionWhileFocused by remember(term.localId) { mutableStateOf(value.selection) }
    val colors = OutlinedTextFieldDefaults.colors()
    val textStyle = MaterialTheme.typography.bodyLarge.merge(
        TextStyle(color = MaterialTheme.colorScheme.onSurface)
    )
    val insertLabel = TemplateVariableSelection.insertActionLabel(language)
    val insertHint = TemplateVariableSelection.insertHint(language)

    LaunchedEffect(requestFocus) {
        if (requestFocus) {
            runCatching { focusRequester.requestFocus() }
            onFocusConsumed()
        }
    }
    LaunchedEffect(value.text, value.selection) {
        if (focused || requestFocus) {
            selectionWhileFocused = value.selection
        }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = displayNumber?.let { "$it." } ?: "—",
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.width(28.dp)
                )
                Text("תנאי ${index + 1}", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                IconButton(onClick = onMoveUp, enabled = canMoveUp) {
                    Icon(Icons.Filled.ArrowUpward, contentDescription = "העבר למעלה")
                }
                IconButton(onClick = onMoveDown, enabled = canMoveDown) {
                    Icon(Icons.Filled.ArrowDownward, contentDescription = "העבר למטה")
                }
                IconButton(onClick = onDelete) {
                    Icon(Icons.Filled.Delete, contentDescription = "מחק")
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top
            ) {
                BasicTextField(
                    value = value,
                    onValueChange = { next ->
                        if (focused) selectionWhileFocused = next.selection
                        onValueChange(next)
                    },
                    modifier = Modifier
                        .weight(1f)
                        .focusRequester(focusRequester)
                        .onFocusChanged { focusState ->
                            focused = focusState.isFocused
                            if (focusState.isFocused) onFocus()
                        },
                    textStyle = textStyle,
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                    minLines = 3,
                    maxLines = 8,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                    interactionSource = interactionSource,
                    decorationBox = { innerTextField ->
                        OutlinedTextFieldDefaults.DecorationBox(
                            value = value.text,
                            innerTextField = innerTextField,
                            enabled = true,
                            singleLine = false,
                            visualTransformation = VisualTransformation.None,
                            interactionSource = interactionSource,
                            supportingText = {
                                Text(insertHint)
                            },
                            colors = colors
                        )
                    }
                )
                IconButton(
                    onClick = { onInsertField(selectionWhileFocused) }
                ) {
                    Icon(
                        imageVector = TemplateVariableSelection.insertActionIcon,
                        contentDescription = insertLabel,
                        tint = if (focused) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        }
                    )
                }
            }
            val usedTokens = TemplateVariableRegistry.ALL.filter { variable ->
                term.text.contains(variable.wrappedToken)
            }
            if (usedTokens.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    usedTokens.forEach { variable ->
                        Text(
                            text = variable.displayName(language),
                            color = MaterialTheme.colorScheme.primary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier
                                .background(
                                    MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                                    RoundedCornerShape(8.dp)
                                )
                                .padding(horizontal = 8.dp, vertical = 2.dp)
                        )
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Switch(checked = term.enabled, onCheckedChange = onEnabled)
                Text("פעיל", modifier = Modifier.padding(start = 4.dp))
                Spacer(Modifier.width(12.dp))
                Switch(checked = term.bold, onCheckedChange = onBold)
                Text("מודגש", modifier = Modifier.padding(start = 4.dp))
            }
            Spacer(Modifier.height(8.dp))
            Text("צבע", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(4.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                TermColorPalette.SWATCHES.forEach { swatch ->
                    TermColorSwatch(
                        swatch = swatch,
                        selected = term.textColorArgb == swatch.argb,
                        onClick = { onColor(swatch.argb) }
                    )
                }
            }
        }
    }
}

@Composable
private fun TermColorSwatch(
    swatch: TermColorPalette.Swatch,
    selected: Boolean,
    onClick: () -> Unit
) {
    val fill = swatch.argb?.let { Color(it) } ?: Color.White
    val checkTint = if (fill.luminance() > 0.45f) Color.Black else Color.White
    val ringColor = if (selected) {
        MaterialTheme.colorScheme.onSurface
    } else {
        Color.Gray
    }
    Box(
        modifier = Modifier.size(44.dp),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .size(if (selected) 36.dp else 28.dp)
                .background(fill, CircleShape)
                .border(
                    width = if (selected) 4.dp else 1.dp,
                    color = ringColor,
                    shape = CircleShape
                )
                .clickable { onClick() },
            contentAlignment = Alignment.Center
        ) {
            when {
                selected && swatch.argb != null -> {
                    Icon(
                        imageVector = Icons.Filled.Check,
                        contentDescription = swatch.labelHe,
                        tint = checkTint,
                        modifier = Modifier.size(16.dp)
                    )
                }
                swatch.argb == null -> {
                    Text("A", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.Black)
                }
            }
        }
        if (selected && swatch.argb == null) {
            Icon(
                imageVector = Icons.Filled.Check,
                contentDescription = swatch.labelHe,
                tint = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(16.dp)
                    .background(MaterialTheme.colorScheme.surface, CircleShape)
                    .padding(1.dp)
            )
        }
    }
}
