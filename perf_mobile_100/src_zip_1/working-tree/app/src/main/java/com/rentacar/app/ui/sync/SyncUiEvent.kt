package com.rentacar.app.ui.sync

sealed class SyncUiEvent {
    data object SyncStarted : SyncUiEvent()
    data class SyncCompletedSuccess(val hadItems: Boolean) : SyncUiEvent()
    data class SyncCompletedError(val message: String?) : SyncUiEvent()
    data object SyncAlreadyRunning : SyncUiEvent()
}

