package com.rentacar.app.data.sync

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Repository for managing sync progress state.
 * This is a singleton that can be accessed from both the sync worker and the UI.
 * 
 * The worker updates the state during sync, and the UI collects it to show progress.
 */
object SyncProgressRepository {
    private val _progressState = MutableStateFlow<SyncProgressState>(SyncProgressState.idle())
    val progressState: StateFlow<SyncProgressState> = _progressState.asStateFlow()
    
    /**
     * Update progress state. Called by the sync worker during sync operations.
     */
    fun updateProgress(state: SyncProgressState) {
        _progressState.value = state
    }
    
    /**
     * Reset progress to idle state. Called when sync starts or completes.
     */
    fun reset() {
        _progressState.value = SyncProgressState.idle()
    }
    
    /**
     * Helper to update specific fields while preserving others.
     */
    fun updateProgress(
        isRunning: Boolean? = null,
        currentTableIndex: Int? = null,
        totalTables: Int? = null,
        currentTableName: String? = null,
        currentTableItemIndex: Int? = null,
        currentTableItemTotal: Int? = null,
        overallProcessedItems: Int? = null,
        overallTotalItems: Int? = null,
        lastMessage: String? = null,
        isError: Boolean? = null
    ) {
        val current = _progressState.value
        val newState = current.copy(
            isRunning = isRunning ?: current.isRunning,
            currentTableIndex = currentTableIndex ?: current.currentTableIndex,
            totalTables = totalTables ?: current.totalTables,
            currentTableName = currentTableName ?: current.currentTableName,
            currentTableItemIndex = currentTableItemIndex ?: current.currentTableItemIndex,
            currentTableItemTotal = currentTableItemTotal ?: current.currentTableItemTotal,
            overallProcessedItems = overallProcessedItems ?: current.overallProcessedItems,
            overallTotalItems = overallTotalItems ?: current.overallTotalItems,
            tablePercent = calculateTablePercent(
                currentTableItemIndex ?: current.currentTableItemIndex,
                currentTableItemTotal ?: current.currentTableItemTotal
            ),
            overallPercent = calculateOverallPercent(
                overallProcessedItems ?: current.overallProcessedItems,
                overallTotalItems ?: current.overallTotalItems
            ),
            lastMessage = lastMessage ?: current.lastMessage,
            isError = isError ?: current.isError
        )
        _progressState.value = newState
    }
    
    private fun calculateTablePercent(current: Int, total: Int): Float {
        return if (total > 0) (current.toFloat() / total.toFloat()).coerceIn(0f, 1f) else 0f
    }
    
    private fun calculateOverallPercent(processed: Int, total: Int): Float {
        return if (total > 0) (processed.toFloat() / total.toFloat()).coerceIn(0f, 1f) else 0f
    }
}

