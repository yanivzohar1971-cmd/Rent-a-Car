package com.rentacar.app.ui.sync

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.rentacar.app.data.sync.SyncProgressRepository
import com.rentacar.app.data.sync.SyncProgressState
import com.rentacar.app.work.CloudDeltaSyncWorker
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.launch

class SyncNowViewModel(
    private val context: Context
) : ViewModel() {

    private val _isSyncRunning = MutableStateFlow(false)
    val isSyncRunning: StateFlow<Boolean> = _isSyncRunning

    val syncProgressState: StateFlow<SyncProgressState> =
        SyncProgressRepository.progressState

    private val _syncEvents = MutableSharedFlow<SyncUiEvent>()
    val syncEvents: SharedFlow<SyncUiEvent> = _syncEvents

    private val workManager by lazy { WorkManager.getInstance(context) }

    fun onSyncNowClicked() {
        if (_isSyncRunning.value) {
            // sync already running -> toast to user
            viewModelScope.launch {
                _syncEvents.emit(SyncUiEvent.SyncAlreadyRunning)
            }
            return
        }

        _isSyncRunning.value = true

        viewModelScope.launch {
            try {
                _syncEvents.emit(SyncUiEvent.SyncStarted)

                // reset progress state before a new run
                SyncProgressRepository.reset()

                // Enqueue the sync worker
                val request = OneTimeWorkRequestBuilder<CloudDeltaSyncWorker>()
                    .setConstraints(
                        Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build()
                    )
                    .addTag("cloud_delta_sync_now")
                    .build()

                workManager.enqueue(request)

                // Wait for work to complete by observing work state via tag
                val workInfoFlow = workManager.getWorkInfosByTagFlow("cloud_delta_sync_now")
                
                // Wait for work to finish - find the most recent finished work
                val workInfos = workInfoFlow.first { workInfos ->
                    workInfos.any { it.state.isFinished }
                }
                // Get the most recent finished work (sorted by schedule time, most recent first)
                val finalWorkInfo = workInfos
                    .filter { it.state.isFinished }
                    .maxByOrNull { it.outputData.getLong("scheduledTime", 0L) }
                    ?: workInfos.firstOrNull { it.state.isFinished }
                
                // Work completed
                val finalState = syncProgressState.value
                val hadItems = finalState.overallTotalItems > 0

                when {
                    finalWorkInfo?.state == WorkInfo.State.SUCCEEDED -> {
                        _syncEvents.emit(SyncUiEvent.SyncCompletedSuccess(hadItems))
                    }
                    finalWorkInfo?.state == WorkInfo.State.FAILED -> {
                        val errorMsg = finalWorkInfo.outputData.getString("error") 
                            ?: finalState.lastMessage
                        _syncEvents.emit(SyncUiEvent.SyncCompletedError(errorMsg))
                    }
                    else -> {
                        // Handle other states (cancelled, etc.)
                        if (finalState.isError) {
                            _syncEvents.emit(
                                SyncUiEvent.SyncCompletedError(finalState.lastMessage)
                            )
                        } else {
                            _syncEvents.emit(SyncUiEvent.SyncCompletedSuccess(hadItems))
                        }
                    }
                }
                _isSyncRunning.value = false
            } catch (e: Exception) {
                _syncEvents.emit(SyncUiEvent.SyncCompletedError(e.message))
                _isSyncRunning.value = false
            }
        }
    }
}

