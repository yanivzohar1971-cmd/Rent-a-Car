package com.rentacar.app.commission.parser

import com.rentacar.app.commission.domain.CommissionReportParseContext
import com.rentacar.app.commission.domain.CommissionReportParseResult
import org.apache.poi.ss.usermodel.Workbook

/**
 * Supplier-specific commission report parser strategy.
 * Selected via [com.rentacar.app.data.SupplierCommissionImportConfig], never by hard-coded supplier ID.
 */
interface SupplierCommissionReportParser {
    val parserCode: Int
    val parserVersion: Int
    val displayName: String

    fun canParse(workbook: Workbook): Boolean

    fun parse(
        workbook: Workbook,
        context: CommissionReportParseContext
    ): CommissionReportParseResult
}
