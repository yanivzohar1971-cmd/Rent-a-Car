package com.rentacar.app.ui.share

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircleOutline
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.DataObject
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Person
import androidx.compose.ui.graphics.vector.ImageVector
import com.rentacar.app.share.ShareLanguage
import com.rentacar.app.share.TemplateVariableIconKind
import com.rentacar.app.share.TemplateVariableRegistry
import com.rentacar.app.ui.dialogs.ModernSelectionItem

/**
 * Maps [TemplateVariableRegistry] entries to the existing [ModernSelectionItem] UI model.
 * Token names and localized labels stay in the registry; only ImageVector lives here.
 */
object TemplateVariableSelection {
    fun dialogTitle(language: ShareLanguage): String = when (language) {
        ShareLanguage.HE -> "הוסף שדה להזמנה"
        ShareLanguage.EN -> "Insert reservation field"
    }

    fun insertActionLabel(language: ShareLanguage): String = dialogTitle(language)

    fun insertHint(language: ShareLanguage): String = when (language) {
        ShareLanguage.HE -> "הצב את הסמן ולחץ להוספת שדה"
        ShareLanguage.EN -> "Place the cursor, then insert a field"
    }

    val headerIcon: ImageVector = Icons.Filled.AddCircleOutline

    val insertActionIcon: ImageVector = Icons.Filled.DataObject

    fun items(language: ShareLanguage): List<ModernSelectionItem> =
        TemplateVariableRegistry.ALL.map { variable ->
            ModernSelectionItem(
                key = variable.token,
                title = variable.displayName(language),
                icon = iconFor(variable.iconKind)
            )
        }

    fun iconFor(kind: TemplateVariableIconKind): ImageVector = when (kind) {
        TemplateVariableIconKind.CREDIT_HOLD -> Icons.Filled.CreditCard
        TemplateVariableIconKind.SUPPLIER -> Icons.Filled.Business
        TemplateVariableIconKind.BRANCH -> Icons.Filled.LocationOn
        TemplateVariableIconKind.CUSTOMER -> Icons.Filled.Person
        TemplateVariableIconKind.PRICE -> Icons.Filled.Payments
        TemplateVariableIconKind.CAR_TYPE -> Icons.Filled.DirectionsCar
    }
}
