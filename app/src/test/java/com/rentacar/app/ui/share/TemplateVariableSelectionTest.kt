package com.rentacar.app.ui.share

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.DataObject
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Person
import com.rentacar.app.share.ShareLanguage
import com.rentacar.app.share.TemplateVariableIconKind
import com.rentacar.app.share.TemplateVariableRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TemplateVariableSelectionTest {

    @Test
    fun items_comeOnlyFromCentralRegistry() {
        val he = TemplateVariableSelection.items(ShareLanguage.HE)
        val en = TemplateVariableSelection.items(ShareLanguage.EN)
        assertEquals(TemplateVariableRegistry.ALL.map { it.token }, he.map { it.key })
        assertEquals(TemplateVariableRegistry.ALL.map { it.token }, en.map { it.key })
        assertEquals(TemplateVariableRegistry.ALL.map { it.displayName(ShareLanguage.HE) }, he.map { it.title })
        assertEquals(TemplateVariableRegistry.ALL.map { it.displayName(ShareLanguage.EN) }, en.map { it.title })
        assertEquals(6, he.size)
        assertEquals(he.size, TemplateVariableRegistry.ALL.size)
    }

    @Test
    fun icons_remainMappedFromRegistryKinds() {
        val items = TemplateVariableSelection.items(ShareLanguage.EN)
        val byToken = items.associate { it.key to it.icon }
        assertEquals(Icons.Filled.CreditCard, byToken["HOLD_AMOUNT"])
        assertEquals(Icons.Filled.Business, byToken["SUPPLIER"])
        assertEquals(Icons.Filled.LocationOn, byToken["BRANCH"])
        assertEquals(Icons.Filled.Person, byToken["CUSTOMER"])
        assertEquals(Icons.Filled.Payments, byToken["PRICE"])
        assertEquals(Icons.Filled.DirectionsCar, byToken["CAR_TYPE"])
        assertEquals(
            TemplateVariableIconKind.entries.toSet(),
            TemplateVariableRegistry.ALL.map { it.iconKind }.toSet()
        )
        TemplateVariableRegistry.ALL.forEach { variable ->
            assertEquals(TemplateVariableSelection.iconFor(variable.iconKind), byToken[variable.token])
        }
    }

    @Test
    fun dialogAndInsertAction_useSharedLocalizedLabels() {
        assertEquals("הוסף שדה להזמנה", TemplateVariableSelection.dialogTitle(ShareLanguage.HE))
        assertEquals("Insert reservation field", TemplateVariableSelection.dialogTitle(ShareLanguage.EN))
        assertEquals(
            TemplateVariableSelection.dialogTitle(ShareLanguage.HE),
            TemplateVariableSelection.insertActionLabel(ShareLanguage.HE)
        )
        assertEquals(
            TemplateVariableSelection.dialogTitle(ShareLanguage.EN),
            TemplateVariableSelection.insertActionLabel(ShareLanguage.EN)
        )
        assertEquals(Icons.Filled.DataObject, TemplateVariableSelection.insertActionIcon)
    }

    @Test
    fun selectorDoesNotIntroduceADuplicateHardcodedVariableList() {
        val keys = TemplateVariableSelection.items(ShareLanguage.HE).map { it.key }
        assertEquals(TemplateVariableRegistry.ALL.map { it.token }, keys)
        assertTrue(keys.none { it.contains("{") })
        assertEquals(keys.toSet().size, keys.size)
    }
}
