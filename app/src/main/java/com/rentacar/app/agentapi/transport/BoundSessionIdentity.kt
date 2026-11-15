package com.rentacar.app.agentapi.transport

/** Claims verified by a trusted, app-side authenticator (never taken from a request body). */
data class VerifiedSessionClaims(
    val userUid: String,
    val permissions: Set<String> = emptySet()
)

/**
 * Trusted source of the currently authenticated app user, e.g. an adapter over the
 * in-app Firebase session. Implementations live in app-side wiring or tests, never in
 * the network layer.
 */
fun interface TrustedSessionBinder {
    /** Returns verified claims, or null when there is no authenticated user. */
    fun currentSession(): VerifiedSessionClaims?
}

/**
 * A verified user + permission set bound to a device pairing.
 *
 * The constructor is private; the only way to obtain an instance is
 * [fromTrustedBinder]. There is intentionally no factory taking a raw `userUid`
 * string, so a client-supplied uid cannot become an identity.
 */
class BoundSessionIdentity private constructor(
    val userUid: String,
    val permissions: Set<String>
) {
    override fun equals(other: Any?): Boolean =
        other is BoundSessionIdentity && other.userUid == userUid && other.permissions == permissions

    override fun hashCode(): Int = 31 * userUid.hashCode() + permissions.hashCode()

    override fun toString(): String = "BoundSessionIdentity(userUid=$userUid, permissions=$permissions)"

    companion object {
        const val BASELINE_PERMISSION: String = "AUTHENTICATED"

        /** Returns null when the binder has no authenticated session or a blank uid. */
        fun fromTrustedBinder(binder: TrustedSessionBinder): BoundSessionIdentity? {
            val claims = binder.currentSession() ?: return null
            val uid = claims.userUid.trim()
            if (uid.isEmpty()) return null
            val permissions = (claims.permissions.map { it.trim().uppercase() }.filter { it.isNotEmpty() } +
                BASELINE_PERMISSION).toSortedSet()
            return BoundSessionIdentity(uid, permissions)
        }
    }
}
