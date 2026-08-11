package com.rentacar.app.data.auth

import android.util.Log
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestoreException

/**
 * Temporary diagnostics for user bootstrap / profile load / access gating.
 * Filter logcat with tag: UserBootstrap
 */
object UserBootstrapDiagnostics {
    private const val TAG = "UserBootstrap"

    fun logFirebaseAuthUser(phase: String, user: FirebaseUser?) {
        if (user == null) {
            Log.w(TAG, "[$phase] FirebaseAuth.currentUser=null")
            return
        }
        Log.d(
            TAG,
            "[$phase] FirebaseAuth uid=${user.uid} email=${user.email} displayName=${user.displayName} " +
                "emailVerified=${user.isEmailVerified} providerIds=${user.providerData.map { it.providerId }}"
        )
    }

    fun logFirestoreReadStart(phase: String, uid: String, mode: String = "direct users/{uid}") {
        Log.d(TAG, "[$phase] Firestore read mode=$mode path=users/$uid")
    }

    fun logFirestoreReadResult(
        phase: String,
        uid: String,
        doc: DocumentSnapshot?,
        error: Throwable? = null
    ) {
        if (error != null) {
            val code = (error as? FirebaseFirestoreException)?.code?.name
            Log.e(
                TAG,
                "[$phase] Firestore read FAILED path=users/$uid exception=${error.javaClass.simpleName} " +
                    "code=$code message=${error.message}",
                error
            )
            return
        }
        if (doc == null) {
            Log.w(TAG, "[$phase] Firestore read returned null snapshot for path=users/$uid")
            return
        }
        Log.d(
            TAG,
            "[$phase] Firestore read path=users/$uid exists=${doc.exists()} docCount=1 " +
                "rawFieldKeys=${doc.data?.keys?.sorted()}"
        )
    }

    fun logParsedProfile(phase: String, profile: UserProfile?) {
        if (profile == null) {
            Log.w(TAG, "[$phase] Parsed UserProfile=null")
            return
        }
        Log.d(
            TAG,
            "[$phase] Parsed UserProfile uid=${profile.uid} email=${profile.email} displayName=${profile.displayName} " +
                "role=${profile.role} primaryRole=${profile.primaryRole} requestedRole=${profile.requestedRole} " +
                "roleStatus=${profile.roleStatus} status=${profile.status} isAgent=${profile.isAgent} isYard=${profile.isYard} " +
                "canBuy=${profile.canBuy} canSell=${profile.canSell} licenseActive=${profile.licenseActive} " +
                "licenseType=${profile.licenseType} licenseExpiresAt=${profile.licenseExpiresAt} " +
                "emailVerified=${profile.emailVerified} isPrivateUser=${profile.isPrivateUser}"
        )
    }

    fun logAccessChecks(phase: String, profile: UserProfile?) {
        val active = UserRoleResolver.isActive(profile)
        val pending = UserRoleResolver.isPendingApproval(profile)
        val agent = UserRoleResolver.isAgent(profile)
        val yard = UserRoleResolver.isYard(profile)
        val licenseBlocks = profile?.licenseActive == false
        Log.d(
            TAG,
            "[$phase] Access checks: isActive=$active isPendingApproval=$pending isAgent=$agent isYard=$yard " +
                "licenseActive=${profile?.licenseActive} licenseActiveWouldBlock=$licenseBlocks " +
                "(note: licenseActive is NOT checked anywhere in app code today)"
        )
    }

    fun logRejection(phase: String, reason: String, profile: UserProfile? = null, uid: String? = null) {
        Log.w(
            TAG,
            "[$phase] REJECT user access: reason=$reason uid=${uid ?: profile?.uid} email=${profile?.email}"
        )
    }

    fun logNavigationDecision(
        phase: String,
        effectiveRole: String?,
        startDestination: String,
        needsRoleSelection: Boolean
    ) {
        Log.d(
            TAG,
            "[$phase] Navigation effectiveRole=$effectiveRole startDestination=$startDestination " +
                "needsRoleSelection=$needsRoleSelection"
        )
    }

    fun logUidMismatchCheck(
        phase: String,
        firebaseUid: String,
        expectedUid: String?,
        firestoreDocEmail: String?
    ) {
        val matches = expectedUid == null || firebaseUid == expectedUid
        Log.d(
            TAG,
            "[$phase] UID check firebaseUid=$firebaseUid expectedUid=$expectedUid matchesExpected=$matches " +
                "firestoreEmail=$firestoreDocEmail"
        )
    }
}
