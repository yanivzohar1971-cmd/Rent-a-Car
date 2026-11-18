package com.rentacar.app.di

import android.app.Application
import androidx.room.Room
import androidx.sqlite.db.SupportSQLiteDatabase
import com.rentacar.app.agentdev.AgentDevFixtureData
import com.rentacar.app.agentdev.AgentDevFixtureSeeder
import com.rentacar.app.data.AppDatabase
import com.rentacar.app.data.sync.SyncQueueEntity
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.security.MessageDigest

/**
 * AGENT-140 Step D: in-place upgrade simulation on a FILE database (synthetic data only).
 *
 *  1. "Previous installation": a v44 rentacar.db created with the same AppDatabase schema
 *     (the Room identity hash is verified equal to origin/main separately), populated with
 *     suppliers, branches, car types, customers, reservations, car sales, commission payments and
 *     unsynchronized sync_queue rows.
 *  2. "Updated app": the database is reopened through the update's real
 *     DatabaseModule.provideDatabase() (same builder, migrations and fallback policy the APK uses).
 *  3. Every table's row count and content checksum, the Room identity hash, primary keys and the
 *     outstanding car-sale commission must be identical.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class RoomUpgradePreservationTest {

    private fun snapshot(db: SupportSQLiteDatabase): Map<String, Pair<Int, String>> {
        val tables = mutableListOf<String>()
        db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('android_metadata','sqlite_sequence','room_master_table') ORDER BY name").use { c ->
            while (c.moveToNext()) tables += c.getString(0)
        }
        return tables.associateWith { t ->
            val md = MessageDigest.getInstance("SHA-256")
            var n = 0
            db.query("SELECT * FROM `$t` ORDER BY rowid").use { c ->
                while (c.moveToNext()) {
                    n++
                    for (i in 0 until c.columnCount) md.update("${c.getColumnName(i)}=${if (c.isNull(i)) "∅" else c.getString(i)};".toByteArray())
                    md.update("\n".toByteArray())
                }
            }
            n to md.digest().joinToString("") { "%02x".format(it) }
        }
    }

    private fun identityHash(db: SupportSQLiteDatabase): String =
        db.query("SELECT identity_hash FROM room_master_table").use { c -> c.moveToFirst(); c.getString(0) }

    private fun outstandingCarSaleCommission(db: SupportSQLiteDatabase): Double =
        db.query(
            "SELECT SUM(MAX(s.commissionPrice - IFNULL(p.paid,0), 0)) FROM CarSale s " +
                "LEFT JOIN (SELECT car_sale_id, SUM(amount) paid FROM car_sale_commission_payment GROUP BY car_sale_id) p ON p.car_sale_id = s.id"
        ).use { c -> c.moveToFirst(); c.getDouble(0) }

    @Test
    fun inPlaceUpgradePreservesEveryRecord() {
        val app = RuntimeEnvironment.getApplication()
        app.deleteDatabase("rentacar.db")

        // 1) previous installation
        val previous = Room.databaseBuilder(app, AppDatabase::class.java, "rentacar.db").allowMainThreadQueries().build()
        runBlocking {
            AgentDevFixtureSeeder.seed(previous, AgentDevFixtureData.build("owner-uid-synthetic"))
            previous.syncQueueDao().insertOrReplace(SyncQueueEntity(entityType = "reservation", entityId = 9406, lastDirtyAt = 1_000L))
            previous.syncQueueDao().insertOrReplace(SyncQueueEntity(entityType = "customer", entityId = 9301, lastDirtyAt = 2_000L, lastSyncStatus = "FAILED", lastSyncError = "offline"))
        }
        val beforeDb = previous.openHelper.writableDatabase
        val before = snapshot(beforeDb)
        val beforeHash = identityHash(beforeDb)
        val beforeVersion = beforeDb.version
        val beforeOutstanding = outstandingCarSaleCommission(beforeDb)
        previous.close()

        // 2) updated app opens the same file through its real builder
        DatabaseModule::class.java.getDeclaredField("instance").apply { isAccessible = true }.set(DatabaseModule, null)
        val updated = DatabaseModule.provideDatabase(app)
        val afterDb = updated.openHelper.writableDatabase
        val after = snapshot(afterDb)

        // 3) evidence
        val populated = before.filterValues { it.first > 0 }.keys
        assertTrue("representative tables populated: $populated", populated.containsAll(
            listOf("Supplier", "Customer", "Reservation", "CarSale", "car_sale_commission_payment", "sync_queue")
        ))
        assertEquals("schema version unchanged (no migration)", beforeVersion, afterDb.version)
        assertEquals(44, afterDb.version)
        assertEquals("Room identity hash unchanged", beforeHash, identityHash(afterDb))
        assertEquals("same tables", before.keys, after.keys)
        for (t in before.keys) assertEquals("table $t: row count + content checksum", before[t], after[t])
        assertEquals("outstanding car-sale commission unchanged", beforeOutstanding, outstandingCarSaleCommission(afterDb), 1e-9)
        assertEquals(1800.0, beforeOutstanding, 1e-9)
        afterDb.query("SELECT COUNT(*) FROM sync_queue WHERE isDirty = 1").use { c -> c.moveToFirst(); assertEquals("pending sync rows intact", 2, c.getInt(0)) }
        println("UPGRADE_EVIDENCE version=$beforeVersion hash=$beforeHash " +
            before.filterValues { it.first > 0 }.entries.joinToString(" ") { "${it.key}=${it.value.first}:${it.value.second.take(12)}" })
        updated.close()
    }
}
