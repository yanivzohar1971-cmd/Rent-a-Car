package com.rentacar.app.ui.auth

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Regression (AGENT-137 emulator diagnosis, 2026-11-18): the background anonymous debug sign-in
 * completed after checkExistingUser() and flipped navigation to LoggedIn with no profile, leaving
 * the app on SplashScreen indefinitely. An anonymous user must never count as an app login.
 */
class AuthNavigationStateTest {
    @Test
    fun anonymousUserIsNotLoggedIn() {
        assertEquals(AuthNavigationState.LoggedOut, navigationStateFor("anon-uid", isAnonymous = true))
    }

    @Test
    fun noUserIsLoggedOut() {
        assertEquals(AuthNavigationState.LoggedOut, navigationStateFor(null, isAnonymous = false))
    }

    @Test
    fun realUserIsLoggedIn() {
        assertEquals(AuthNavigationState.LoggedIn("u1"), navigationStateFor("u1", isAnonymous = false))
    }
}
