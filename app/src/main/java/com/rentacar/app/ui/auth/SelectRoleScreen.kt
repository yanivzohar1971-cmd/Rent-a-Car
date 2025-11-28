package com.rentacar.app.ui.auth

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rentacar.app.data.auth.PrimaryRole
import com.rentacar.app.ui.components.AppButton
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.LocalTitleColor
import android.widget.Toast

/**
 * One-time blocking screen for legacy users to select their primary role.
 * This screen appears after login if the user has no primaryRole set.
 * User cannot proceed until a role is selected and saved.
 */
@Composable
fun SelectRoleScreen(
    viewModel: AuthViewModel,
    onRoleSelected: () -> Unit
) {
    val context = LocalContext.current
    val titleColor = LocalTitleColor.current
    var selectedPrimaryRole by remember { mutableStateOf<PrimaryRole?>(null) }
    var attemptedSubmit by remember { mutableStateOf(false) }
    var isSaving by remember { mutableStateOf(false) }
    val uiState by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
    ) {
        TitleBar(
            title = "בחר סוג חשבון",
            color = titleColor,
            onHomeClick = null // Blocked - cannot go back
        )

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "נדרש לבחור סוג חשבון כדי להמשיך",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            textAlign = TextAlign.End
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "אנא בחר את סוג החשבון המתאים לך. בחירה זו תקבע את ההרשאות והגישה שלך באפליקציה.",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            textAlign = TextAlign.End
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = "הערה: בחירה בתפקיד 'סוכן' או 'מגרש/סוחר' דורשת אישור מנהל ויהיה במצב ממתין עד לאישור.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            textAlign = TextAlign.End
        )

        Spacer(modifier = Modifier.height(24.dp))

        // Radio buttons for primary role selection
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            PrimaryRole.values().forEach { role ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            selectedPrimaryRole = role
                            attemptedSubmit = false
                        }
                        .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.End
                ) {
                    Column(
                        modifier = Modifier.weight(1f),
                        horizontalAlignment = Alignment.End
                    ) {
                        Text(
                            text = role.displayName,
                            style = MaterialTheme.typography.bodyLarge,
                            textAlign = TextAlign.End
                        )
                        if (role.description.isNotBlank()) {
                            Text(
                                text = role.description,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                                textAlign = TextAlign.End
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    RadioButton(
                        selected = selectedPrimaryRole == role,
                        onClick = {
                            selectedPrimaryRole = role
                            attemptedSubmit = false
                        }
                    )
                }
            }
        }

        // Validation error message
        if (attemptedSubmit && selectedPrimaryRole == null) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "חובה לבחור סוג חשבון",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                textAlign = TextAlign.End
            )
        }

        Spacer(modifier = Modifier.height(32.dp))

        // Save button
        if (isSaving) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else {
            AppButton(
                onClick = {
                    if (selectedPrimaryRole == null) {
                        attemptedSubmit = true
                        Toast.makeText(context, "חובה לבחור סוג חשבון", Toast.LENGTH_SHORT).show()
                        return@AppButton
                    }

                    isSaving = true
                    viewModel.setPrimaryRole(selectedPrimaryRole!!) { success ->
                        isSaving = false
                        if (success) {
                            onRoleSelected()
                        } else {
                            Toast.makeText(
                                context,
                                "שגיאה בשמירת סוג החשבון. נסה שוב.",
                                Toast.LENGTH_LONG
                            ).show()
                        }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
            ) {
                Text(
                    text = "שמור והמשך",
                    fontSize = 16.sp
                )
            }
        }
    }
}

