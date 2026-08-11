package com.rentacar.app.data.auth

import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Repository for admin-related operations.
 * Handles checking if a user is an admin and managing admin allowlist.
 */
interface AdminRepository {
    /**
     * Checks if the current user (by UID) is an admin.
     * Uses Firestore /config/admins collection with UID allowlist.
     */
    suspend fun isAdmin(uid: String): Boolean
    
    /**
     * Gets the list of admin UIDs from Firestore.
     */
    suspend fun getAdminUids(): List<String>
}

class FirebaseAdminRepository(
    private val firestore: FirebaseFirestore
) : AdminRepository {
    
    companion object {
        private const val TAG = "AdminRepository"
        private const val CONFIG_COLLECTION = "config"
        private const val ADMINS_DOC = "admins"
        private const val UIDS_FIELD = "uids"
    }
    
    override suspend fun isAdmin(uid: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val doc = firestore.collection(CONFIG_COLLECTION)
                .document(ADMINS_DOC)
                .get()
                .await()
            
            if (!doc.exists()) {
                Log.d(TAG, "Admins config document does not exist")
                return@withContext false
            }
            
            val uids = doc.get(UIDS_FIELD) as? List<*> ?: emptyList<Any>()
            val adminUids = uids.mapNotNull { it as? String }
            val isAdmin = adminUids.contains(uid)
            
            Log.d(TAG, "Admin check for uid=$uid: $isAdmin")
            isAdmin
        } catch (e: Exception) {
            Log.e(TAG, "Error checking admin status", e)
            false // Fail safe: don't grant admin access on error
        }
    }
    
    override suspend fun getAdminUids(): List<String> = withContext(Dispatchers.IO) {
        try {
            val doc = firestore.collection(CONFIG_COLLECTION)
                .document(ADMINS_DOC)
                .get()
                .await()
            
            if (!doc.exists()) {
                return@withContext emptyList()
            }
            
            val uids = doc.get(UIDS_FIELD) as? List<*> ?: emptyList<Any>()
            uids.mapNotNull { it as? String }
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching admin UIDs", e)
            emptyList()
        }
    }
}

