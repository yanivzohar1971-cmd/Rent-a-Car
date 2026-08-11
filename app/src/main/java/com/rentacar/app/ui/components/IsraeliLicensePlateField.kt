package com.rentacar.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val PlateYellow = Color(0xFFF7D117)
private val PlateBorder = Color(0xFF1A1A1A)
private val PlateDigits = Color(0xFF111111)
private val PlateBlueStrip = Color(0xFF1E3A8A)
private val PlateIlText = Color(0xFFFFFFFF)
private val PlatePlaceholder = Color(0xFF6B6B6B)

private val PlateShape = RoundedCornerShape(10.dp)

/**
 * Editable Israeli-style yellow license-plate control.
 * [value] / [onValueChange] use raw digits only (no hyphens).
 */
@Composable
fun IsraeliLicensePlateField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    isError: Boolean = false,
    errorText: String? = null,
    supportingText: String = "6–9 ספרות",
    label: String = "מספר רישוי",
    imeAction: ImeAction = ImeAction.Next,
    keyboardActions: KeyboardActions = KeyboardActions.Default
) {
    val focusRequester = remember { FocusRequester() }
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    val borderWidth = if (isFocused || isError) 2.5.dp else 2.dp
    val borderColor = when {
        isError -> MaterialTheme.colorScheme.error
        else -> PlateBorder
    }

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(bottom = 6.dp)
        )

        // Force LTR so the blue IL strip stays physically on the LEFT in an RTL screen.
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp)
                    .clip(PlateShape)
                    .background(PlateYellow, PlateShape)
                    .border(borderWidth, borderColor, PlateShape)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null
                    ) { focusRequester.requestFocus() }
                    .semantics(mergeDescendants = true) {
                        contentDescription = label
                    }
                    .padding(end = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .width(36.dp)
                        .fillMaxHeight()
                        .background(PlateBlueStrip),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "★",
                            color = PlateIlText,
                            fontSize = 10.sp,
                            modifier = Modifier.semantics { contentDescription = "" }
                        )
                        Text(
                            text = "IL",
                            color = PlateIlText,
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp,
                            modifier = Modifier.semantics { contentDescription = "" }
                        )
                    }
                }

                Spacer(modifier = Modifier.width(10.dp))

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight(),
                    contentAlignment = Alignment.Center
                ) {
                    BasicTextField(
                        value = value,
                        onValueChange = onValueChange,
                        modifier = Modifier
                            .fillMaxWidth()
                            .focusRequester(focusRequester),
                        singleLine = true,
                        textStyle = TextStyle(
                            color = PlateDigits,
                            fontSize = 26.sp,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center,
                            textDirection = TextDirection.Ltr,
                            letterSpacing = 1.sp
                        ),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Number,
                            imeAction = imeAction
                        ),
                        keyboardActions = keyboardActions,
                        cursorBrush = SolidColor(PlateDigits),
                        visualTransformation = IsraeliLicensePlateVisualTransformation,
                        interactionSource = interactionSource,
                        decorationBox = { innerTextField ->
                            Box(
                                modifier = Modifier.fillMaxWidth(),
                                contentAlignment = Alignment.Center
                            ) {
                                if (value.isEmpty()) {
                                    Text(
                                        text = "6–9 ספרות",
                                        color = PlatePlaceholder,
                                        fontSize = 18.sp,
                                        fontWeight = FontWeight.Medium,
                                        textAlign = TextAlign.Center
                                    )
                                }
                                innerTextField()
                            }
                        }
                    )
                }
            }
        }

        val helper = when {
            isError && !errorText.isNullOrBlank() -> errorText
            else -> supportingText
        }
        Text(
            text = helper,
            style = MaterialTheme.typography.bodySmall,
            color = if (isError) {
                MaterialTheme.colorScheme.error
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
            modifier = Modifier.padding(start = 4.dp, top = 4.dp)
        )
    }
}

private object IsraeliLicensePlateVisualTransformation : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val raw = text.text
        val formatted = IsraeliLicensePlateFormatting.formatDisplay(raw)
        val separators = IsraeliLicensePlateFormatting.separatorAfterIndices(raw.length)

        val mapping = object : OffsetMapping {
            override fun originalToTransformed(offset: Int): Int {
                if (separators.isEmpty()) return offset.coerceIn(0, formatted.length)
                var transformed = offset
                for (sep in separators) {
                    if (offset >= sep) transformed++
                }
                return transformed.coerceIn(0, formatted.length)
            }

            override fun transformedToOriginal(offset: Int): Int {
                if (separators.isEmpty()) return offset.coerceIn(0, raw.length)
                var original = offset
                separators.forEachIndexed { index, sep ->
                    val hyphenTransformedIndex = sep + index
                    if (offset > hyphenTransformedIndex) original--
                }
                return original.coerceIn(0, raw.length)
            }
        }
        return TransformedText(AnnotatedString(formatted), mapping)
    }
}
