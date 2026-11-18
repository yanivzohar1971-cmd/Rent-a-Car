package com.rentacar.app.ui.screens.agentapi

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.rentacar.app.LocalTitleColor
import com.rentacar.app.agentapi.production.PairedClientState
import com.rentacar.app.agentapi.production.ProductionAgentRuntime
import com.rentacar.app.agentapi.transport.ConnectivityState
import com.rentacar.app.ui.components.AppButton
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.ui.navigation.Routes
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

const val CLAUDE_AGENT_CONNECTION_TITLE = "Claude AI — חיבור ושליטה"

/**
 * Connection diagnostics for the Claude Agent API (read-only status + revoke access).
 *
 * The screen never starts a gateway or listener; it renders [ClaudeAgentDiagnosticUiState].
 * Route: [AgentApiRoutes.CLAUDE_AGENT_CONNECTION].
 */
@Composable
fun ClaudeAgentConnectionScreen(
    navController: NavHostController,
    vm: ClaudeAgentConnectionViewModel = run {
        val context = LocalContext.current
        viewModel(factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                val access = ProductionAgentRuntime.get(context)?.let(::RuntimeAccessControl)
                return ClaudeAgentConnectionViewModel(access = access) as T
            }
        })
    }
) {
    val state by vm.state.collectAsState()
    ClaudeAgentConnectionContent(
        state = state,
        onRefresh = vm::refresh,
        onRevokeConfirmed = vm::revokeAccess,
        onDismissRevokeResult = vm::dismissRevokeResult,
        onHomeClick = { navController.navigate(Routes.Dashboard) },
        onAccessToggle = vm::setAccessEnabled,
        onStartPairing = vm::startPairing,
        onRevokeClient = vm::revokeClient
    )
}

/** Stateless content (previewable / unit-testable without a ViewModel). */
@Composable
fun ClaudeAgentConnectionContent(
    state: ClaudeAgentDiagnosticUiState,
    onRefresh: () -> Unit,
    onRevokeConfirmed: () -> Unit,
    onDismissRevokeResult: () -> Unit,
    onHomeClick: (() -> Unit)? = null,
    onAccessToggle: (Boolean) -> Unit = {},
    onStartPairing: () -> Unit = {},
    onRevokeClient: (String) -> Unit = {}
) {
    var confirmRevoke by remember { mutableStateOf(false) }

    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
        ) {
            TitleBar(
                title = CLAUDE_AGENT_CONNECTION_TITLE,
                color = LocalTitleColor.current,
                onHomeClick = onHomeClick
            )
            Spacer(Modifier.height(12.dp))

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                state.access?.let { access ->
                    AccessControlSection(access, onAccessToggle, onStartPairing, onRevokeClient)
                }

                SectionCard("מצב חיבור מכשיר") {
                    InfoRow("מצב צימוד", pairingLabel(state.pairingState))
                    InfoRow("מכשיר", state.deviceId ?: "—")
                    InfoRow("נוכחות", presenceLabel(state.presence))
                    InfoRow("נראה לאחרונה", state.lastSeenEpochMs?.let(::formatTime) ?: "—")
                    InfoRow("תוקף אסימון עד", state.expiresAtEpochMs?.let(::formatTime) ?: "—")
                }

                SectionCard("סטטוס MCP") {
                    state.mcpFlags.forEach { flag ->
                        InfoRow(flag.name, if (flag.enabled) "פעיל" else "כבוי")
                    }
                }

                SectionCard("יכולות") {
                    InfoRow("ענן (Cloud)", if (state.cloudEnabled) "פעיל" else "מושבת")
                    InfoRow("קריאות מקומיות ממומשות", state.localReadsCount.toString())
                    InfoRow(
                        "פעולות בקטלוג",
                        "${state.registeredOperations} (קריאה ${state.registeredReads} / כתיבה ${state.registeredWrites})"
                    )
                    InfoRow("פעולות כתיבה שניתנות להרצה", state.executableWrites.toString())
                }

                SectionCard("בקשה אחרונה") {
                    val last = state.lastRequest
                    if (last == null) {
                        Text("עדיין לא התקבלה בקשה (מצייין מקום)", style = MaterialTheme.typography.bodyMedium)
                    } else {
                        InfoRow("פעולה", last.operation)
                        InfoRow("זמן", formatTime(last.atEpochMs))
                        InfoRow("תוצאה", if (last.success) "הצליחה" else "נכשלה")
                    }
                }

                state.revokeResult?.let { result ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = revokeResultLabel(result),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary
                        )
                        TextButton(onClick = onDismissRevokeResult) { Text("הבנתי") }
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                AppButton(onClick = onRefresh, modifier = Modifier.weight(1f)) { Text("רענן") }
                AppButton(
                    onClick = { confirmRevoke = true },
                    enabled = state.canRevoke,
                    containerColor = Color(0xFFC62828),
                    modifier = Modifier.weight(1f)
                ) { Text("בטל גישה") }
            }
        }

        if (confirmRevoke) {
            AlertDialog(
                onDismissRequest = { confirmRevoke = false },
                title = { Text("ביטול גישה ל-Claude") },
                text = { Text("האסימון של המכשיר המצומד יבוטל ו-Claude לא יוכל עוד לקרוא נתונים מהאפליקציה.") },
                confirmButton = {
                    TextButton(onClick = {
                        confirmRevoke = false
                        onRevokeConfirmed()
                    }) { Text("בטל גישה") }
                },
                dismissButton = {
                    TextButton(onClick = { confirmRevoke = false }) { Text("חזרה") }
                }
            )
        }
    }
}

@Composable
private fun AccessControlSection(
    access: AccessControlUi,
    onToggle: (Boolean) -> Unit,
    onStartPairing: () -> Unit,
    onRevokeClient: (String) -> Unit
) {
    SectionCard("גישת Claude לנתונים (קריאה בלבד)") {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "אפשר ל-Claude לקרוא נתונים מהאפליקציה",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f)
            )
            Switch(
                checked = access.enabled,
                onCheckedChange = onToggle,
                modifier = Modifier.semantics { contentDescription = "claude_access_toggle" }
            )
        }
        Text(
            "כבוי כברירת מחדל. Claude יכול רק לקרוא; אין אפשרות לשנות או למחוק נתונים.",
            style = MaterialTheme.typography.bodySmall
        )
        InfoRow("משתמש מחובר", if (access.signedIn) "כן" else "לא — יש להתחבר")
        InfoRow("שרת ממסר", if (access.relayConfigured) "מוגדר" else "לא הוגדר בגרסה זו")
        InfoRow("חיבור אחרון לממסר", access.relayLastPollOkAtEpochMs?.let(::formatTime) ?: "—")
        access.relayLastError?.let { InfoRow("שגיאת ממסר", it) }

        if (access.enabled) {
            AppButton(
                onClick = onStartPairing,
                enabled = !access.pairingInProgress && access.signedIn && access.relayConfigured,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "claude_pair_button" }
            ) { Text(if (access.pairingInProgress) "יוצר קוד…" else "צמד לקוח Claude חדש") }
        }
        access.pairingCode?.let { code ->
            Text("קוד צימוד חד-פעמי (תקף 5 דקות):", style = MaterialTheme.typography.bodyMedium)
            Text(
                code,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.semantics { contentDescription = "claude_pairing_code:$code" }
            )
            Text(
                "הזן את הקוד במחשב שבו פועל Claude. הקוד אינו סיסמה לחשבון.",
                style = MaterialTheme.typography.bodySmall
            )
        }
        access.pairingError?.let {
            Text(it, color = Color(0xFFC62828), style = MaterialTheme.typography.bodyMedium)
        }

        if (access.clients.isNotEmpty()) {
            Text("לקוחות מצומדים", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            access.clients.forEach { c ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(c.record.clientId, style = MaterialTheme.typography.bodyMedium)
                        Text(
                            "${clientStateLabel(c.state)} · עד ${formatTime(c.record.expiresAtEpochMs)}",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                    if (c.state == PairedClientState.ACTIVE) {
                        TextButton(onClick = { onRevokeClient(c.record.tokenId) }) { Text("בטל") }
                    }
                }
            }
        }
    }
}

internal fun clientStateLabel(state: PairedClientState): String = when (state) {
    PairedClientState.ACTIVE -> "פעיל"
    PairedClientState.EXPIRED -> "פג תוקף"
    PairedClientState.REVOKED -> "בוטל"
    PairedClientState.UNKNOWN -> "לא ידוע"
}

@Composable
private fun SectionCard(title: String, content: @Composable () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            content()
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
    }
}

internal fun pairingLabel(state: AgentPairingState): String = when (state) {
    AgentPairingState.NOT_PAIRED -> "לא מצומד"
    AgentPairingState.PAIRED -> "מצומד"
    AgentPairingState.EXPIRED -> "פג תוקף"
    AgentPairingState.REVOKED -> "בוטל"
}

internal fun presenceLabel(state: ConnectivityState): String = when (state) {
    ConnectivityState.ONLINE -> "מחובר"
    ConnectivityState.OFFLINE -> "לא מחובר"
    ConnectivityState.BACKGROUND -> "ברקע"
    ConnectivityState.UNAVAILABLE -> "לא זמין"
}

internal fun revokeResultLabel(result: RevokeResult): String = when (result) {
    RevokeResult.REVOKED -> "הגישה בוטלה"
    RevokeResult.NOT_FOUND -> "האסימון לא נמצא"
    RevokeResult.NOTHING_TO_REVOKE -> "אין גישה פעילה לביטול"
}

private fun formatTime(epochMs: Long): String =
    SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(Date(epochMs))
