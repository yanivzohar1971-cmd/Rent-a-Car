package com.rentacar.app.ui.alignment

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.CarSaleRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

/**
 * Settings action "יישור קו עמלות" — preview then transactional align.
 */
class CommissionAlignmentViewModel(
    private val carSaleRepository: CarSaleRepository
) : ViewModel() {

    sealed interface State {
        data object Idle : State
        data object LoadingPreview : State
        data class Preview(
            val saleCount: Int,
            val totalAmount: Double,
            val alreadyAligned: Boolean
        ) : State
        data object Aligning : State
        data class Success(val saleCount: Int, val totalAmount: Double) : State
        data class Error(val message: String) : State
    }

    private val _state = MutableStateFlow<State>(State.Idle)
    val state: StateFlow<State> = _state.asStateFlow()

    fun onAlignClicked() {
        if (_state.value is State.LoadingPreview || _state.value is State.Aligning) return
        viewModelScope.launch {
            _state.value = State.LoadingPreview
            try {
                val preview = carSaleRepository.previewCommissionAlignment()
                _state.value = if (!preview.hasWork) {
                    State.Preview(saleCount = 0, totalAmount = 0.0, alreadyAligned = true)
                } else {
                    State.Preview(
                        saleCount = preview.saleCount,
                        totalAmount = preview.totalAmount,
                        alreadyAligned = false
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Commission alignment preview failed", e)
                _state.value = State.Error(e.message ?: "שגיאה בטעינת תצוגה מקדימה")
            }
        }
    }

    fun confirmAlign() {
        val preview = _state.value as? State.Preview ?: return
        if (preview.alreadyAligned) return
        viewModelScope.launch {
            _state.value = State.Aligning
            try {
                val result = carSaleRepository.alignCommissionPayments()
                _state.value = State.Success(
                    saleCount = result.saleCount,
                    totalAmount = result.totalAmount
                )
            } catch (e: Exception) {
                Log.e(TAG, "Commission alignment failed", e)
                _state.value = State.Error(e.message ?: "שגיאה ביישור העמלות")
            }
        }
    }

    fun dismiss() {
        _state.value = State.Idle
    }

    companion object {
        private const val TAG = "CommissionAlignment"

        fun formatIls(amount: Double): String {
            val nf = NumberFormat.getNumberInstance(Locale("he", "IL")).apply {
                maximumFractionDigits = if (amount % 1.0 == 0.0) 0 else 2
                minimumFractionDigits = 0
                isGroupingUsed = true
            }
            return "₪${nf.format(amount)}"
        }
    }
}
