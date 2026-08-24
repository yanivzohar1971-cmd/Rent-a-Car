package com.rentacar.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Migration43To44Test {

    @Test
    fun statements_areAdditiveOnly() {
        val sql = Migration43To44Sql.STATEMENTS.joinToString("\n").lowercase()
        assertFalse(sql.contains("drop table"))
        assertFalse(sql.contains("drop column"))
        assertFalse("alter table reservation" in sql)
        assertFalse("alter table customer" in sql)
        assertFalse("alter table supplier " in sql)
        assertFalse("alter table payment" in sql)
        Migration43To44Sql.NEW_TABLES.forEach { table ->
            assertTrue(sql.contains("create table if not exists `$table`"))
        }
    }

    @Test
    fun createsTermAndCustomizationTables() {
        val sql = Migration43To44Sql.STATEMENTS.joinToString("\n").lowercase()
        assertTrue(sql.contains("supplier_customer_term"))
        assertTrue(sql.contains("supplier_customer_terms_customization"))
        assertTrue(sql.contains("text_template"))
        assertTrue(sql.contains("sort_order"))
        assertTrue(sql.contains("text_color_argb"))
        assertTrue(sql.contains("user_uid"))
        assertTrue(sql.contains("foreign key(`supplier_id`) references `supplier`(`id`)"))
        assertTrue(sql.contains("on delete cascade"))
        assertTrue(sql.contains("create unique index"))
        assertEquals(9, Migration43To44Sql.STATEMENTS.size)
    }

    @Test
    fun doesNotInsertDefaultTermRows() {
        val sql = Migration43To44Sql.STATEMENTS.joinToString("\n").lowercase()
        assertFalse(sql.contains("insert into"))
    }

    @Test
    fun userUidBackfill_includesNewTables() {
        Migration43To44Sql.NEW_TABLES.forEach { table ->
            assertTrue(table in UserUidBackfill.USER_SPECIFIC_TABLES)
        }
    }
}
