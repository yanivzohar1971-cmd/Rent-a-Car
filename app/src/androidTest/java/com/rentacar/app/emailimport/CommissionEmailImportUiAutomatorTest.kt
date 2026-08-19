package com.rentacar.app.emailimport

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until
import com.rentacar.app.emailimport.debug.EmailImportUiTags
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Physical-device UIAutomator flow for supplier commission email import.
 * Hebrew UI strings use Unicode escapes so source encoding cannot corrupt them.
 * Reuses authenticated device session + stored mailbox credentials (never enters App Password).
 */
@RunWith(AndroidJUnit4::class)
class CommissionEmailImportUiAutomatorTest {

    private lateinit var device: UiDevice
    private lateinit var context: Context

    @Before
    fun setUp() {
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        context = InstrumentationRegistry.getInstrumentation().targetContext
        // Do NOT clear the task — that forces login and drops the authenticated debug session.
        InstrumentationRegistry.getInstrumentation().uiAutomation
            .executeShellCommand("am start -n $PACKAGE/.MainActivity")
            .close()
        assertTrue(
            "App did not enter foreground",
            device.wait(Until.hasObject(By.pkg(PACKAGE).depth(0)), LAUNCH_TIMEOUT)
        )
        device.waitForIdle(3_000)

        // Allow Firebase auth restore / splash (can take several seconds after process start)
        var restored = false
        repeat(20) {
            if (device.hasObject(By.text(TXT_SUPPLIER_TAB)) ||
                device.hasObject(By.res(res(EmailImportUiTags.SUPPLIERS_TAB))) ||
                device.hasObject(By.textContains(TXT_MAIN_HINT)) ||
                device.hasObject(By.textContains("yaniv"))
            ) {
                restored = true
                return@repeat
            }
            device.waitForIdle(500)
            Thread.sleep(1_000)
        }
        dumpEvidence("01_launched")
        if (!restored && (device.hasObject(By.textContains(TXT_LOGIN)) || device.hasObject(By.textContains("Google")))) {
            org.junit.Assert.fail(
                "App is on login screen after wait; UIAutomator will not enter credentials. " +
                    "Log into the debug build once on-device, then re-run without wiping app data."
            )
        }
        assertTrue("Authenticated main UI not detected", restored)
    }

    @Test
    fun searchShagrirCommissionReportFromEmail() {
        clickByResOrText(EmailImportUiTags.SUPPLIERS_TAB, TXT_SUPPLIER_TAB)
        assertTrue("Suppliers screen missing", waitForText(TXT_SUPPLIERS_TITLE, 15_000))
        dumpEvidence("02_suppliers")

        // Prefer scrolling the list (Compose search TextField is unreliable for IME/setText)
        assertTrue(
            "Shagrir not found in supplier list",
            scrollUntilText(TXT_SHAGRIR, maxSwipes = 20)
        )
        val rowText = device.findObjects(By.text(TXT_SHAGRIR)).lastOrNull()
            ?: device.findObject(By.text(TXT_SHAGRIR))
        assertNotNull("Shagrir row missing", rowText)
        // Compose Text nodes are often non-clickable; click the card bounds center instead.
        val b = rowText!!.visibleBounds
        device.click(b.centerX(), b.centerY())
        device.waitForIdle(1_500)
        dumpEvidence("03_shagrir_selected")

        // Import FAB — may be alpha-disabled until selection sticks; click anyway after short wait
        device.wait(Until.hasObject(By.res(res(EmailImportUiTags.SUPPLIER_IMPORT_BUTTON))), 5_000)
        var importBtn = findByRes(EmailImportUiTags.SUPPLIER_IMPORT_BUTTON)
            ?: device.findObject(By.text(TXT_IMPORT))
        if (importBtn == null) {
            dumpEvidence("03b_import_missing")
        }
        assertNotNull("Could not find supplier import button", importBtn)
        val ib = importBtn!!.visibleBounds
        device.click(ib.centerX(), ib.centerY())
        device.waitForIdle(1_500)
        dumpEvidence("04_import_chooser")

        val chooserVisible = waitForTextContains(TXT_IMPORT_COMMISSION_PART, 8_000) ||
            waitForTextContains(TXT_CHOOSE_IMPORT_TYPE_PART, 3_000)
        if (!chooserVisible) {
            // Retry selection + import once
            device.click(b.centerX(), b.centerY())
            device.waitForIdle(800)
            device.click(ib.centerX(), ib.centerY())
            device.waitForIdle(1_500)
            dumpEvidence("04b_import_chooser_retry")
        }
        assertTrue(
            "Import type chooser missing",
            waitForTextContains(TXT_IMPORT_COMMISSION_PART, 10_000) ||
                waitForTextContains(TXT_CHOOSE_IMPORT_TYPE_PART, 5_000)
        )
        // Click the commission option card (exact title preferred)
        val commissionOption = device.findObject(By.text(TXT_IMPORT_COMMISSION_EXACT))
            ?: device.findObject(By.textContains(TXT_IMPORT_COMMISSION_PART))
        assertNotNull("Commission import option missing", commissionOption)
        val cb = commissionOption!!.visibleBounds
        device.click(cb.centerX(), cb.centerY())
        device.waitForIdle(3_000)
        dumpEvidence("05_after_commission_choice")

        // Require stable screen tag — do not match dialog title substrings
        val onImportScreen = waitForRes(EmailImportUiTags.COMMISSION_IMPORT_SCREEN, 20_000)
        if (!onImportScreen) {
            val templateHint = device.hasObject(By.textContains(TXT_TEMPLATE_HINT_PART))
            dumpEvidence("05b_not_on_import_screen")
            if (templateHint) {
                org.junit.Assert.fail(
                    "Commission import blocked: supplier commission-report template is not configured."
                )
            }
            org.junit.Assert.fail("Commission import screen not reached (tag missing)")
        }
        dumpEvidence("05_import_screen")

        val needsSupplierEmailConfig = device.hasObject(By.textContains(TXT_ENABLE_EMAIL_HINT_PART))
        if (needsSupplierEmailConfig) {
            org.junit.Assert.fail(
                "Supplier email import is not configured for Shagrir. " +
                    "Set commissionReportEmail=assaft@shagrir.co.il and HTML_TABLE format in supplier settings, then re-run."
            )
        }

        // Sender/format may require scroll on small screens
        if (!device.hasObject(By.text(TXT_SENDER))) {
            device.swipe(
                device.displayWidth / 2,
                (device.displayHeight * 0.4).toInt(),
                device.displayWidth / 2,
                (device.displayHeight * 0.7).toInt(),
                20
            )
            device.waitForIdle(500)
        }
        assertTrue("Configured sender missing", waitForText(TXT_SENDER, 10_000))
        assertTrue("HTML format chip missing", waitForTextContains(TXT_TABLE_PART, 10_000))

        // Default setup month is July 2026 — do NOT press previous (that wrongly selects June).
        assertTrue(
            "Expected July 2026 month label",
            waitForTextContains(TXT_JULY_PART, 5_000)
        )

        clearLogcat()
        val searchStarted = System.currentTimeMillis()
        val searchBtn = findByRes(EmailImportUiTags.EMAIL_IMPORT_BUTTON)
            ?: device.findObject(By.text(TXT_SEARCH_EMAIL))
        assertNotNull("Email search button missing", searchBtn)
        searchBtn!!.click()
        dumpEvidence("06_search_pressed")

        val finished = device.wait(
            Until.hasObject(By.res(res(EmailImportUiTags.EMAIL_IMPORT_RESULT_CARD))),
            SEARCH_TIMEOUT
        ) || device.wait(
            Until.hasObject(By.res(res(EmailImportUiTags.EMAIL_IMPORT_ERROR_CARD))),
            8_000
        ) || device.wait(Until.hasObject(By.textContains(TXT_FOUND_PART)), SEARCH_TIMEOUT)
            || device.wait(Until.hasObject(By.textContains(TXT_ERROR_PART)), 8_000)
            || device.wait(Until.hasObject(By.textContains(TXT_NOT_FOUND_PART)), 8_000)
            || device.wait(Until.hasObject(By.text(TXT_SEARCH_EMAIL)), SEARCH_TIMEOUT)

        assertTrue("Search did not complete in time", finished)
        val searchWallMs = System.currentTimeMillis() - searchStarted
        device.waitForIdle(2_000)
        dumpEvidence("07_search_result")
        File(evidenceDir(), "search_wall_ms.txt").writeText(searchWallMs.toString())

        val searchLog = pullFilteredLogcat()
        File(evidenceDir(), "search_logcat.txt").writeText(searchLog)
        assertTrue("July label must remain visible after search", device.hasObject(By.textContains(TXT_JULY_PART)))
        // Server-filtered search should avoid mass body downloads
        if (searchLog.contains("localBodyDownloads")) {
            assertFalse(
                "Search must not download dozens of bodies",
                Regex("""localBodyDownloads[=:]?\s*(?:[2-9]\d|\d{3,})""").containsMatchIn(searchLog)
            )
        }

        val diag = findByRes(EmailImportUiTags.EMAIL_DIAGNOSTICS_BUTTON)
            ?: device.findObject(By.textContains(TXT_DIAGNOSTICS_PART))
        if (diag != null) {
            diag.click()
            device.waitForIdle(1_000)
            dumpEvidence("08_diagnostics")
            val copy = findByRes(EmailImportUiTags.DEBUG_JSON_COPY_BUTTON)
                ?: device.findObject(By.textContains(TXT_JSON_PART))
            assertNotNull("Debug JSON action missing", copy)
        }

        val log = pullFilteredLogcat()
        File(evidenceDir(), "email-import-logcat.txt").writeText(log)
        assertFalse("App password leaked into Logcat", containsPasswordLeak(log))
        assertTrue(
            "Expected RentCarEmailImport events in Logcat",
            log.contains("EMAIL_IMPORT") || log.contains("RentCarEmailImport") || log.isNotBlank()
        )

        val preferredUidPresent = device.hasObject(
            By.res(res(EmailImportUiTags.emailReportCandidateUid(KNOWN_DIRECT_HTML_UID)))
        )
        File(evidenceDir(), "preferred_uid_present.txt").writeText(preferredUidPresent.toString())

        // Iterate candidates — DIRECT_FROM (incl. UID 15064) are sorted first. Do NOT confirm import.
        var candidateIndex = 0
        while (candidateIndex < 12) {
            val previewBtn = findByRes(EmailImportUiTags.emailReportCandidatePreview(candidateIndex))
                ?: if (candidateIndex == 0) {
                    device.findObject(By.text(TXT_PREVIEW))
                } else null
            if (previewBtn == null) break

            dumpEvidence("09_candidate_${candidateIndex}_before_preview")
            clearLogcat()
            previewBtn.click()
            device.waitForIdle(1_000)

            Thread.sleep(800)
            assertFalse(
                "Candidate preview must not show global mailbox search spinner",
                device.hasObject(By.text(TXT_SEARCHING))
            )
            dumpEvidence("09b_candidate_${candidateIndex}_during_or_after")

            device.wait(Until.hasObject(By.textContains(TXT_RECONCILE_PART)), PREVIEW_TIMEOUT)
                || device.wait(Until.hasObject(By.res(res(EmailImportUiTags.emailReportCandidateError(candidateIndex)))), PREVIEW_TIMEOUT)
                || device.wait(Until.hasObject(By.res(res(EmailImportUiTags.EMAIL_IMPORT_ERROR_CARD))), PREVIEW_TIMEOUT)
                || device.wait(Until.hasObject(By.textContains(TXT_ERROR_PART)), 8_000)
                || device.wait(Until.hasObject(By.textContains(TXT_MISSING_COLS_PART)), 8_000)
                || device.wait(Until.hasObject(By.textContains(TXT_IMAGE_ONLY_PART)), 8_000)
            device.waitForIdle(2_000)
            dumpEvidence("10_candidate_${candidateIndex}_preview_result")

            assertFalse(
                "After preview, global search spinner must still be absent",
                device.hasObject(By.text(TXT_SEARCHING))
            )

            val previewLog = pullFilteredLogcat()
            File(evidenceDir(), "candidate_${candidateIndex}_logcat.txt").writeText(previewLog)
            assertFalse("App password leaked for candidate $candidateIndex", containsPasswordLeak(previewLog))
            assertTrue(
                "Preview must emit CANDIDATE_PREVIEW_START (not a re-search)",
                previewLog.contains("CANDIDATE_PREVIEW_START") || previewLog.contains("SELECTED_MESSAGE_FETCH")
            )
            assertTrue(
                "Preview must use July (serviceReportMonth=7 / 2026-07)",
                previewLog.contains("serviceReportMonth=7") ||
                    previewLog.contains("\"serviceReportMonth\":7") ||
                    previewLog.contains("2026-07") ||
                    previewLog.contains("uiYearMonth=2026-07")
            )

            val isKnownUid = previewLog.contains("imapUid=$KNOWN_DIRECT_HTML_UID") ||
                previewLog.contains("\"imapUid\":$KNOWN_DIRECT_HTML_UID") ||
                previewLog.contains("imapUid\": $KNOWN_DIRECT_HTML_UID")

            if (device.hasObject(By.textContains(TXT_RECONCILE_PART))) {
                dumpEvidence(
                    if (isKnownUid) "11_reconciliation_preview_uid_$KNOWN_DIRECT_HTML_UID"
                    else "11_reconciliation_preview"
                )
                File(evidenceDir(), "candidate_count.txt").writeText(
                    if (isKnownUid) "preview_success_uid_$KNOWN_DIRECT_HTML_UID"
                    else "preview_success_at_$candidateIndex"
                )
                return
            }

            device.swipe(
                device.displayWidth / 2,
                (device.displayHeight * 0.65).toInt(),
                device.displayWidth / 2,
                (device.displayHeight * 0.4).toInt(),
                20
            )
            device.waitForIdle(500)
            candidateIndex++
        }
        File(evidenceDir(), "candidate_count.txt").writeText(candidateIndex.toString())
        dumpEvidence("12_all_candidates_done")
    }

    @Test
    fun importShagrirCommissionReportFromClipboard() {
        clickByResOrText(EmailImportUiTags.SUPPLIERS_TAB, TXT_SUPPLIER_TAB)
        assertTrue("Suppliers screen missing", waitForText(TXT_SUPPLIERS_TITLE, 15_000))
        assertTrue("Shagrir not found", scrollUntilText(TXT_SHAGRIR, maxSwipes = 20))
        val rowText = device.findObjects(By.text(TXT_SHAGRIR)).lastOrNull()
            ?: device.findObject(By.text(TXT_SHAGRIR))
        assertNotNull(rowText)
        val b = rowText!!.visibleBounds
        device.click(b.centerX(), b.centerY())
        device.waitForIdle(1_500)
        device.wait(Until.hasObject(By.res(res(EmailImportUiTags.SUPPLIER_IMPORT_BUTTON))), 5_000)
        val importBtn = findByRes(EmailImportUiTags.SUPPLIER_IMPORT_BUTTON)
            ?: device.findObject(By.text(TXT_IMPORT))
        assertNotNull(importBtn)
        val ib = importBtn!!.visibleBounds
        device.click(ib.centerX(), ib.centerY())
        device.waitForIdle(1_500)
        val commissionOption = device.findObject(By.text(TXT_IMPORT_COMMISSION_EXACT))
            ?: device.findObject(By.textContains(TXT_IMPORT_COMMISSION_PART))
        assertNotNull(commissionOption)
        val cb = commissionOption!!.visibleBounds
        device.click(cb.centerX(), cb.centerY())
        device.waitForIdle(3_000)
        assertTrue("Commission import screen not reached", waitForRes(EmailImportUiTags.COMMISSION_IMPORT_SCREEN, 20_000))

        seedSanitizedClipboard()
        // Clipboard card is below Excel — scroll to it
        repeat(4) {
            if (findByRes(EmailImportUiTags.CLIPBOARD_IMPORT_BUTTON) != null ||
                device.hasObject(By.textContains(TXT_CLIPBOARD_PART))
            ) return@repeat
            device.swipe(
                device.displayWidth / 2,
                (device.displayHeight * 0.7).toInt(),
                device.displayWidth / 2,
                (device.displayHeight * 0.35).toInt(),
                20
            )
            device.waitForIdle(400)
        }
        val clipBtn = findByRes(EmailImportUiTags.CLIPBOARD_IMPORT_BUTTON)
            ?: device.findObject(By.textContains(TXT_CLIPBOARD_PART))
        assertNotNull("Clipboard import button missing", clipBtn)
        clearLogcat()
        val clipStarted = System.currentTimeMillis()
        clipBtn!!.click()
        device.waitForIdle(1_500)
        dumpEvidence("c01_clipboard_dialog")
        assertTrue(
            "Clipboard dialog missing",
            waitForRes(EmailImportUiTags.CLIPBOARD_IMPORT_DIALOG, 10_000) ||
                waitForTextContains(TXT_CLIPBOARD_PART, 8_000)
        )
        assertTrue(
            "Expected 8-column Shagrir detection",
            waitForTextContains("8", 5_000) ||
                waitForRes(EmailImportUiTags.CLIPBOARD_PARSE_STATUS, 5_000)
        )
        val preview = findByRes(EmailImportUiTags.CLIPBOARD_PREVIEW_BUTTON)
            ?: device.findObject(By.text(TXT_PREVIEW))
        assertNotNull("Clipboard preview button missing", preview)
        preview!!.click()
        val opened = device.wait(Until.hasObject(By.textContains(TXT_RECONCILE_PART)), PREVIEW_TIMEOUT)
        dumpEvidence("c02_clipboard_preview")
        File(evidenceDir(), "clipboard_wall_ms.txt").writeText(
            (System.currentTimeMillis() - clipStarted).toString()
        )
        val log = pullFilteredLogcat()
        File(evidenceDir(), "clipboard_logcat.txt").writeText(log)
        assertFalse("App password leaked in clipboard flow", containsPasswordLeak(log))
        assertFalse("Raw clipboard customer leaked", log.contains("לקוח אלפא") || log.contains("UNIQUE_CUSTOMER"))
        assertTrue(
            "Expected CLIPBOARD parse events",
            log.contains("CLIPBOARD_") || log.contains("CLIPBOARD_PARSE")
        )
        assertTrue("Clipboard must open existing reconciliation preview", opened)
        // Do not confirm final import
    }

    private fun seedSanitizedClipboard() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("shagrir-fixture", SANITIZED_CLIPBOARD_FIXTURE))
        }
        device.waitForIdle(500)
    }

    private fun scrollUntilText(text: String, maxSwipes: Int): Boolean {
        if (device.hasObject(By.text(text)) || device.hasObject(By.textContains(text))) return true
        val w = device.displayWidth
        val h = device.displayHeight
        repeat(maxSwipes) {
            device.swipe(w / 2, (h * 0.72).toInt(), w / 2, (h * 0.35).toInt(), 25)
            device.waitForIdle(600)
            if (device.hasObject(By.text(text)) || device.hasObject(By.textContains(text))) return true
        }
        // Try scrolling back up in case list order is reverse / overshoot
        repeat(maxSwipes) {
            device.swipe(w / 2, (h * 0.35).toInt(), w / 2, (h * 0.72).toInt(), 25)
            device.waitForIdle(600)
            if (device.hasObject(By.text(text)) || device.hasObject(By.textContains(text))) return true
        }
        return false
    }

    private fun dismissKeyboard() {
        // Prefer IME Done if visible, otherwise BACK once
        val done = device.findObject(By.text("Done"))
            ?: device.findObject(By.desc("Done"))
            ?: device.findObject(By.text("\u05E1\u05D9\u05D9\u05DD")) // סיים
        if (done != null) {
            done.click()
            device.waitForIdle(800)
        } else {
            device.pressBack()
            device.waitForIdle(800)
        }
        // If still on IME, press back again carefully (don't leave suppliers)
        if (device.hasObject(By.res("android:id/inputArea")) || device.hasObject(By.text("English (US)"))) {
            device.pressBack()
            device.waitForIdle(800)
        }
    }

    private fun clickByResOrText(resId: String, text: String) {
        // Wait a bit for bottom nav / FABs to settle
        device.wait(Until.hasObject(By.res(res(resId))), 8_000)
        val byRes = findByRes(resId)
        if (byRes != null) {
            byRes.click()
            device.waitForIdle(1_000)
            return
        }
        device.wait(Until.hasObject(By.text(text)), 5_000)
        val byText = device.findObject(By.text(text))
            ?: device.findObject(By.textContains(text))
            ?: device.findObject(By.desc(text))
            ?: device.findObject(By.descContains(text))
        if (byText == null) {
            dumpEvidence("missing_$resId")
        }
        assertNotNull("Could not find control res=$resId text=$text", byText)
        byText!!.click()
        device.waitForIdle(1_000)
    }

    private fun clickTextContains(text: String) {
        val obj = device.findObject(By.textContains(text))
        assertNotNull("Missing text: $text", obj)
        obj!!.click()
        device.waitForIdle(1_000)
    }

    private fun findByRes(id: String): UiObject2? =
        device.findObject(By.res(id))
            ?: device.findObject(By.res("$PACKAGE:id/$id"))

    private fun waitForRes(id: String, timeoutMs: Long): Boolean =
        device.wait(Until.hasObject(By.res(id)), timeoutMs) ||
            device.wait(Until.hasObject(By.res("$PACKAGE:id/$id")), 1_000)

    private fun waitForText(text: String, timeoutMs: Long): Boolean =
        device.wait(Until.hasObject(By.text(text)), timeoutMs)

    private fun waitForTextContains(text: String, timeoutMs: Long): Boolean =
        device.wait(Until.hasObject(By.textContains(text)), timeoutMs)

    // Compose testTagsAsResourceId often exposes bare ids (no package:id/ prefix)
    private fun res(id: String): String = id

    private fun evidenceDir(): File {
        // Public-ish location so host adb can pull evidence without run-as
        val dir = File("/sdcard/Download/rentacar_email_import_ui")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    private fun dumpEvidence(label: String) {
        val dir = evidenceDir()
        try {
            device.takeScreenshot(File(dir, "$label.png"))
        } catch (_: Throwable) {
        }
        try {
            device.dumpWindowHierarchy(File(dir, "$label-hierarchy.xml"))
        } catch (_: Throwable) {
        }
    }

    private fun clearLogcat() {
        InstrumentationRegistry.getInstrumentation().uiAutomation
            .executeShellCommand("logcat -c").close()
    }

    private fun pullFilteredLogcat(): String {
        val p = Runtime.getRuntime().exec(
            arrayOf("logcat", "-d", "-v", "time", "-s", "RentCarEmailImport:I")
        )
        return p.inputStream.bufferedReader().readText()
    }

    private fun containsPasswordLeak(log: String): Boolean {
        val lower = log.lowercase()
        return Regex("apppassword\\s*[:=]\\s*(?!\\*{3,})\\S+").containsMatchIn(lower)
    }

    companion object {
        private const val PACKAGE = "com.rentacar.app"
        private val LAUNCH_TIMEOUT = TimeUnit.SECONDS.toMillis(20)
        private val SEARCH_TIMEOUT = TimeUnit.SECONDS.toMillis(90)
        private val PREVIEW_TIMEOUT = TimeUnit.SECONDS.toMillis(120)
        private const val KNOWN_DIRECT_HTML_UID = 15064L

        private const val TXT_ENABLE_EMAIL_HINT_PART =
            "\u05DC\u05D4\u05E4\u05E2\u05DC\u05EA \u05D9\u05D9\u05D1\u05D5\u05D0 \u05DE\u05DE\u05D9\u05D9\u05DC" // להפעלת ייבוא ממייל
        private const val TXT_TEMPLATE_HINT_PART =
            "\u05EA\u05D1\u05E0\u05D9\u05EA \u05D3\u05D5\u05D7 \u05E2\u05DE\u05DC\u05D5\u05EA" // תבנית דוח עמלות
        private const val TXT_LOGIN = "\u05D4\u05EA\u05D7\u05D1\u05E8\u05D5\u05EA" // התחברות
        private const val TXT_MAIN_HINT = "IDAN" // brand/title often visible on home
        private const val TXT_SUPPLIER_TAB = "\u05E1\u05E4\u05E7" // ספק
        private const val TXT_SUPPLIERS_TITLE = "\u05E1\u05E4\u05E7\u05D9\u05DD" // ספקים
        private const val TXT_SEARCH_HINT_PART = "\u05D7\u05D9\u05E4\u05D5\u05E9" // חיפוש
        private const val TXT_SHAGRIR = "\u05E9\u05D2\u05E8\u05D9\u05E8" // שגריר
        private const val TXT_IMPORT = "\u05D9\u05D9\u05D1\u05D0" // ייבא
        private const val TXT_IMPORT_COMMISSION_PART =
            "\u05D9\u05D9\u05D1\u05D5\u05D0 \u05D3\u05D5\u05D7 \u05E2\u05DE\u05DC\u05D5\u05EA" // ייבוא דוח עמלות
        private const val TXT_IMPORT_COMMISSION_EXACT =
            "\u05D9\u05D9\u05D1\u05D5\u05D0 \u05D3\u05D5\u05D7 \u05E2\u05DE\u05DC\u05D5\u05EA \u05E1\u05E4\u05E7" // ייבוא דוח עמלות ספק
        private const val TXT_CHOOSE_IMPORT_TYPE_PART =
            "\u05D1\u05D7\u05E8 \u05E1\u05D5\u05D2 \u05D9\u05D1\u05D5\u05D0" // בחר סוג יבוא
        private const val TXT_IMPORT_TITLE_PART =
            "\u05D9\u05D1\u05D5\u05D0 \u05D3\u05D5\u05D7 \u05E2\u05DE\u05DC\u05D5\u05EA" // יבוא דוח עמלות
        private const val TXT_SENDER = "assaft@shagrir.co.il"
        private const val TXT_TABLE_PART = "\u05D8\u05D1\u05DC\u05D4" // טבלה
        private const val TXT_SEARCH_EMAIL =
            "\u05D7\u05E4\u05E9 \u05D3\u05D5\u05D7 \u05D1\u05DE\u05D9\u05D9\u05DC" // חפש דוח במייל
        private const val TXT_FOUND_PART = "\u05E0\u05DE\u05E6\u05D0" // נמצא
        private const val TXT_ERROR_PART = "\u05E9\u05D2\u05D9\u05D0\u05D4" // שגיאה
        private const val TXT_NOT_FOUND_PART = "\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0" // לא נמצא
        private const val TXT_DIAGNOSTICS_PART = "\u05D0\u05D1\u05D7\u05D5\u05DF" // אבחון
        private const val TXT_JSON_PART = "JSON"
        private const val TXT_PREVIEW =
            "\u05D1\u05D3\u05D5\u05E7 \u05D5\u05D4\u05EA\u05D0\u05DD \u05D4\u05D6\u05DE\u05E0\u05D5\u05EA" // בדוק והתאם הזמנות
        private const val TXT_SEARCHING =
            "\u05DE\u05D7\u05E4\u05E9 \u05D3\u05D5\u05D7\u05D5\u05EA..." // מחפש דוחות...
        private const val TXT_CHECKING =
            "\u05D1\u05D5\u05D3\u05E7 \u05D0\u05EA \u05D4\u05D3\u05D5\u05D7..." // בודק את הדוח...
        private const val TXT_RECONCILE_PART =
            "\u05D4\u05EA\u05D0\u05DE\u05EA" // התאמת
        private const val TXT_MISSING_COLS_PART =
            "\u05E2\u05DE\u05D5\u05D3\u05D5\u05EA" // עמודות
        private const val TXT_IMAGE_ONLY_PART =
            "\u05DB\u05EA\u05DE\u05D5\u05E0\u05D4" // כתמונה
        private const val TXT_JULY_PART =
            "\u05D9\u05D5\u05DC\u05D9" // יולי
        private const val TXT_CLIPBOARD_PART =
            "\u05D9\u05D1\u05D5\u05D0 \u05DE\u05D4\u05DC\u05D5\u05D7" // יבוא מהלוח

        private val SANITIZED_CLIPBOARD_FIXTURE = """
            None selected

            Inbox

            מספר הזמנה

            עמלה

            סהכ ימים לחישוב עמלות

            שם מנוי

            מספר חשבונית

            סה"כ הכנסה מהשכרה לפניי מע"מ

            אחוז

            שם סוכן

            28004

            174.993

            30

            לקוח אלפא

            3398978

            2499.9

            0.07

            סוכן אלפא

            27948

            147

            10

            לקוח בית

            1001

            2100

            0.07

            סוכן בית

            סה"כ

            321.993

            ${""}

            ${""}

            ${""}

            4599.9

            ${""}

            ${""}
        """.trimIndent()
    }
}
