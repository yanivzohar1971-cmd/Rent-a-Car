package com.rentacar.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Migration41To42Test {

    @Test
    fun statements_areAdditiveOnly() {
        val sql = Migration41To42Sql.STATEMENTS.joinToString("\n").lowercase()
        assertFalse(sql.contains("drop table"))
        assertFalse(sql.contains("drop column"))
        assertFalse(sql.contains("create table"))
        assertFalse(sql.contains("carsale_backup"))
        assertFalse(sql.contains("car_sale_commission_payment"))
        Migration41To42Sql.STATEMENTS.forEach { statement ->
            assertTrue(statement.lowercase().startsWith("alter table carsale add column"))
        }
    }

    @Test
    fun addsBothNullableColumns() {
        val sql = Migration41To42Sql.STATEMENTS.joinToString("\n").lowercase()
        assertTrue(sql.contains("license_plate"))
        assertTrue(sql.contains("vehicle_year"))
        assertTrue(sql.contains("license_plate text"))
        assertTrue(sql.contains("vehicle_year integer"))
        assertEquals(2, Migration41To42Sql.STATEMENTS.size)
    }
}
