package com.rentacar.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UserUidBackfillTest {

  private val uidA = "5gw9sbDlBrfB5p3kcbCr6S9k3SI3"
  private val uidB = "otherUserUid123456789012345"

  @Test
  fun backfillUpdateSql_onlyTargetsNullUserUid() {
    val escapedUid = "'$uidA'"
    val sql = UserUidBackfill.backfillUpdateSql("Customer", escapedUid)

    assertEquals("UPDATE Customer SET user_uid = '$uidA' WHERE user_uid IS NULL", sql)
    assertTrue(sql.contains("WHERE user_uid IS NULL"))
    assertFalse(sql.contains(uidB))
  }

  @Test
  fun backfillUpdateSql_escapesSingleQuotesInUid() {
    val escapedUid = "'uid''with''quote'"
    val sql = UserUidBackfill.backfillUpdateSql("Reservation", escapedUid)

    assertEquals(
      "UPDATE Reservation SET user_uid = 'uid''with''quote' WHERE user_uid IS NULL",
      sql
    )
  }

  @Test
  fun userSpecificTables_includeIceRestoreEntities() {
    val tables = UserUidBackfill.USER_SPECIFIC_TABLES
    listOf("Customer", "Supplier", "Branch", "Reservation", "Payment", "Agent", "CarSale", "car_sale_commission_payment")
      .forEach { table -> assertTrue("$table missing from backfill list", table in tables) }
  }
}
