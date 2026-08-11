package com.rentacar.app.ui.backup

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.rentacar.app.data.AppDatabase
import com.rentacar.app.data.backup.PreInstallBackupLogic
import com.rentacar.app.data.backup.PreInstallBackupLogic.UnresolvedSyncSummary
import com.rentacar.app.data.sync.DataSyncCheckRepository
import com.rentacar.app.data.sync.SyncProgressRepository
import com.rentacar.app.ui.vm.ExportViewModel
import com.rentacar.app.work.BackupWorker
import com.rentacar.app.work.CloudDeltaSyncWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Orchestrates "גיבוי לפני התקנה":
 * sync → evaluate dirty queue → (retry / continue-with-warning / cancel) → regular backup → snapshot.
 *
 * "Continue despite sync warning" is an in-memory operation flag only —
 * it never marks failed queue items as synced.
 */
class PreInstallBackupViewModel(
    private val context: Context,
    private val db: AppDatabase,
    private val exportViewModel: ExportViewModel,
    private val syncCheckRepository: DataSyncCheckRepository
) : ViewModel() {

    sealed interface State {
        data object Idle : State
        data object Syncing : State
        data object CheckingSync : State
        data class SyncWarning(
            val summary: UnresolvedSyncSummary,
            val attemptsUsed: Int
        ) : State
        data object RunningRegularBackup : State
        data object RunningSnapshot : State
        data class Completed(
            val withSyncWarningOverride: Boolean,
            val remainingDirtyCount: Int,
            val regularBackupFileName: String?,
            val snapshotFileName: String?
        ) : State
        data class Failed(
            val stepLabelHe: String,
            val message: String,
            val regularBackupOk: Boolean = false
        ) : State
    }

    private val _state = MutableStateFlow<State>(State.Idle)
    val state: StateFlow<State> = _state.asStateFlow()

    private val workManager by lazy { WorkManager.getInstance(context) }

    /** In-memory only for this operation — never persisted as fake sync success. */
    private var proceedDespiteSyncWarnings: Boolean = false
    private var syncAttemptsUsed: Int = 0
    private var lastUnresolved: UnresolvedSyncSummary =
        PreInstallBackupLogic.buildUnresolvedSummary(emptyMap())

    val isBusy: Boolean
        get() = when (_state.value) {
            is State.Idle,
            is State.Completed,
            is State.Failed,
            is State.SyncWarning -> false
            else -> true
        }

    fun start() {
        if (isBusy) return
        if (_state.value is State.SyncWarning) return
        proceedDespiteSyncWarnings = false
        syncAttemptsUsed = 0
        lastUnresolved = PreInstallBackupLogic.buildUnresolvedSummary(emptyMap())
        viewModelScope.launch { runSyncThenEvaluate() }
    }

    fun onRetrySync() {
        val warning = _state.value as? State.SyncWarning ?: return
        when (
            PreInstallBackupLogic.decideAfterWarningChoice(
                PreInstallBackupLogic.UserWarningChoice.Retry,
                warning.attemptsUsed
            )
        ) {
            PreInstallBackupLogic.AfterWarningDecision.RetrySync -> {
                viewModelScope.launch { runSyncThenEvaluate() }
            }
            PreInstallBackupLogic.AfterWarningDecision.RetryExhaustedStayOnWarning -> {
                // Stay on warning; user may Continue or Cancel
            }
            else -> Unit
        }
    }

    fun onContinueDespiteWarnings() {
        val warning = _state.value as? State.SyncWarning ?: return
        proceedDespiteSyncWarnings = true
        lastUnresolved = warning.summary
        viewModelScope.launch { runBackups() }
    }

    fun onCancel() {
        if (_state.value is State.SyncWarning ||
            _state.value is State.Completed ||
            _state.value is State.Failed
        ) {
            resetToIdle()
        }
    }

    fun acknowledgeFinished() {
        resetToIdle()
    }

    private fun resetToIdle() {
        proceedDespiteSyncWarnings = false
        syncAttemptsUsed = 0
        _state.value = State.Idle
    }

    private suspend fun runSyncThenEvaluate() {
        _state.value = State.Syncing
        syncAttemptsUsed += 1
        try {
            SyncProgressRepository.reset()
            val request = OneTimeWorkRequestBuilder<CloudDeltaSyncWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .addTag("pre_install_cloud_delta_sync")
                .build()
            workManager.enqueue(request)
            workManager.getWorkInfoByIdFlow(request.id)
                .first { it != null && it.state.isFinished }
        } catch (e: Exception) {
            Log.e(TAG, "Pre-install sync enqueue/wait failed", e)
            _state.value = State.Failed(
                stepLabelHe = "סנכרון",
                message = e.message ?: "שגיאה בסנכרון"
            )
            return
        }

        _state.value = State.CheckingSync
        val summary = withContext(Dispatchers.IO) { loadUnresolvedSummary() }
        lastUnresolved = summary

        when (val decision = PreInstallBackupLogic.decideAfterSync(summary, syncAttemptsUsed)) {
            PreInstallBackupLogic.AfterSyncDecision.ProceedToBackupsClean -> {
                proceedDespiteSyncWarnings = false
                runBackups()
            }
            is PreInstallBackupLogic.AfterSyncDecision.ShowWarning -> {
                _state.value = State.SyncWarning(
                    summary = decision.summary,
                    attemptsUsed = decision.attemptsUsed
                )
            }
        }
    }

    private suspend fun loadUnresolvedSummary(): UnresolvedSyncSummary {
        val syncQueueDao = db.syncQueueDao()
        val types = syncQueueDao.getDirtyEntityTypes()
        val counts = types.associateWith { syncQueueDao.getDirtyCountByType(it) }
        val lastError = syncQueueDao.getLatestDirtyError()

        val localAhead = runCatching {
            val check = syncCheckRepository.computeSyncSummary()
            check.categories.mapNotNull { cat ->
                val local = cat.localCount
                val cloud = cat.cloudCount
                if (local != null && cloud != null && local > cloud) {
                    "${cat.displayName}: מקומי $local / ענן $cloud"
                } else null
            }
        }.getOrElse { emptyList() }

        // Presence of dirty items is authoritative even when cloud >= local (CASE I).
        return PreInstallBackupLogic.buildUnresolvedSummary(
            countsByType = counts,
            lastError = lastError,
            localAheadCategories = localAhead
        )
    }

    private suspend fun runBackups() {
        _state.value = State.RunningRegularBackup
        val regular = try {
            BackupWorker.executeRegularBackup(context)
        } catch (e: Exception) {
            Log.e(TAG, "Regular backup failed", e)
            _state.value = State.Failed(
                stepLabelHe = "גיבוי רגיל",
                message = e.message ?: "שגיאה בגיבוי רגיל",
                regularBackupOk = false
            )
            return
        }

        val regularFile = when (regular) {
            is BackupWorker.RegularBackupResult.Success -> regular.fileName
            is BackupWorker.RegularBackupResult.Failure -> {
                _state.value = State.Failed(
                    stepLabelHe = "גיבוי רגיל",
                    message = regular.message ?: "שגיאה בגיבוי רגיל",
                    regularBackupOk = false
                )
                return
            }
        }

        _state.value = State.RunningSnapshot
        val snapshotFile = try {
            exportViewModel.savePreInstallSnapshotToDownloads(context)
        } catch (e: Exception) {
            Log.e(TAG, "Snapshot backup failed", e)
            _state.value = State.Failed(
                stepLabelHe = "Snapshot",
                message = "הגיבוי הרגיל הושלם, אך יצירת Snapshot נכשלה.\n${e.message ?: ""}",
                regularBackupOk = true
            )
            return
        }

        val remaining = withContext(Dispatchers.IO) {
            runCatching { db.syncQueueDao().getDirtyCount() }.getOrDefault(0)
        }

        when (
            PreInstallBackupLogic.decideFinalOutcome(
                regularBackupOk = true,
                snapshotOk = true,
                proceededDespiteSyncWarnings = proceedDespiteSyncWarnings
            )
        ) {
            PreInstallBackupLogic.BackupOutcomeDecision.FullSuccess,
            PreInstallBackupLogic.BackupOutcomeDecision.SuccessWithSyncWarningOverride -> {
                _state.value = State.Completed(
                    withSyncWarningOverride = proceedDespiteSyncWarnings,
                    remainingDirtyCount = remaining,
                    regularBackupFileName = regularFile,
                    snapshotFileName = snapshotFile
                )
            }
            else -> {
                // Unreachable when both backups succeeded
                _state.value = State.Completed(
                    withSyncWarningOverride = proceedDespiteSyncWarnings,
                    remainingDirtyCount = remaining,
                    regularBackupFileName = regularFile,
                    snapshotFileName = snapshotFile
                )
            }
        }
    }

    companion object {
        private const val TAG = "PreInstallBackup"
    }
}
