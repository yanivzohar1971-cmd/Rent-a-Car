package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.transport.TrustedSessionBinder
import com.rentacar.app.agentapi.transport.VerifiedSessionClaims

/** Fake binders for JVM tests (no Firebase, no BuildConfig). */
internal object TestTrustedSessionBinders {
    fun signedIn(uid: String, vararg permissions: String): TrustedSessionBinder =
        TrustedSessionBinder { VerifiedSessionClaims(uid, permissions.toSet()) }

    val signedOut: TrustedSessionBinder = TrustedSessionBinder { null }

    val blankUid: TrustedSessionBinder = TrustedSessionBinder { VerifiedSessionClaims("   ") }
}
