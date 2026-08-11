package com.rentacar.app.ui.vm

import android.app.Application
import android.net.Uri
import com.rentacar.app.share.ShareService
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Verifies one-shot Channel event semantics used by CommissionReconciliationViewModel:
 * ShareExcel / ShowError are consumed once and not replayed after a new collector attaches.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class CommissionReconciliationUiEventTest {

    @Test
    fun shareExcelEvent_isEmittedOnceAndConsumed() = runTest {
        val channel = Channel<CommissionReconciliationUiEvent>(Channel.BUFFERED)
        val events = channel.receiveAsFlow()
        val uri = Uri.parse("content://com.rentacar.app.fileprovider/shared/report.xlsx")

        val first = async { events.first() }
        channel.send(
            CommissionReconciliationUiEvent.ShareExcel(
                uri = uri,
                fileName = "report.xlsx",
                mimeType = ShareService.MIME_XLSX
            )
        )
        val event = first.await() as CommissionReconciliationUiEvent.ShareExcel
        assertEquals("report.xlsx", event.fileName)
        assertEquals(ShareService.MIME_XLSX, event.mimeType)
        assertEquals(uri, event.uri)
        channel.close()
    }

    @Test
    fun showErrorEvent_onExportFailureShape() = runTest {
        val channel = Channel<CommissionReconciliationUiEvent>(Channel.BUFFERED)
        channel.send(CommissionReconciliationUiEvent.ShowError("ייצוא נכשל"))
        val event = channel.receive() as CommissionReconciliationUiEvent.ShowError
        assertEquals("ייצוא נכשל", event.message)
        channel.close()
    }

    @Test
    fun recomposition_newCollector_doesNotReplayShareEvent() = runTest {
        val channel = Channel<CommissionReconciliationUiEvent>(Channel.BUFFERED)
        val flow = channel.receiveAsFlow()
        val uri = Uri.parse("content://com.rentacar.app.fileprovider/shared/a.xlsx")

        val collected = mutableListOf<CommissionReconciliationUiEvent>()
        val job1 = launch { flow.collect { collected += it } }
        channel.send(CommissionReconciliationUiEvent.ShareExcel(uri, "a.xlsx"))
        // Allow collect
        testScheduler.advanceUntilIdle()
        job1.cancel()

        assertEquals(1, collected.size)

        // New collector (recomposition / rotation) must not see the prior event again.
        val replayed = mutableListOf<CommissionReconciliationUiEvent>()
        val job2 = launch { flow.toList(replayed) }
        channel.close()
        job2.join()
        assertTrue(replayed.isEmpty())
    }
}
