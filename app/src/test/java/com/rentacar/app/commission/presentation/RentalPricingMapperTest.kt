package com.rentacar.app.commission.presentation

import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import com.rentacar.app.data.SupplierPriceListItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RentalPricingMapperTest {

    @Test
    fun monthlyRental_showsMonthlyPriceLabel() {
        val p = RentalPricingMapper.build(
            supplierRevenueExVatText = "3000",
            reservation = reservation(period = 30, agreed = 3000.0),
            priceListItem = priceItem(monthly = 2500.0),
            priceListMatchedPeriod = true,
            applicationCommissionPercentText = "7"
        )
        assertEquals(TariffBasisKind.MONTHLY, p.tariffBasis)
        assertEquals("מחיר חודשי", p.unitPriceLabelHebrew)
        assertNotNull(p.monthlyPriceFormatted)
    }

    @Test
    fun weeklyRental_showsWeeklyPrice() {
        val p = RentalPricingMapper.build(
            supplierRevenueExVatText = "800",
            reservation = reservation(period = 7, agreed = 900.0),
            priceListItem = priceItem(weekly = 850.0),
            priceListMatchedPeriod = true,
            applicationCommissionPercentText = "7"
        )
        assertEquals(TariffBasisKind.WEEKLY, p.tariffBasis)
        assertEquals("מחיר שבועי", p.unitPriceLabelHebrew)
    }

    @Test
    fun dailyRental_showsDailyPrice() {
        val p = RentalPricingMapper.build(
            supplierRevenueExVatText = "200",
            reservation = reservation(period = 1, agreed = 220.0),
            priceListItem = priceItem(daily = 210.0),
            priceListMatchedPeriod = true,
            applicationCommissionPercentText = "7"
        )
        assertEquals(TariffBasisKind.DAILY, p.tariffBasis)
        assertEquals("מחיר יומי", p.unitPriceLabelHebrew)
    }

    @Test
    fun revenueAndCommissionGaps_areSeparate() {
        val p = RentalPricingMapper.build(
            supplierRevenueExVatText = "2810",
            reservation = reservation(period = 30, agreed = 2000.0),
            priceListItem = null,
            priceListMatchedPeriod = false,
            applicationCommissionPercentText = "7"
        )
        assertNotNull(p.supplierRevenueExVat)
        assertNotNull(p.applicationRentalRevenueExVat)
        assertNotNull(p.revenueDifference)
        assertTrue(p.revenueDifference!!.abs().value.toDouble() > 0)
        // Unproven transition suspicion for monthly + revenue mismatch
        assertTrue(p.pricingNeedsReview)
        assertEquals("חשד לשינוי תעריף — דורש בדיקה", p.tariffTransitionHebrew)
    }

    @Test
    fun missingPrice_doesNotInventValue() {
        val p = RentalPricingMapper.build(
            supplierRevenueExVatText = null,
            reservation = null,
            priceListItem = null,
            priceListMatchedPeriod = false,
            applicationCommissionPercentText = null
        )
        assertEquals(PriceSourceKind.MISSING, p.priceSource)
        assertNull(p.unitPriceFormatted)
        assertTrue(p.pricingNeedsReview)
    }

    @Test
    fun agreedPrice_preferredOverPriceList() {
        val p = RentalPricingMapper.build(
            supplierRevenueExVatText = "1000",
            reservation = reservation(period = 30, agreed = 1500.0),
            priceListItem = priceItem(monthly = 9999.0),
            priceListMatchedPeriod = true,
            applicationCommissionPercentText = "7"
        )
        assertEquals(PriceSourceKind.RESERVATION_AGREED_PRICE, p.priceSource)
        assertFalse(p.priceSource == PriceSourceKind.PRICE_LIST_CURRENT_ESTIMATE)
    }

    private fun reservation(period: Int, agreed: Double) = Reservation(
        id = 1,
        customerId = 1,
        supplierId = 1,
        branchId = 1,
        agentId = null,
        carTypeId = 1,
        dateFrom = 1L,
        dateTo = 2L,
        agreedPrice = agreed,
        includeVat = false,
        kmIncluded = 0,
        requiredHoldAmount = 0,
        periodTypeDays = period,
        status = ReservationStatus.Confirmed,
        userUid = "uid"
    )

    private fun priceItem(
        daily: Double? = null,
        weekly: Double? = null,
        monthly: Double? = null
    ) = SupplierPriceListItem(
        id = 1,
        headerId = 1,
        supplierId = 1,
        carGroupCode = null,
        carGroupName = null,
        manufacturer = null,
        model = null,
        dailyPriceNis = daily,
        weeklyPriceNis = weekly,
        monthlyPriceNis = monthly,
        dailyPriceUsd = null,
        weeklyPriceUsd = null,
        monthlyPriceUsd = null,
        shabbatInsuranceNis = null,
        shabbatInsuranceUsd = null,
        includedKmPerDay = null,
        includedKmPerWeek = null,
        includedKmPerMonth = null,
        extraKmPriceNis = null,
        extraKmPriceUsd = null,
        deductibleNis = null,
        userUid = "uid"
    )
}
