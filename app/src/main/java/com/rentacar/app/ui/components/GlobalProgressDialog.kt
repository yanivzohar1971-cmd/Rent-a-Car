package com.rentacar.app.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog

/**
 * A reusable modal progress dialog component that can be used across all screens
 * to show blocking progress indicators for long-running operations.
 *
 * @param visible Controls whether the dialog is shown
 * @param message The message to display below the progress indicator
 * @param dismissOnBack Whether the dialog can be dismissed by pressing back (default: false)
 * @param dismissOnClickOutside Whether the dialog can be dismissed by clicking outside (default: false)
 * @param onDismissRequest Optional callback when the dialog is dismissed
 */
@Composable
fun GlobalProgressDialog(
    visible: Boolean,
    message: String,
    dismissOnBack: Boolean = false,
    dismissOnClickOutside: Boolean = false,
    onDismissRequest: (() -> Unit)? = null
) {
    if (!visible) return

    Dialog(
        onDismissRequest = {
            if (dismissOnBack || dismissOnClickOutside) {
                onDismissRequest?.invoke()
            }
        }
    ) {
        Surface(
            shape = MaterialTheme.shapes.medium,
            tonalElevation = 8.dp
        ) {
            Column(
                modifier = Modifier
                    .padding(horizontal = 24.dp, vertical = 20.dp)
                    .widthIn(min = 220.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                CircularProgressIndicator(
                    modifier = Modifier
                        .size(32.dp)
                        .padding(bottom = 16.dp)
                )
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

