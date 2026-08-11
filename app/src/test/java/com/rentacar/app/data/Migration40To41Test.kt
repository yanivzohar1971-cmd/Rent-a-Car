package com.rentacar.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Migration40To41Test {

    @Test
    fun statements_areAdditiveOnly() {
        val sql = Migration40To41Sql.STATEMENTS.joinToString("\n").lowercase()
        assertFalse(sql.contains("drop table"))
        assertFalse(sql.contains("drop column"))
        assertFalse("alter table carsale" in sql)
        assertFalse("alter table reservation" in sql)
        assertFalse("alter table customer" in sql)
        assertFalse("alter table supplier " in sql)
        Migration40To41Sql.NEW_TABLES.forEach { table ->
            assertTrue(sql.contains("create table if not exists `$table`"))
        }
    }

    @Test
    fun newTable_includesRequiredColumnsAndIndexes() {
        val sql = Migration40To41Sql.STATEMENTS.joinToString("\n").lowercase()
        assertTrue(sql.contains("car_sale_commission_payment"))
        assertTrue(sql.contains("user_uid"))
        assertTrue(sql.contains("car_sale_id"))
        assertTrue(sql.contains("`amount`"))
        assertTrue(sql.contains("payment_date"))
        assertTrue(sql.contains("created_at"))
        assertTrue(sql.contains("updated_at"))
        assertTrue(sql.contains("create index if not exists `index_car_sale_commission_payment_car_sale_id`"))
        assertTrue(sql.contains("create index if not exists `index_car_sale_commission_payment_user_uid`"))
        assertTrue(sql.contains("create index if not exists `index_car_sale_commission_payment_car_sale_id_user_uid`"))
        assertFalse(sql.contains("drop table"))
        assertFalse(sql.contains("unique index"))
    }

    @Test
    fun userUidBackfill_includesNewTable() {
        Migration40To41Sql.NEW_TABLES.forEach { table ->
            assertTrue(table in UserUidBackfill.USER_SPECIFIC_TABLES)
        }
    }

    @Test
    fun foreignKey_referencesCarSaleWithCascade() {
        val sql = Migration40To41Sql.STATEMENTS.joinToString("\n").lowercase()
        assertTrue(sql.contains("references `carsale`(`id`)"))
        assertTrue(sql.contains("on delete cascade"))
    }
}
