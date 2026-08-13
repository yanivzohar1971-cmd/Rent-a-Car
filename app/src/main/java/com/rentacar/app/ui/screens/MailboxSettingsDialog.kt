package com.rentacar.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import com.rentacar.app.emailimport.EmailAddressNormalizer
import com.rentacar.app.mailbox.GmailImapMailboxClient
import com.rentacar.app.mailbox.MailboxConnectionResult
import com.rentacar.app.mailbox.MailboxCredentials
import com.rentacar.app.mailbox.SecureMailboxCredentialsStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun MailboxSettingsDialog(
    visible: Boolean,
    onDismiss: () -> Unit
) {
    if (!visible) return
    val context = LocalContext.current
    val store = remember { SecureMailboxCredentialsStore(context) }
    val existing = remember { store.load() }
    var email by remember { mutableStateOf(existing?.emailAddress.orEmpty()) }
    var appPassword by remember { mutableStateOf("") }
    var status by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val client = remember { GmailImapMailboxClient() }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("תיבת מייל לדוחות עמלות") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "חיבור Gmail אחד לכל האפליקציה (IMAP + סיסמת אפליקציה). " +
                        "כתובות השולחים מוגדרות לכל ספק בנפרד.",
                    style = MaterialTheme.typography.bodySmall
                )
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it.trim() },
                    label = { Text("כתובת Gmail") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    textStyle = TextStyle(textDirection = TextDirection.Ltr),
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = appPassword,
                    onValueChange = { appPassword = it.filter { ch -> !ch.isWhitespace() } },
                    label = {
                        Text(
                            if (existing != null && appPassword.isBlank()) {
                                "סיסמת אפליקציה (שמורה — הזן לשינוי)"
                            } else {
                                "סיסמת אפליקציה של Google"
                            }
                        )
                    },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    textStyle = TextStyle(textDirection = TextDirection.Ltr),
                    modifier = Modifier.fillMaxWidth()
                )
                if (busy) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(modifier = Modifier.height(18.dp), strokeWidth = 2.dp)
                        Spacer(modifier = Modifier.padding(4.dp))
                        Text("בודק חיבור…")
                    }
                }
                status?.let {
                    Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    enabled = !busy,
                    onClick = {
                        scope.launch {
                            busy = true
                            status = null
                            val password = appPassword.ifBlank { existing?.appPassword.orEmpty() }
                            val result = withContext(Dispatchers.IO) {
                                if (!EmailAddressNormalizer.isSyntacticallyValid(email)) {
                                    MailboxConnectionResult.Failure(
                                        com.rentacar.app.mailbox.MailboxError.INVALID_ACCOUNT
                                    )
                                } else if (password.isBlank()) {
                                    MailboxConnectionResult.Failure(
                                        com.rentacar.app.mailbox.MailboxError.INVALID_APP_PASSWORD
                                    )
                                } else {
                                    client.testConnection(
                                        MailboxCredentials(emailAddress = email, appPassword = password)
                                    )
                                }
                            }
                            status = when (result) {
                                is MailboxConnectionResult.Success -> "החיבור הצליח"
                                is MailboxConnectionResult.Failure -> result.error.hebrewMessage()
                            }
                            busy = false
                        }
                    }
                ) { Text("בדיקת חיבור") }
                Button(
                    enabled = !busy,
                    onClick = {
                        val password = appPassword.ifBlank { existing?.appPassword.orEmpty() }
                        if (!EmailAddressNormalizer.isSyntacticallyValid(email)) {
                            status = "כתובת Gmail אינה תקינה"
                            return@Button
                        }
                        if (password.isBlank()) {
                            status = "יש להזין סיסמת אפליקציה"
                            return@Button
                        }
                        store.save(MailboxCredentials(emailAddress = email, appPassword = password))
                        appPassword = ""
                        status = "נשמר בהצלחה"
                        onDismiss()
                    }
                ) { Text("שמור") }
            }
        },
        dismissButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(
                    enabled = !busy,
                    onClick = {
                        store.clear()
                        email = ""
                        appPassword = ""
                        status = "הפרטים נמחקו"
                    }
                ) { Text("נקה") }
                TextButton(onClick = onDismiss, enabled = !busy) { Text("סגור") }
            }
        }
    )
}
