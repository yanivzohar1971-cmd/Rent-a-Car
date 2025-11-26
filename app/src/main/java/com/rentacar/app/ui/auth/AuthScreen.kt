package com.rentacar.app.ui.auth

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rentacar.app.data.auth.UserProfile
import com.rentacar.app.ui.components.AppButton
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.LocalTitleColor
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.tasks.Task
import android.util.Log

@Composable
fun AuthScreen(
    viewModel: AuthViewModel,
    onAuthenticated: (UserProfile) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val titleColor = LocalTitleColor.current
    val coroutineScope = rememberCoroutineScope()
    
    // Navigate when authenticated AND (email verified OR Google sign-in)
    // Google accounts are always verified, so we check emailVerified for email/password users
    LaunchedEffect(uiState.isLoggedIn, uiState.currentUser?.emailVerified) {
        val user = uiState.currentUser
        if (uiState.isLoggedIn && user != null) {
            // For Google Sign-In, emailVerified is always true
            // For email/password, we need to wait for email verification
            if (user.emailVerified) {
                onAuthenticated(user)
            }
        }
    }
    
    // Google Sign-In setup
    // Note: Web Client ID is required for Google Sign-In
    // Get it from Firebase Console: Project Settings > Your apps > Web app > Web client ID
    // Or it should be auto-generated in R.string.default_web_client_id by Firebase plugin
    val googleSignInClient = remember {
        try {
            val webClientId = try {
                context.getString(com.rentacar.app.R.string.default_web_client_id)
            } catch (e: Exception) {
                // Fallback: construct from project number (may not work, user should add to strings.xml)
                // Project number from google-services.json: 391580257900
                // Format: PROJECT_NUMBER-APP_ID.apps.googleusercontent.com
                // For now, use a placeholder - user must add default_web_client_id to strings.xml
                Log.w("AuthScreen", "default_web_client_id not found in strings.xml. Please add it from Firebase Console.")
                null
            }
            
            if (webClientId != null && webClientId.isNotBlank()) {
                val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                    .requestIdToken(webClientId)
                    .requestEmail()
                    .build()
                GoogleSignIn.getClient(context, gso)
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e("AuthScreen", "Error setting up Google Sign-In", e)
            null
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
        if (googleSignInClient == null) {
            Log.e("AuthScreen", "Google Sign-In not configured. Please add default_web_client_id to strings.xml")
            return
        }
        try {
            val signInIntent = googleSignInClient.signInIntent
            googleSignInIntentLauncher.launch(signInIntent)
        } catch (e: Exception) {
            Log.e("AuthScreen", "Error launching Google Sign-In", e)
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
                        viewModel.signup(
                            email = email,
                            password = password,
                            displayName = displayName.takeIf { it.isNotBlank() },
                            phoneNumber = phoneNumber.takeIf { it.isNotBlank() }
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

