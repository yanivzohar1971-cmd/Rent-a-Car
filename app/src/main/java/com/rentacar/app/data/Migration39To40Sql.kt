package com.rentacar.app.data

/**
 * Additive SQL for Room migration 39 → 40 (commission reconciliation).
 * Exposed for unit tests that assert non-destructive additive DDL.
 */
object Migration39To40Sql {
    val STATEMENTS: List<String> = listOf(
        """
        CREATE TABLE IF NOT EXISTS `supplier_commission_import_config` (
            `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            `supplier_id` INTEGER NOT NULL,
            `parser_code` INTEGER NOT NULL,
            `parser_version` INTEGER NOT NULL,
            `is_active` INTEGER NOT NULL,
            `created_at` INTEGER NOT NULL,
            `updated_at` INTEGER NOT NULL,
            `user_uid` TEXT NOT NULL,
            FOREIGN KEY(`supplier_id`) REFERENCES `Supplier`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
        )
        """.trimIndent(),
        "CREATE UNIQUE INDEX IF NOT EXISTS `index_supplier_commission_import_config_supplier_id_user_uid` ON `supplier_commission_import_config` (`supplier_id`, `user_uid`)",
        "CREATE INDEX IF NOT EXISTS `index_supplier_commission_import_config_user_uid` ON `supplier_commission_import_config` (`user_uid`)",
        "CREATE INDEX IF NOT EXISTS `index_supplier_commission_import_config_parser_code_parser_version` ON `supplier_commission_import_config` (`parser_code`, `parser_version`)",

        """
        CREATE TABLE IF NOT EXISTS `supplier_commission_report_import` (
            `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            `supplier_id` INTEGER NOT NULL,
            `report_year` INTEGER NOT NULL,
            `report_month` INTEGER NOT NULL,
            `departure_cutoff_date` INTEGER NOT NULL,
            `source_file_name` TEXT NOT NULL,
            `file_hash` TEXT NOT NULL,
            `parser_code` INTEGER NOT NULL,
            `parser_version` INTEGER NOT NULL,
            `raw_row_count` INTEGER NOT NULL,
            `normalized_group_count` INTEGER NOT NULL,
            `supplier_revenue_total` TEXT NOT NULL,
            `supplier_commission_total` TEXT NOT NULL,
            `internal_commission_total` TEXT NOT NULL,
            `deviation_total` TEXT NOT NULL,
            `status` TEXT NOT NULL,
            `imported_at` INTEGER NOT NULL,
            `approved_at` INTEGER,
            `user_uid` TEXT NOT NULL,
            FOREIGN KEY(`supplier_id`) REFERENCES `Supplier`(`id`) ON UPDATE NO ACTION ON DELETE RESTRICT
        )
        """.trimIndent(),
        "CREATE INDEX IF NOT EXISTS `index_supplier_commission_report_import_supplier_id_user_uid` ON `supplier_commission_report_import` (`supplier_id`, `user_uid`)",
        "CREATE INDEX IF NOT EXISTS `index_supplier_commission_report_import_supplier_id_file_hash_user_uid` ON `supplier_commission_report_import` (`supplier_id`, `file_hash`, `user_uid`)",
        "CREATE INDEX IF NOT EXISTS `index_supplier_commission_report_import_report_year_report_month` ON `supplier_commission_report_import` (`report_year`, `report_month`)",
        "CREATE INDEX IF NOT EXISTS `index_supplier_commission_report_import_status` ON `supplier_commission_report_import` (`status`)",
        "CREATE INDEX IF NOT EXISTS `index_supplier_commission_report_import_user_uid` ON `supplier_commission_report_import` (`user_uid`)",
        "CREATE INDEX IF NOT EXISTS `index_supplier_commission_report_import_imported_at` ON `supplier_commission_report_import` (`imported_at`)",

        """
        CREATE TABLE IF NOT EXISTS `supplier_commission_report_line` (
            `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            `import_id` INTEGER NOT NULL,
            `source_row_number` INTEGER NOT NULL,
            `order_number` TEXT NOT NULL,
            `invoice_number` TEXT NOT NULL,
            `total_days` INTEGER NOT NULL,
            `customer_name` TEXT NOT NULL,
            `revenue_ex_vat` TEXT NOT NULL,
            `commission_percent` TEXT NOT NULL,
            `commission_amount` TEXT NOT NULL,
            `agent_name` TEXT NOT NULL,
            `normalized_group_key` TEXT NOT NULL,
            `row_hash` TEXT NOT NULL,
            `user_uid` TEXT NOT NULL,
            FOREIGN KEY(`import_id`) REFERENCES `supplier_commission_report_import`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
        )
        """.trimIndent(),
        "CREATE INDEX IF NOT EXISTS `index_supplier_commission_report_line_import_id_user_uid` ON `supplier_commission_report_line` (`import_id`, `user_uid`)",
        "CREATE INDEX IF NOT EXISTS `index_supplier_commission_report_line_normalized_group_key` ON `supplier_commission_report_line` (`normalized_group_key`)",
        "CREATE INDEX IF NOT EXISTS `index_supplier_commission_report_line_order_number` ON `supplier_commission_report_line` (`order_number`)",
        "CREATE INDEX IF NOT EXISTS `index_supplier_commission_report_line_row_hash_user_uid` ON `supplier_commission_report_line` (`row_hash`, `user_uid`)",
        "CREATE INDEX IF NOT EXISTS `index_supplier_commission_report_line_user_uid` ON `supplier_commission_report_line` (`user_uid`)",
        "CREATE UNIQUE INDEX IF NOT EXISTS `index_supplier_commission_report_line_import_id_source_row_number` ON `supplier_commission_report_line` (`import_id`, `source_row_number`)",

        """
        CREATE TABLE IF NOT EXISTS `commission_reconciliation_item` (
            `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            `import_id` INTEGER NOT NULL,
            `supplier_id` INTEGER NOT NULL,
            `normalized_group_key` TEXT,
            `reservation_id` INTEGER,
            `internal_event_id` TEXT,
            `supplier_order_number` TEXT,
            `supplier_invoice_number` TEXT,
            `supplier_customer_name` TEXT,
            `supplier_days` INTEGER,
            `supplier_revenue` TEXT,
            `supplier_percent` TEXT,
            `supplier_commission` TEXT,
            `internal_period_start` INTEGER,
            `internal_period_end` INTEGER,
            `internal_days` INTEGER,
            `internal_percent` TEXT,
            `internal_commission` TEXT,
            `deviation` TEXT,
            `match_status` TEXT NOT NULL,
            `lifecycle_classification` TEXT NOT NULL,
            `proposed_actual_return_date` INTEGER,
            `approval_state` TEXT NOT NULL,
            `approved_at` INTEGER,
            `notes` TEXT,
            `explanation` TEXT,
            `app_customer_name` TEXT,
            `app_supplier_order_number` TEXT,
            `app_date_from` INTEGER,
            `app_actual_return_date` INTEGER,
            `event_type` TEXT,
            `user_uid` TEXT NOT NULL,
            FOREIGN KEY(`import_id`) REFERENCES `supplier_commission_report_import`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
            FOREIGN KEY(`supplier_id`) REFERENCES `Supplier`(`id`) ON UPDATE NO ACTION ON DELETE RESTRICT
        )
        """.trimIndent(),
        "CREATE INDEX IF NOT EXISTS `index_commission_reconciliation_item_import_id_user_uid` ON `commission_reconciliation_item` (`import_id`, `user_uid`)",
        "CREATE INDEX IF NOT EXISTS `index_commission_reconciliation_item_supplier_id_user_uid` ON `commission_reconciliation_item` (`supplier_id`, `user_uid`)",
        "CREATE INDEX IF NOT EXISTS `index_commission_reconciliation_item_reservation_id` ON `commission_reconciliation_item` (`reservation_id`)",
        "CREATE INDEX IF NOT EXISTS `index_commission_reconciliation_item_match_status` ON `commission_reconciliation_item` (`match_status`)",
        "CREATE INDEX IF NOT EXISTS `index_commission_reconciliation_item_lifecycle_classification` ON `commission_reconciliation_item` (`lifecycle_classification`)",
        "CREATE INDEX IF NOT EXISTS `index_commission_reconciliation_item_approval_state` ON `commission_reconciliation_item` (`approval_state`)",
        "CREATE INDEX IF NOT EXISTS `index_commission_reconciliation_item_normalized_group_key` ON `commission_reconciliation_item` (`normalized_group_key`)",
        "CREATE INDEX IF NOT EXISTS `index_commission_reconciliation_item_user_uid` ON `commission_reconciliation_item` (`user_uid`)",
        "CREATE UNIQUE INDEX IF NOT EXISTS `index_commission_reconciliation_item_import_id_normalized_group_key_internal_event_id` ON `commission_reconciliation_item` (`import_id`, `normalized_group_key`, `internal_event_id`)",

        """
        CREATE TABLE IF NOT EXISTS `commission_settlement_event` (
            `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            `stable_id` TEXT NOT NULL,
            `reservation_id` INTEGER NOT NULL,
            `supplier_id` INTEGER NOT NULL,
            `import_id` INTEGER,
            `reconciliation_item_id` INTEGER,
            `event_type` TEXT NOT NULL,
            `period_start` INTEGER NOT NULL,
            `period_end` INTEGER NOT NULL,
            `number_of_days` INTEGER NOT NULL,
            `payout_year` INTEGER NOT NULL,
            `payout_month` INTEGER NOT NULL,
            `supplier_amount` TEXT NOT NULL,
            `internal_amount` TEXT NOT NULL,
            `status` TEXT NOT NULL,
            `approved_at` INTEGER NOT NULL,
            `user_uid` TEXT NOT NULL,
            FOREIGN KEY(`reservation_id`) REFERENCES `Reservation`(`id`) ON UPDATE NO ACTION ON DELETE RESTRICT,
            FOREIGN KEY(`supplier_id`) REFERENCES `Supplier`(`id`) ON UPDATE NO ACTION ON DELETE RESTRICT
        )
        """.trimIndent(),
        "CREATE UNIQUE INDEX IF NOT EXISTS `index_commission_settlement_event_stable_id_user_uid` ON `commission_settlement_event` (`stable_id`, `user_uid`)",
        "CREATE INDEX IF NOT EXISTS `index_commission_settlement_event_reservation_id_user_uid` ON `commission_settlement_event` (`reservation_id`, `user_uid`)",
        "CREATE INDEX IF NOT EXISTS `index_commission_settlement_event_supplier_id_user_uid` ON `commission_settlement_event` (`supplier_id`, `user_uid`)",
        "CREATE INDEX IF NOT EXISTS `index_commission_settlement_event_import_id` ON `commission_settlement_event` (`import_id`)",
        "CREATE INDEX IF NOT EXISTS `index_commission_settlement_event_reconciliation_item_id` ON `commission_settlement_event` (`reconciliation_item_id`)",
        "CREATE INDEX IF NOT EXISTS `index_commission_settlement_event_payout_year_payout_month` ON `commission_settlement_event` (`payout_year`, `payout_month`)",
        "CREATE INDEX IF NOT EXISTS `index_commission_settlement_event_status` ON `commission_settlement_event` (`status`)",
        "CREATE INDEX IF NOT EXISTS `index_commission_settlement_event_user_uid` ON `commission_settlement_event` (`user_uid`)",

        """
        CREATE TABLE IF NOT EXISTS `commission_tracking_override` (
            `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            `reservation_id` INTEGER NOT NULL,
            `supplier_id` INTEGER NOT NULL,
            `commission_cap_date` INTEGER NOT NULL,
            `reason` TEXT NOT NULL,
            `source_import_id` INTEGER,
            `approved_at` INTEGER NOT NULL,
            `user_uid` TEXT NOT NULL,
            FOREIGN KEY(`reservation_id`) REFERENCES `Reservation`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
            FOREIGN KEY(`supplier_id`) REFERENCES `Supplier`(`id`) ON UPDATE NO ACTION ON DELETE RESTRICT
        )
        """.trimIndent(),
        "CREATE UNIQUE INDEX IF NOT EXISTS `index_commission_tracking_override_reservation_id_user_uid` ON `commission_tracking_override` (`reservation_id`, `user_uid`)",
        "CREATE INDEX IF NOT EXISTS `index_commission_tracking_override_supplier_id_user_uid` ON `commission_tracking_override` (`supplier_id`, `user_uid`)",
        "CREATE INDEX IF NOT EXISTS `index_commission_tracking_override_source_import_id` ON `commission_tracking_override` (`source_import_id`)",
        "CREATE INDEX IF NOT EXISTS `index_commission_tracking_override_user_uid` ON `commission_tracking_override` (`user_uid`)"
    )

    val NEW_TABLES = listOf(
        "supplier_commission_import_config",
        "supplier_commission_report_import",
        "supplier_commission_report_line",
        "commission_reconciliation_item",
        "commission_settlement_event",
        "commission_tracking_override"
    )
}
