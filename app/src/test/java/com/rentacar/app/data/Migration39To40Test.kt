package com.rentacar.app.data

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Migration39To40Test {

    @Test
    fun statements_areAdditiveOnly() {
        val sql = Migration39To40Sql.STATEMENTS.joinToString("\n").lowercase()
        assertFalse(sql.contains("drop table"))
        assertFalse(sql.contains("drop column"))
        assertFalse("alter table reservation" in sql)
        assertFalse("alter table customer" in sql)
        assertFalse("alter table supplier " in sql)
        Migration39To40Sql.NEW_TABLES.forEach { table ->
            assertTrue(sql.contains("create table if not exists `$table`"))
        }
    }

    @Test
    fun newTables_includeUserUidAndIndexes() {
        val sql = Migration39To40Sql.STATEMENTS.joinToString("\n").lowercase()
        Migration39To40Sql.NEW_TABLES.forEach { table ->
            assertTrue("$table missing user_uid", sql.contains(table) && sql.contains("user_uid"))
        }
        assertTrue(sql.contains("create unique index"))
        assertTrue(sql.contains("commission_settlement_event"))
        assertTrue(sql.contains("stable_id"))
    }

    @Test
    fun userUidBackfill_includesNewTables() {
        Migration39To40Sql.NEW_TABLES.forEach { table ->
            assertTrue(table in UserUidBackfill.USER_SPECIFIC_TABLES)
        }
    }
}
