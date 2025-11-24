package com.rentacar.app.data.firebase

import android.util.Log
import com.google.firebase.auth.FirebaseAuth

object FirebaseAuthInitializer {
    
    private const val TAG = "FirebaseAuthInit"
    
    fun ensureSignedIn() {
        val auth = FirebaseAuth.getInstance()
        val currentUser = auth.currentUser
        
        if (currentUser != null) {
            Log.d(TAG, "Already signed in (uid=${currentUser.uid})")
            return
        }
        
        auth.signInAnonymously()
            .addOnSuccessListener { result ->
                val user = result.user
                Log.d(TAG, "Signed in anonymously for debug logging (uid=${user?.uid})")
            }
            .addOnFailureListener { e ->
                Log.w(
                    TAG,
                    "Failed to sign in anonymously. Firestore debug logging may fail.",
                    e
                )
                // IMPORTANT: do not crash, do not block the app.
            }
    }
}

