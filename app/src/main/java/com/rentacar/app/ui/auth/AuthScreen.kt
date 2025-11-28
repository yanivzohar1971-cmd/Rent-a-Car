package com.rentacar.app.ui.auth

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.material3.Checkbox
import androidx.compose.material3.RadioButton
import com.rentacar.app.data.auth.PrimaryRole
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rentacar.app.ui.components.AppButton
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.LocalTitleColor
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.foundation.clickable
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.tasks.Task
import android.util.Log
import android.widget.Toast
import com.rentacar.app.R

@Composable
fun AuthScreen(
    viewModel: AuthViewModel
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val titleColor = LocalTitleColor.current
    val coroutineScope = rememberCoroutineScope()
    
    // Google Sign-In setup
    // Note: Web Client ID is required for Google Sign-In
    // Get it from Firebase Console: Project Settings > Your apps > Web app > Web client ID
    val (googleSignInClient, isGoogleSignInConfigured) = remember {
        try {
            val webClientId = try {
                context.getString(R.string.default_web_client_id).trim()
            } catch (e: Exception) {
                Log.e("AuthScreen", "default_web_client_id not found in strings.xml", e)
                ""
            }
            
            // Validate that webClientId is not a placeholder or empty
            val isPlaceholder = webClientId.isBlank() || 
                webClientId == "REPLACE_WITH_YOUR_WEB_CLIENT_ID"
            
            if (isPlaceholder) {
                Log.e("AuthScreen", "Google Sign-In not configured: default_web_client_id is placeholder or empty")
                null to false
            } else {
                try {
                    val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                        .requestIdToken(webClientId)
                        .requestEmail()
                        .build()
                    GoogleSignIn.getClient(context, gso) to true
                } catch (e: Exception) {
                    Log.e("AuthScreen", "Error building GoogleSignInOptions", e)
                    null to false
                }
            }
        } catch (e: Exception) {
            Log.e("AuthScreen", "Error setting up Google Sign-In", e)
            null to false
        }
    }
    
    // Google Sign-In launcher
    val googleSignInLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartIntentSenderForResult()
    ) { result ->
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
            handleGoogleSignInResult(task, viewModel)
        } else {
            viewModel.clearError()
        }
    }
    
    // Alternative launcher for regular intent (not IntentSender)
    val googleSignInIntentLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
            handleGoogleSignInResult(task, viewModel)
        } else {
            viewModel.clearError()
        }
    }
    
    fun launchGoogleSignIn() {
        if (!isGoogleSignInConfigured || googleSignInClient == null) {
            Log.e("AuthScreen", "Google Sign-In not configured. Please add default_web_client_id to strings.xml")
            Toast.makeText(
                context,
                "התחברות עם Google לא מוגדרת. אנא הוסף Web Client ID בהגדרות Firebase.",
                Toast.LENGTH_LONG
            ).show()
            return
        }
        try {
            val signInIntent = googleSignInClient.signInIntent
            googleSignInIntentLauncher.launch(signInIntent)
        } catch (e: Exception) {
            Log.e("AuthScreen", "Error launching Google Sign-In", e)
            Toast.makeText(
                context,
                "שגיאה בהתחברות עם Google: ${e.message ?: "נסה שוב"}",
                Toast.LENGTH_LONG
            ).show()
            viewModel.clearError()
        }
    }
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
    ) {
        TitleBar(
            title = if (uiState.mode == AuthMode.LOGIN) "התחברות" else "הרשמה",
            color = titleColor
        )
        
        Spacer(modifier = Modifier.height(32.dp))
        
        // Email verification banner
        if (uiState.isLoggedIn && uiState.currentUser?.emailVerified == false) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "החשבון שלך נוצר, אבל האימייל עדיין לא אומת.",
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "בדוק את תיבת הדואר שלך ולחץ על קישור האימות. לאחר שאישרת, לחץ על הכפתור לרענון.",
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    TextButton(onClick = { viewModel.refreshEmailVerification() }) {
                        Text("רענן סטטוס אימות")
                    }
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
        
        // Error message
        uiState.errorMessage?.let { error ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer
                )
            ) {
                Text(
                    text = error,
                    modifier = Modifier.padding(16.dp),
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    textAlign = TextAlign.Center
                )
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
        
        // Email field
        var email by remember { mutableStateOf("") }
        OutlinedTextField(
            value = email,
            onValueChange = { email = it; viewModel.clearError() },
            label = { Text("כתובת אימייל") },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            singleLine = true
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Password field
        var password by remember { mutableStateOf("") }
        var passwordVisible by remember { mutableStateOf(false) }
        OutlinedTextField(
            value = password,
            onValueChange = { password = it; viewModel.clearError() },
            label = { Text("סיסמה") },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            singleLine = true,
            trailingIcon = {
                TextButton(onClick = { passwordVisible = !passwordVisible }) {
                    Text(if (passwordVisible) "הסתר" else "הצג", fontSize = 12.sp)
                }
            }
        )
        
        // Display name field (only for signup)
        var displayName by remember { mutableStateOf("") }
        var phoneNumber by remember { mutableStateOf("") }
        // Primary role selection (single choice)
        var selectedPrimaryRole by remember { mutableStateOf<PrimaryRole?>(null) }
        var attemptedSubmit by remember { mutableStateOf(false) }
        
        if (uiState.mode == AuthMode.SIGNUP) {
            Spacer(modifier = Modifier.height(16.dp))
            OutlinedTextField(
                value = displayName,
                onValueChange = { displayName = it; viewModel.clearError() },
                label = { Text("שם מלא (אופציונלי)") },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                singleLine = true
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            OutlinedTextField(
                value = phoneNumber,
                onValueChange = { phoneNumber = it; viewModel.clearError() },
                label = { Text("טלפון (לא חובה)") },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                singleLine = true
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            // Primary role selection section (single choice)
            Text(
                text = "בחר סוג חשבון:",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                textAlign = TextAlign.End
            )
            
            Spacer(modifier = Modifier.height(12.dp))
            
            // Radio buttons for primary role selection
            // Only show selectable roles (PRIVATE_USER, AGENT, YARD) - exclude ADMIN and legacy BUYER/SELLER
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                PrimaryRole.selectableRoles().forEach { role ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                selectedPrimaryRole = role
                                viewModel.clearError()
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
                                viewModel.clearError()
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
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Loading indicator
        if (uiState.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else {
            // Login/Signup button
            AppButton(
                onClick = {
                    if (uiState.mode == AuthMode.LOGIN) {
                        viewModel.login(email, password)
                    } else {
                        // Validate primary role is selected
                        if (selectedPrimaryRole == null) {
                            attemptedSubmit = true
                            Toast.makeText(context, "חובה לבחור סוג חשבון", Toast.LENGTH_SHORT).show()
                            return@AppButton
                        }
                        attemptedSubmit = false
                        viewModel.signup(
                            email = email,
                            password = password,
                            displayName = displayName.takeIf { it.isNotBlank() },
                            phoneNumber = phoneNumber.takeIf { it.isNotBlank() },
                            primaryRole = selectedPrimaryRole!!
                        )
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
            ) {
                Text(
                    text = if (uiState.mode == AuthMode.LOGIN) "כניסה למערכת" else "יצירת משתמש",
                    fontSize = 16.sp
                )
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Google Sign-In button
        if (!uiState.isLoading) {
            OutlinedButton(
                onClick = { launchGoogleSignIn() },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = MaterialTheme.colorScheme.onSurface
                )
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    // Google "G" icon (simplified - using text for now)
                    Text(
                        text = "G",
                        style = MaterialTheme.typography.titleMedium,
                        color = Color(0xFF4285F4),
                        modifier = Modifier.padding(end = 8.dp)
                    )
                    Text(
                        text = "התחברות עם Google",
                        fontSize = 16.sp,
                        textAlign = TextAlign.Center
                    )
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
        
        // Toggle mode link
        TextButton(
            onClick = {
                viewModel.switchMode(
                    if (uiState.mode == AuthMode.LOGIN) AuthMode.SIGNUP else AuthMode.LOGIN
                )
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
        ) {
            Text(
                text = if (uiState.mode == AuthMode.LOGIN) {
                    "אין לך משתמש? להרשמה"
                } else {
                    "כבר רשום? להתחברות"
                },
                fontSize = 14.sp,
                textAlign = TextAlign.Center
            )
        }
        
        Spacer(modifier = Modifier.height(32.dp))
    }
}

private fun handleGoogleSignInResult(
    completedTask: Task<GoogleSignInAccount>,
    viewModel: AuthViewModel
) {
    try {
        val account = completedTask.getResult(ApiException::class.java)
        val idToken = account?.idToken
        if (idToken != null) {
            viewModel.signInWithGoogle(idToken)
        } else {
            Log.e("AuthScreen", "Google Sign-In: ID token is null")
        }
    } catch (e: ApiException) {
        Log.e("AuthScreen", "Google Sign-In failed", e)
        // Error will be handled by ViewModel
    }
}

