package com.rentacar.app.data.sync

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.CollectionReference
import com.google.firebase.firestore.FirebaseFirestore

object UserCollections {
    
    private fun requireUid(): String {
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        require(!uid.isNullOrBlank()) { "No logged in Firebase user (uid is null or blank)" }
        return uid
    }
    
    fun userCollection(firestore: FirebaseFirestore, collection: String): CollectionReference {
        val uid = requireUid()
        return firestore
            .collection("users")
            .document(uid)
            .collection(collection)
    }
}

