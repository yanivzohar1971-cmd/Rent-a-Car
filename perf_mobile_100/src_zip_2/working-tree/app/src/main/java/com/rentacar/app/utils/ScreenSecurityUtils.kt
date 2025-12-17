package com.rentacar.app.utils

import android.app.Activity
import android.view.WindowManager

/**
 * Utility functions for managing screen security (screenshot blocking)
 */
object ScreenSecurityUtils {
    /**
     * Apply screenshot policy to an Activity window
     * @param activity The Activity to apply the policy to
     * @param allowScreenshots If true, screenshots are allowed (FLAG_SECURE cleared)
     *                         If false, screenshots are blocked (FLAG_SECURE set)
     */
    fun applyScreenshotPolicy(activity: Activity, allowScreenshots: Boolean) {
        if (allowScreenshots) {
            activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } else {
            activity.window.setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            )
        }
    }
}

