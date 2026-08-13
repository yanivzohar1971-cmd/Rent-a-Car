package com.rentacar.app.data

/**
 * Additive SQL for Room migration 42 → 43 (supplier commission-report email settings
 * + email import fingerprint table).
 *
 * Existing Supplier rows remain intact; new columns are nullable.
 */
object Migration42To43Sql {
    val STATEMENTS: List<String> = listOf(
        "ALTER TABLE Supplier ADD COLUMN commission_report_email TEXT",
        "ALTER TABLE Supplier ADD COLUMN commission_report_format TEXT",
        """
        CREATE TABLE IF NOT EXISTS email_commission_report_fingerprint (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            supplier_id INTEGER NOT NULL,
            configured_sender TEXT NOT NULL,
            mailbox_provider TEXT NOT NULL,
            message_id TEXT,
            imap_uid INTEGER,
            received_at INTEGER,
            content_hash TEXT NOT NULL,
            report_format TEXT NOT NULL,
            imported_at INTEGER NOT NULL,
            result TEXT NOT NULL,
            user_uid TEXT NOT NULL,
            FOREIGN KEY(supplier_id) REFERENCES Supplier(id) ON DELETE CASCADE
        )
        """.trimIndent(),
        "CREATE INDEX IF NOT EXISTS index_email_fp_supplier_user ON email_commission_report_fingerprint (supplier_id, user_uid)",
        "CREATE INDEX IF NOT EXISTS index_email_fp_content_hash ON email_commission_report_fingerprint (supplier_id, content_hash, user_uid)",
        "CREATE INDEX IF NOT EXISTS index_email_fp_message_id ON email_commission_report_fingerprint (supplier_id, message_id, user_uid)",
        "CREATE INDEX IF NOT EXISTS index_email_fp_user ON email_commission_report_fingerprint (user_uid)"
    )

    const val TARGET_TABLE_SUPPLIER = "Supplier"
    const val TARGET_TABLE_FINGERPRINT = "email_commission_report_fingerprint"
}
