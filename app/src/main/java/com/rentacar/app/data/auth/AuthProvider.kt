package com.rentacar.app.data.auth

import android.util.Log
import com.rentacar.app.BuildConfig
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.FirebaseApp

/**
 * Shared Auth provider to ensure both registration and login use the same FirebaseAuth instance
 * and the same Firebase project.
 */
object AuthProvider {
    
    private const val TAG = "AuthProvider"
    
    /**
     * Single FirebaseAuth instance used throughout the app.
     * This ensures both registration and login hit the same Firebase project.
     */
    val auth: FirebaseAuth by lazy {
        // AGENT-101: agentdev is offline; FirebaseAuth must never be initialized there.
        check(!BuildConfig.AGENT_DEV_MODE) { "FirebaseAuth is disabled in the agentdev build" }
        val instance = FirebaseAuth.getInstance()
        
        // Log Firebase app info for debugging
        val app = FirebaseApp.getInstance()
        Log.d(TAG, "FirebaseAuth initialized - projectId=${app.options.projectId}, appName=${app.name}")
        
        instance
    }
    
    /**
     * Normalizes email by trimming whitespace and converting to lowercase.
     * This ensures consistent email handling in both registration and login.
     */
    fun normalizeEmail(raw: String): String {
        return raw.trim().lowercase()
    }
    
    /**
     * Logs current Firebase app info for debugging.
     * Call this before registration and login to verify they use the same project.
     */
    fun logFirebaseAppInfo(context: String) {
        if (BuildConfig.AGENT_DEV_MODE) return
        val app = FirebaseApp.getInstance()
        Log.d(TAG, "$context - projectId=${app.options.projectId}, appName=${app.name}")
    }
}

