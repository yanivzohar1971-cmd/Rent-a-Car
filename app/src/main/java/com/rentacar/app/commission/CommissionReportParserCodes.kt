package com.rentacar.app.commission

/**
 * Dedicated commission-report parser codes.
 * Separate from [com.rentacar.app.data.Supplier.importFunctionCode]
 * and [com.rentacar.app.data.PriceListImportFunctionCodes].
 */
object CommissionReportParserCodes {
    const val NONE: Int = 0
    const val SHAGRIR_EXCEL_V1: Int = 200

    data class ParserChoice(
        val code: Int,
        val version: Int,
        val label: String
    )

    val availableParsers: List<ParserChoice> = listOf(
        ParserChoice(
            code = SHAGRIR_EXCEL_V1,
            version = 1,
            label = "Shagrir Commission Excel V1"
        )
    )

    fun labelFor(code: Int, version: Int): String? =
        availableParsers.firstOrNull { it.code == code && it.version == version }?.label
}
