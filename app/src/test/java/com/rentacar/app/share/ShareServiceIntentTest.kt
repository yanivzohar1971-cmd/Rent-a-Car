package com.rentacar.app.share

import android.app.Application
import android.content.Intent
import android.net.Uri
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Pure intent-construction tests (no Activity launch). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class ShareServiceIntentTest {

    private val uri: Uri =
        Uri.parse("content://com.rentacar.app.fileprovider/shared/test.xlsx")

    @Test
    fun shareIntent_usesXlsxMimeType() {
        val intent = ShareService.buildShareFileIntent(
            uri = uri,
            itemName = "test.xlsx",
            mimeType = ShareService.MIME_XLSX
        )
        assertEquals(ShareService.MIME_XLSX, intent.type)
        assertEquals(uri, intent.getParcelableExtra(Intent.EXTRA_STREAM))
    }

    @Test
    fun shareIntent_grantsReadUriPermission() {
        val intent = ShareService.buildShareFileIntent(uri, mimeType = ShareService.MIME_XLSX)
        assertTrue((intent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0)
    }

    @Test
    fun chooser_nonActivity_includesNewTask() {
        val chooser = ShareService.buildShareChooserIntent(
            uri = uri,
            mimeType = ShareService.MIME_XLSX,
            addNewTaskForNonActivity = true
        )
        assertTrue((chooser.flags and Intent.FLAG_ACTIVITY_NEW_TASK) != 0)
    }

    @Test
    fun chooser_activityContext_doesNotForceNewTask() {
        val chooser = ShareService.buildShareChooserIntent(
            uri = uri,
            mimeType = ShareService.MIME_XLSX,
            addNewTaskForNonActivity = false
        )
        assertFalse((chooser.flags and Intent.FLAG_ACTIVITY_NEW_TASK) != 0)
    }

    @Test
    fun defaultMime_remainsOctetStreamForGenericShare() {
        val intent = ShareService.buildShareFileIntent(uri)
        assertEquals(ShareService.MIME_OCTET_STREAM, intent.type)
    }
}
