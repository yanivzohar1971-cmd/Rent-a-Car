package com.rentacar.app.data

/**
 * Price list import function codes.
 * These codes determine which price list import strategy to use for a supplier.
 */
object PriceListImportFunctionCodes {
    const val NONE: Int = 0
    const val PRI_EXCEL_2025: Int = 100  // Excel price list import for Pri (matches PriceListImportDispatcher)
    
    // TODO: Add more price list import functions for other suppliers as needed
}

