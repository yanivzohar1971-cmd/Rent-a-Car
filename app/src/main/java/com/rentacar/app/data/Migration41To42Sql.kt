package com.rentacar.app.data

/**
 * Additive SQL for Room migration 41 → 42 (Sale form vehicle identifiers).
 * Adds nullable license_plate and vehicle_year to CarSale only.
 */
object Migration41To42Sql {
    val STATEMENTS: List<String> = listOf(
        "ALTER TABLE CarSale ADD COLUMN license_plate TEXT",
        "ALTER TABLE CarSale ADD COLUMN vehicle_year INTEGER"
    )

    const val TARGET_TABLE = "CarSale"
}
