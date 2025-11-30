package com.rentacar.app.prefs

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private const val PREFS_NAME = "settings"
val Context.dataStore by preferencesDataStore(name = PREFS_NAME)

object SettingsKeys {
    val defaultHold = intPreferencesKey("default_hold")
    val defaultSupplierName = stringPreferencesKey("default_supplier_name")
    val buttonColor = stringPreferencesKey("button_color_hex")
    val titleColor = stringPreferencesKey("title_color_hex")
    val titleTextColor = stringPreferencesKey("title_text_color_hex")
    val backButtonColor = stringPreferencesKey("back_button_color_hex")
    val customerPrivateColor = stringPreferencesKey("customer_private_color_hex")
    val customerCompanyColor = stringPreferencesKey("customer_company_color_hex")
    val titleIconCircleEnabled = booleanPreferencesKey("title_icon_circle_enabled")
    val titleIconCircleColor = stringPreferencesKey("title_icon_circle_color_hex")
    val reservationIconFutureColor = stringPreferencesKey("reservation_icon_future_color_hex")
    val reservationIconTodayColor = stringPreferencesKey("reservation_icon_today_color_hex")
    val reservationIconPastColor = stringPreferencesKey("reservation_icon_past_color_hex")
    val reservationIconClosedColor = stringPreferencesKey("reservation_icon_closed_color_hex")
    val commissionDays1to6 = stringPreferencesKey("commission_days_1_6_pct")
    val commissionDays7to23 = stringPreferencesKey("commission_days_7_23_pct")
    val commissionDays24plus = stringPreferencesKey("commission_days_24_plus_pct")
    val commissionExtraPer30 = stringPreferencesKey("commission_extra_per_30_pct")
    val tooltipDurationMs = intPreferencesKey("tooltip_duration_ms")
    val tooltipShowOnlyOnce = booleanPreferencesKey("tooltip_show_only_once")
    val tooltipCloseOnClick = booleanPreferencesKey("tooltip_close_on_click")
    val seenTooltipDashboardSuppliers = booleanPreferencesKey("seen_tooltip_dashboard_suppliers")
    val seenTooltipSuppliersAdd = booleanPreferencesKey("seen_tooltip_suppliers_add")
    val tooltipsEnabled = booleanPreferencesKey("tooltips_enabled")
    // Custom decimal setting (format ##.#)
    val decimalOnePlace = stringPreferencesKey("decimal_one_place")
    // Screenshot policy: false = blocked (FLAG_SECURE), true = allowed
    val allowScreenshots = booleanPreferencesKey("allow_screenshots")
}

class SettingsStore(private val context: Context) {
    fun defaultHold(): Flow<Int> = context.dataStore.data.map { it[SettingsKeys.defaultHold] ?: 2000 }
    suspend fun setDefaultHold(value: Int) {
        context.dataStore.edit { prefs ->
            prefs[SettingsKeys.defaultHold] = value
        }
    }

    fun defaultSupplierName(): Flow<String?> = context.dataStore.data.map { it[SettingsKeys.defaultSupplierName] }
    suspend fun setDefaultSupplierName(value: String?) {
        context.dataStore.edit { prefs ->
            if (value.isNullOrBlank()) {
                prefs.remove(SettingsKeys.defaultSupplierName)
            } else {
                prefs[SettingsKeys.defaultSupplierName] = value
            }
        }
    }

    fun buttonColor(): Flow<String> = context.dataStore.data.map { it[SettingsKeys.buttonColor] ?: "#2196F3" }
    suspend fun setButtonColor(hex: String) {
        context.dataStore.edit { prefs ->
            prefs[SettingsKeys.buttonColor] = hex
        }
    }

    fun titleColor(): Flow<String> = context.dataStore.data.map { it[SettingsKeys.titleColor] ?: "#2196F3" }
    suspend fun setTitleColor(hex: String) {
        context.dataStore.edit { prefs ->
            prefs[SettingsKeys.titleColor] = hex
        }
    }

    fun titleTextColor(): Flow<String> = context.dataStore.data.map { it[SettingsKeys.titleTextColor] ?: "#FFFFFF" }
    suspend fun setTitleTextColor(hex: String) {
        context.dataStore.edit { prefs ->
            prefs[SettingsKeys.titleTextColor] = hex
        }
    }

    fun backButtonColor(): Flow<String> = context.dataStore.data.map { it[SettingsKeys.backButtonColor] ?: "#9E9E9E" }
    suspend fun setBackButtonColor(hex: String) {
        context.dataStore.edit { prefs ->
            prefs[SettingsKeys.backButtonColor] = hex
        }
    }

    fun customerPrivateColor(): Flow<String> = context.dataStore.data.map { it[SettingsKeys.customerPrivateColor] ?: "#2196F3" }
    suspend fun setCustomerPrivateColor(hex: String) {
        context.dataStore.edit { prefs ->
            prefs[SettingsKeys.customerPrivateColor] = hex
        }
    }

    fun customerCompanyColor(): Flow<String> = context.dataStore.data.map { it[SettingsKeys.customerCompanyColor] ?: "#4CAF50" }
    suspend fun setCustomerCompanyColor(hex: String) {
        context.dataStore.edit { prefs ->
            prefs[SettingsKeys.customerCompanyColor] = hex
        }
    }

    fun titleIconCircleEnabled(): Flow<Boolean> = context.dataStore.data.map { it[SettingsKeys.titleIconCircleEnabled] ?: false }
    suspend fun setTitleIconCircleEnabled(enabled: Boolean) {
        context.dataStore.edit { prefs ->
            prefs[SettingsKeys.titleIconCircleEnabled] = enabled
        }
    }

    fun titleIconCircleColor(): Flow<String> = context.dataStore.data.map { it[SettingsKeys.titleIconCircleColor] ?: "#33000000" }
    suspend fun setTitleIconCircleColor(hex: String) {
        context.dataStore.edit { prefs ->
            prefs[SettingsKeys.titleIconCircleColor] = hex
        }
    }

    fun reservationIconFutureColor(): Flow<String> = context.dataStore.data.map { it[SettingsKeys.reservationIconFutureColor] ?: "#2196F3" }
    suspend fun setReservationIconFutureColor(hex: String) {
        context.dataStore.edit { prefs ->
            prefs[SettingsKeys.reservationIconFutureColor] = hex
        }
    }

    fun reservationIconTodayColor(): Flow<String> = context.dataStore.data.map { it[SettingsKeys.reservationIconTodayColor] ?: "#4CAF50" }
    suspend fun setReservationIconTodayColor(hex: String) {
        context.dataStore.edit { prefs ->
            prefs[SettingsKeys.reservationIconTodayColor] = hex
        }
    }

    fun reservationIconPastColor(): Flow<String> = context.dataStore.data.map { it[SettingsKeys.reservationIconPastColor] ?: "#9E9E9E" }
    suspend fun setReservationIconPastColor(hex: String) {
        context.dataStore.edit { prefs ->
            prefs[SettingsKeys.reservationIconPastColor] = hex
        }
    }

    fun reservationIconClosedColor(): Flow<String> = context.dataStore.data.map { it[SettingsKeys.reservationIconClosedColor] ?: "#795548" }
    suspend fun setReservationIconClosedColor(hex: String) {
        context.dataStore.edit { prefs -> prefs[SettingsKeys.reservationIconClosedColor] = hex }
    }

    // Commission rules as percent values (e.g., "15" for 15%)
    fun commissionDays1to6(): Flow<String> = context.dataStore.data.map { it[SettingsKeys.commissionDays1to6] ?: "15" }
    suspend fun setCommissionDays1to6(valuePercent: String) {
        context.dataStore.edit { prefs -> prefs[SettingsKeys.commissionDays1to6] = valuePercent }
    }
    fun commissionDays7to23(): Flow<String> = context.dataStore.data.map { it[SettingsKeys.commissionDays7to23] ?: "10" }
    suspend fun setCommissionDays7to23(valuePercent: String) {
        context.dataStore.edit { prefs -> prefs[SettingsKeys.commissionDays7to23] = valuePercent }
    }
    fun commissionDays24plus(): Flow<String> = context.dataStore.data.map { it[SettingsKeys.commissionDays24plus] ?: "7" }
    suspend fun setCommissionDays24plus(valuePercent: String) {
        context.dataStore.edit { prefs -> prefs[SettingsKeys.commissionDays24plus] = valuePercent }
    }
    fun commissionExtraPer30(): Flow<String> = context.dataStore.data.map { it[SettingsKeys.commissionExtraPer30] ?: "7" }
    suspend fun setCommissionExtraPer30(valuePercent: String) {
        context.dataStore.edit { prefs -> prefs[SettingsKeys.commissionExtraPer30] = valuePercent }
    }

    fun tooltipDurationMs(): Flow<Int> = context.dataStore.data.map { it[SettingsKeys.tooltipDurationMs] ?: 10_000 }
    suspend fun setTooltipDurationMs(value: Int) { context.dataStore.edit { it[SettingsKeys.tooltipDurationMs] = value } }

    fun tooltipShowOnlyOnce(): Flow<Boolean> = context.dataStore.data.map { it[SettingsKeys.tooltipShowOnlyOnce] ?: false }
    suspend fun setTooltipShowOnlyOnce(value: Boolean) { context.dataStore.edit { it[SettingsKeys.tooltipShowOnlyOnce] = value } }

    fun tooltipCloseOnClick(): Flow<Boolean> = context.dataStore.data.map { it[SettingsKeys.tooltipCloseOnClick] ?: true }
    suspend fun setTooltipCloseOnClick(value: Boolean) { context.dataStore.edit { it[SettingsKeys.tooltipCloseOnClick] = value } }

    fun seenTooltipDashboardSuppliers(): Flow<Boolean> = context.dataStore.data.map { it[SettingsKeys.seenTooltipDashboardSuppliers] ?: false }
    suspend fun setSeenTooltipDashboardSuppliers(value: Boolean) { context.dataStore.edit { it[SettingsKeys.seenTooltipDashboardSuppliers] = value } }

    fun seenTooltipSuppliersAdd(): Flow<Boolean> = context.dataStore.data.map { it[SettingsKeys.seenTooltipSuppliersAdd] ?: false }
    suspend fun setSeenTooltipSuppliersAdd(value: Boolean) { context.dataStore.edit { it[SettingsKeys.seenTooltipSuppliersAdd] = value } }

    fun tooltipsEnabled(): Flow<Boolean> = context.dataStore.data.map { it[SettingsKeys.tooltipsEnabled] ?: false }
    suspend fun setTooltipsEnabled(value: Boolean) { context.dataStore.edit { it[SettingsKeys.tooltipsEnabled] = value } }

    // Decimal value with up to two integer digits and one decimal place (##.#)
    fun decimalOnePlace(): Flow<String> = context.dataStore.data.map { it[SettingsKeys.decimalOnePlace] ?: "" }
    suspend fun setDecimalOnePlace(value: String) {
        context.dataStore.edit { prefs ->
            if (value.isBlank()) prefs.remove(SettingsKeys.decimalOnePlace) else prefs[SettingsKeys.decimalOnePlace] = value
        }
    }

    // Screenshot policy: false = blocked (default), true = allowed
    fun allowScreenshots(): Flow<Boolean> = context.dataStore.data.map { it[SettingsKeys.allowScreenshots] ?: false }
    suspend fun setAllowScreenshots(allowed: Boolean) {
        context.dataStore.edit { prefs ->
            prefs[SettingsKeys.allowScreenshots] = allowed
        }
    }
}


