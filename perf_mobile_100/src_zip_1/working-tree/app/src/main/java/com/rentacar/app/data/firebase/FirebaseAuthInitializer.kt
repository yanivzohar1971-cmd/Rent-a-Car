package com.rentacar.app.data.firebase

import android.util.Log
import com.google.firebase.auth.FirebaseAuth

object FirebaseAuthInitializer {
    
    private const val TAG = "FirebaseAuthInit"
    
    fun ensureSignedIn() {
        val auth = FirebaseAuth.getInstance()
        val current = auth.currentUser
        
        // If there is already a logged-in email/password user, do NOT sign in anonymously
        if (current != null && !current.isAnonymous) {
            Log.d(TAG, "Already signed in with real user (uid=${current.uid})")
            return
        }
        
        // If already signed in anonymously, don't sign in again
        if (current != null && current.isAnonymous) {
            Log.d(TAG, "Already signed in anonymously (uid=${current.uid})")
            return
        }
        
        // No user at all → sign in anonymously (for debug / initial startup)
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

