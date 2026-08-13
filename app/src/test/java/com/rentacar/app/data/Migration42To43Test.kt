package com.rentacar.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Migration42To43Test {

    @Test
    fun statements_areAdditiveOnly() {
        val sql = Migration42To43Sql.STATEMENTS.joinToString("\n").lowercase()
        assertFalse(sql.contains("drop table"))
        assertFalse(sql.contains("drop column"))
        assertFalse(sql.contains("supplier_backup"))
        Migration42To43Sql.STATEMENTS.take(2).forEach { statement ->
            assertTrue(statement.lowercase().startsWith("alter table supplier add column"))
        }
    }

    @Test
    fun addsNullableSupplierEmailColumns() {
        val sql = Migration42To43Sql.STATEMENTS.joinToString("\n").lowercase()
        assertTrue(sql.contains("commission_report_email text"))
        assertTrue(sql.contains("commission_report_format text"))
    }

    @Test
    fun createsFingerprintTable() {
        val sql = Migration42To43Sql.STATEMENTS.joinToString("\n").lowercase()
        assertTrue(sql.contains("create table if not exists email_commission_report_fingerprint"))
        assertTrue(sql.contains("content_hash"))
        assertTrue(sql.contains("message_id"))
        assertTrue(sql.contains("foreign key(supplier_id) references supplier(id)"))
    }

    @Test
    fun preservesExistingSupplierRows_byUsingNullableColumns() {
        // Nullable ADD COLUMN keeps existing rows intact without rewrite.
        Migration42To43Sql.STATEMENTS.take(2).forEach { statement ->
            assertFalse(statement.lowercase().contains("not null"))
        }
        assertEquals(7, Migration42To43Sql.STATEMENTS.size)
    }
}
