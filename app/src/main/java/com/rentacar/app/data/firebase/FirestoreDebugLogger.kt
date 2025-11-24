package com.rentacar.app.data.firebase

import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import com.rentacar.app.BuildConfig

object FirestoreDebugLogger {
    
    private const val TAG = "FirestoreDebug"
    
    fun isEnabled(): Boolean {
        // Debug-only logging, controlled via BuildConfig flag
        return BuildConfig.DEBUG && BuildConfig.FIREBASE_DEBUG_LOGGING_ENABLED
    }
    
    fun tryWriteDebugDoc(
        firestore: FirebaseFirestore,
        path: String,
        label: String,
        payload: Map<String, Any?>
    ) {
        if (!isEnabled()) {
            Log.d(TAG, "Debug logging disabled. Skipping write for $label")
            return
        }
        
        try {
            val docRef = firestore.document(path)
            val data = payload.toMutableMap().apply {
                put("label", label)
                put("timestamp", System.currentTimeMillis())
                put("appVersion", BuildConfig.VERSION_NAME)
            }
            
            docRef.set(data)
                .addOnSuccessListener {
                    Log.d(TAG, "Debug doc written: $label -> $path")
                }
                .addOnFailureListener { e ->
                    Log.w(TAG, "Failed to write debug doc: $label -> $path", e)
                    // IMPORTANT: no Toast, no user-facing error here
                }
        } catch (t: Throwable) {
            Log.w(TAG, "Exception while scheduling debug doc write: $label -> $path", t)
        }
    }
}

