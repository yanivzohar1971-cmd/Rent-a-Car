package com.rentacar.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rentacar.app.LocalTitleTextColor
import androidx.compose.runtime.Immutable
import com.rentacar.app.prefs.SettingsStore
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember

@Composable
fun TitleBar(
    title: String,
    color: Color,
    onSettingsClick: (() -> Unit)? = null,
    onHomeClick: (() -> Unit)? = null,
    startIcon: ImageVector? = null,
    onStartClick: (() -> Unit)? = null,
    placeStartIconAtLeft: Boolean = false,
    startIconContent: (@Composable (() -> Unit))? = null,
    startPlainContent: (@Composable (() -> Unit))? = null,
    homeAtEnd: Boolean = false,
    endPlainContent: (@Composable (() -> Unit))? = null
) {
    val context = LocalContext.current
    val settings = remember { SettingsStore(context) }
    val circleEnabled = settings.titleIconCircleEnabled().collectAsState(initial = false).value
    val circleHex = settings.titleIconCircleColor().collectAsState(initial = "#33000000").value
    val circleColor = Color(android.graphics.Color.parseColor(circleHex))
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(color)
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(title, color = LocalTitleTextColor.current, fontSize = 20.sp, textAlign = TextAlign.Center)
        if (startPlainContent != null) {
            val layoutDir = LocalLayoutDirection.current
            val startAlignment = if (placeStartIconAtLeft) {
                if (layoutDir == LayoutDirection.Ltr) Alignment.CenterStart else Alignment.CenterEnd
            } else Alignment.CenterStart
            androidx.compose.foundation.layout.Box(modifier = Modifier.align(startAlignment)) {
                startPlainContent()
            }
        }
        if ((startIcon != null || startIconContent != null) && onStartClick != null) {
            val layoutDir = LocalLayoutDirection.current
            val startAlignment = if (placeStartIconAtLeft) {
                if (layoutDir == LayoutDirection.Ltr) Alignment.CenterStart else Alignment.CenterEnd
            } else Alignment.CenterStart
            IconButton(onClick = onStartClick, modifier = Modifier.align(startAlignment)) {
                if (circleEnabled) {
                    androidx.compose.foundation.layout.Box(
                        modifier = Modifier.size(40.dp).background(circleColor, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        if (startIconContent != null) startIconContent() else if (startIcon != null) Icon(imageVector = startIcon, contentDescription = null, tint = LocalTitleTextColor.current)
                    }
                } else {
                    if (startIconContent != null) {
                        startIconContent()
                    } else if (startIcon != null) {
                        Icon(imageVector = startIcon, contentDescription = null, tint = LocalTitleTextColor.current)
                    }
                }
            }
        }
        if (onSettingsClick != null || endPlainContent != null) {
            androidx.compose.runtime.CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                androidx.compose.foundation.layout.Row(
                    modifier = Modifier.align(Alignment.CenterEnd),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Logo/content at the far right (visual right due to LTR scope)
                    if (endPlainContent != null) {
                        endPlainContent()
                    }
                    // Settings button to the left of the logo/content
                    if (onSettingsClick != null) {
                        IconButton(onClick = onSettingsClick) {
                            if (circleEnabled) {
                                androidx.compose.foundation.layout.Box(
                                    modifier = Modifier.size(44.dp).background(circleColor, CircleShape),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(imageVector = Icons.Filled.Settings, contentDescription = "הגדרות", tint = LocalTitleTextColor.current)
                                }
                            } else {
                                Icon(imageVector = Icons.Filled.Settings, contentDescription = "הגדרות", tint = LocalTitleTextColor.current)
                            }
                        }
                    }
                }
            }
        }
        if (onHomeClick != null) {
            // Align Home button to the visual right, similar to settings, regardless of RTL
            val homeAlignment = Alignment.CenterEnd
            IconButton(onClick = onHomeClick, modifier = Modifier.align(homeAlignment)) {
                if (circleEnabled) {
                    androidx.compose.foundation.layout.Box(
                        modifier = Modifier.size(44.dp).background(circleColor, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(imageVector = Icons.Filled.Home, contentDescription = "בית", tint = LocalTitleTextColor.current)
                    }
                } else {
                    Icon(imageVector = Icons.Filled.Home, contentDescription = "בית", tint = LocalTitleTextColor.current)
                }
            }
        }
    }
}


