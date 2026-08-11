package com.rentacar.app.sync

import com.rentacar.app.domain.CommissionBusinessDates

/**
 * Resolves [com.rentacar.app.data.Reservation.actualReturnDate] from supplier import rows.
 *
 * Safeguards:
 * - Never clear an existing actual return date when a later open report has no end date.
 * - Overwrite an existing date only when the incoming closed report is newer (by import time),
 *   authoritative (closed status with contract end date), and carries a different business date.
 */
object SupplierActualReturnDateResolver {

    fun resolve(
        isClosedDeal: Boolean,
        contractEndDate: Long?,
        existingActualReturnDate: Long?,
        dealImportedAtUtc: Long,
        reservationUpdatedAt: Long
    ): Long? {
        if (!isClosedDeal || contractEndDate == null) {
            return existingActualReturnDate
        }
        if (existingActualReturnDate == null) {
            return contractEndDate
        }

        val existingDate = CommissionBusinessDates.toLocalDate(existingActualReturnDate)
        val incomingDate = CommissionBusinessDates.toLocalDate(contractEndDate)
        if (incomingDate == existingDate) {
            return existingActualReturnDate
        }

        return if (dealImportedAtUtc >= reservationUpdatedAt) {
            contractEndDate
        } else {
            existingActualReturnDate
        }
    }
}
