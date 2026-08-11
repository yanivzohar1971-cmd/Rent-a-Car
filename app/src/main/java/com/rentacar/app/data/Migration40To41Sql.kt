package com.rentacar.app.data

/**
 * Additive SQL for Room migration 40 → 41 (car sale commission payments).
 * Exposed for unit tests that assert non-destructive additive DDL.
 *
 * Creates [car_sale_commission_payment] only. Does not alter CarSale or any
 * existing business table. No DROP / destructive ALTER.
 */
object Migration40To41Sql {
    val STATEMENTS: List<String> = listOf(
        """
        CREATE TABLE IF NOT EXISTS `car_sale_commission_payment` (
            `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            `car_sale_id` INTEGER NOT NULL,
            `amount` REAL NOT NULL,
            `payment_date` INTEGER NOT NULL,
            `created_at` INTEGER NOT NULL,
            `updated_at` INTEGER NOT NULL,
            `user_uid` TEXT NOT NULL,
            FOREIGN KEY(`car_sale_id`) REFERENCES `CarSale`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
        )
        """.trimIndent(),
        "CREATE INDEX IF NOT EXISTS `index_car_sale_commission_payment_car_sale_id` ON `car_sale_commission_payment` (`car_sale_id`)",
        "CREATE INDEX IF NOT EXISTS `index_car_sale_commission_payment_user_uid` ON `car_sale_commission_payment` (`user_uid`)",
        "CREATE INDEX IF NOT EXISTS `index_car_sale_commission_payment_car_sale_id_user_uid` ON `car_sale_commission_payment` (`car_sale_id`, `user_uid`)"
    )

    val NEW_TABLES = listOf("car_sale_commission_payment")
}
