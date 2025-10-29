package com.rentacar.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.sp
import com.rentacar.app.ui.navigation.AppNavGraph
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import com.rentacar.app.prefs.SettingsStore

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Allow screenshots: remove FLAG_SECURE if present
        window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        setContent {
            AppRoot()
        }
    }
}

val LocalButtonColor = staticCompositionLocalOf { Color(0xFF2196F3) }
val LocalTitleColor = staticCompositionLocalOf { Color(0xFF2196F3) }
val LocalTitleTextColor = staticCompositionLocalOf { Color(0xFFFFFFFF) }
val LocalBackButtonColor = staticCompositionLocalOf { Color(0xFF9E9E9E) }

@Composable
fun AppRoot() {
    val baseTypography = Typography(
        bodyLarge = Typography().bodyLarge.copy(fontSize = 18.sp),
        titleLarge = Typography().titleLarge.copy(fontSize = 22.sp),
        labelLarge = Typography().labelLarge.copy(fontSize = 16.sp)
    )
    val context = LocalContext.current
    val settings = remember { SettingsStore(context) }
    val hex = settings.buttonColor().collectAsState(initial = "#2196F3").value
    val titleHex = settings.titleColor().collectAsState(initial = "#2196F3").value
    val titleTextHex = settings.titleTextColor().collectAsState(initial = "#FFFFFF").value
    val btnColor = remember(hex) { Color(android.graphics.Color.parseColor(hex)) }
    val ttlColor = remember(titleHex) { Color(android.graphics.Color.parseColor(titleHex)) }
    val ttlTextColor = remember(titleTextHex) { Color(android.graphics.Color.parseColor(titleTextHex)) }
    val backHex = settings.backButtonColor().collectAsState(initial = "#9E9E9E").value
    val backColor = remember(backHex) { Color(android.graphics.Color.parseColor(backHex)) }
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        CompositionLocalProvider(LocalButtonColor provides btnColor, LocalTitleColor provides ttlColor, LocalTitleTextColor provides ttlTextColor, LocalBackButtonColor provides backColor) {
            MaterialTheme(typography = baseTypography) {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    AppNavGraph()
                }
            }
        }
    }
}


