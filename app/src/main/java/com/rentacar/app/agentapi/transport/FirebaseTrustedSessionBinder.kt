package com.rentacar.app.agentapi.transport

import com.rentacar.app.BuildConfig
import com.rentacar.app.data.auth.AuthProvider

/** Minimal view of the signed-in Firebase user (keeps the binder testable without Firebase). */
data class AuthenticatedUserSnapshot(
    val uid: String?,
    val isAnonymous: Boolean
)

/**
 * AGENT-103: [TrustedSessionBinder] over the in-app Firebase session (production builds only).
 *
 * - Reads [AuthProvider.auth] ONLY when `!AGENT_DEV_MODE`; in the agentdev build FirebaseAuth is
 *   never touched and no session is returned.
 * - Returns null for no user, a blank uid, an anonymous user, or the reserved AgentDev uid.
 * - Grants only [BoundSessionIdentity.BASELINE_PERMISSION]. Role claims would need an async
 *   ID-token fetch, so they are intentionally not read here.
 */
class FirebaseTrustedSessionBinder(
    private val agentDevMode: Boolean = BuildConfig.AGENT_DEV_MODE,
    private val userSource: () -> AuthenticatedUserSnapshot? = {
        AuthProvider.auth.currentUser?.let { AuthenticatedUserSnapshot(it.uid, it.isAnonymous) }
    }
) : TrustedSessionBinder {

    override fun currentSession(): VerifiedSessionClaims? {
        if (agentDevMode) return null
        val user = try {
            userSource()
        } catch (_: Throwable) {
            null
        } ?: return null
        val uid = user.uid?.trim().orEmpty()
        if (uid.isEmpty() || user.isAnonymous) return null
        if (!SessionBindingPolicy.isAgentDevUidAllowed(agentDevMode, uid)) return null
        return VerifiedSessionClaims(uid, setOf(BoundSessionIdentity.BASELINE_PERMISSION))
    }
}
