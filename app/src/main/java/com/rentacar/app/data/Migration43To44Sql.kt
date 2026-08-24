package com.rentacar.app.data

/**
 * Additive SQL for Room migration 43 → 44 (per-supplier customer reservation terms).
 *
 * Existing reservation/supplier/customer/payment rows are not rewritten.
 * New tables start empty so every supplier uses application default terms
 * until the user saves a customization.
 */
object Migration43To44Sql {
    const val TABLE_TERM = "supplier_customer_term"
    const val TABLE_CUSTOMIZATION = "supplier_customer_terms_customization"

    val NEW_TABLES: List<String> = listOf(TABLE_TERM, TABLE_CUSTOMIZATION)

    val STATEMENTS: List<String> = listOf(
        """
        CREATE TABLE IF NOT EXISTS `supplier_customer_term` (
            `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            `supplier_id` INTEGER NOT NULL,
            `language` TEXT NOT NULL,
            `sort_order` INTEGER NOT NULL,
            `text_template` TEXT NOT NULL,
            `enabled` INTEGER NOT NULL,
            `bold` INTEGER NOT NULL,
            `text_color_argb` INTEGER,
            `created_at` INTEGER NOT NULL,
            `updated_at` INTEGER NOT NULL,
            `user_uid` TEXT,
            FOREIGN KEY(`supplier_id`) REFERENCES `Supplier`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
        )
        """.trimIndent(),
        "CREATE INDEX IF NOT EXISTS `index_supplier_customer_term_supplier_id_language_user_uid_sort_order` ON `supplier_customer_term` (`supplier_id`, `language`, `user_uid`, `sort_order`)",
        "CREATE INDEX IF NOT EXISTS `index_supplier_customer_term_supplier_id_language_user_uid` ON `supplier_customer_term` (`supplier_id`, `language`, `user_uid`)",
        "CREATE INDEX IF NOT EXISTS `index_supplier_customer_term_supplier_id` ON `supplier_customer_term` (`supplier_id`)",
        "CREATE INDEX IF NOT EXISTS `index_supplier_customer_term_user_uid` ON `supplier_customer_term` (`user_uid`)",

        """
        CREATE TABLE IF NOT EXISTS `supplier_customer_terms_customization` (
            `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            `supplier_id` INTEGER NOT NULL,
            `language` TEXT NOT NULL,
            `updated_at` INTEGER NOT NULL,
            `user_uid` TEXT,
            FOREIGN KEY(`supplier_id`) REFERENCES `Supplier`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
        )
        """.trimIndent(),
        "CREATE UNIQUE INDEX IF NOT EXISTS `index_supplier_customer_terms_customization_supplier_id_language_user_uid` ON `supplier_customer_terms_customization` (`supplier_id`, `language`, `user_uid`)",
        "CREATE INDEX IF NOT EXISTS `index_supplier_customer_terms_customization_supplier_id` ON `supplier_customer_terms_customization` (`supplier_id`)",
        "CREATE INDEX IF NOT EXISTS `index_supplier_customer_terms_customization_user_uid` ON `supplier_customer_terms_customization` (`user_uid`)"
    )
}
