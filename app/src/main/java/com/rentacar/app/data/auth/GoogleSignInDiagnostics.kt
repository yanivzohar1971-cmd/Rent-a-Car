package com.rentacar.app.data.auth

import android.util.Log
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.firebase.auth.FirebaseAuthException

object GoogleSignInDiagnostics {
    private const val TAG = "GoogleSignIn"

    fun logConfiguration(packageName: String, webClientId: String) {
        Log.d(
            TAG,
            "Configured packageName=$packageName oauthWebClientId=$webClientId legacyGoogleSignIn=true"
        )
    }

    fun logGoogleServicesOAuthClientState(oauthClientCountHint: String) {
        Log.w(TAG, "google-services.json oauth_client state: $oauthClientCountHint")
    }

    fun logActivityResult(resultCode: Int) {
        Log.w(TAG, "Google Sign-In activity resultCode=$resultCode (RESULT_OK=${android.app.Activity.RESULT_OK})")
    }

    fun logApiException(packageName: String, webClientId: String, e: ApiException) {
        Log.e(
            TAG,
            "GoogleSignIn ApiException: statusCode=${e.statusCode} (${statusCodeName(e.statusCode)}), " +
                "message=${e.message}, packageName=$packageName, " +
                "oauthWebClientIdSuffix=...${webClientId.takeLast(24)}",
            e
        )
        if (e.statusCode == CommonStatusCodes.DEVELOPER_ERROR) {
            Log.e(
                TAG,
                "DEVELOPER_ERROR (10): package name + signing certificate SHA-1/SHA-256 likely missing " +
                    "from Firebase/Google Cloud OAuth Android client for $packageName"
            )
        }
    }

    fun logMissingIdToken(accountEmail: String?) {
        Log.e(TAG, "Google Sign-In succeeded but idToken is null (accountEmail=$accountEmail)")
    }

    fun logFirebaseAuthFailure(packageName: String, e: FirebaseAuthException) {
        Log.e(
            TAG,
            "FirebaseAuth signInWithCredential failed: errorCode=${e.errorCode}, " +
                "message=${e.message}, packageName=$packageName",
            e
        )
    }

    fun logFirebaseAuthFailure(packageName: String, e: Exception) {
        if (e is FirebaseAuthException) {
            logFirebaseAuthFailure(packageName, e)
        } else {
            Log.e(TAG, "FirebaseAuth signInWithCredential failed: packageName=$packageName", e)
        }
    }

    fun userMessageForApiException(statusCode: Int): String = when (statusCode) {
        CommonStatusCodes.DEVELOPER_ERROR ->
            "שגיאת הגדרת Google (10): חסרה התאמת חתימת debug/release ב-Firebase עבור com.rentacar.app"
        12501 -> "התחברות Google בוטלה"
        CommonStatusCodes.NETWORK_ERROR -> "שגיאת רשת בהתחברות Google"
        else -> "שגיאה בהתחברות Google (קוד $statusCode)"
    }

    private fun statusCodeName(statusCode: Int): String = when (statusCode) {
        CommonStatusCodes.DEVELOPER_ERROR -> "DEVELOPER_ERROR"
        CommonStatusCodes.NETWORK_ERROR -> "NETWORK_ERROR"
        12501 -> "SIGN_IN_CANCELLED"
        else -> "UNKNOWN"
    }
}
