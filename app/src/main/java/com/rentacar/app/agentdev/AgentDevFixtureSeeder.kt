package com.rentacar.app.agentdev

import android.content.Context
import android.util.Log
import com.rentacar.app.BuildConfig
import com.rentacar.app.data.AppDatabase
import com.rentacar.app.di.DatabaseModule
import kotlinx.coroutines.runBlocking

/**
 * AGENT-101 (AgentDev only). Idempotent offline fixture seeding straight into Room.
 *
 * - Writes through DAOs (not repositories), so no rows are added to the sync queue.
 * - Fixed primary keys + upserts make re-running safe even if the prefs flag is lost.
 * - Guarded by the `agent_dev_seeded_v1` SharedPreferences flag for the fast path.
 */
object AgentDevFixtureSeeder {
    private const val TAG = "AgentDevSeeder"
    const val PREFS_NAME = "agent_dev_prefs"
    const val SEEDED_FLAG = "agent_dev_seeded_v1"

    /** Seeds once per install. Returns true when rows were written by this call. */
    fun seedIfNeeded(context: Context, force: Boolean = false): Boolean {
        check(BuildConfig.AGENT_DEV_MODE) { "AgentDev fixtures may only be seeded in the agentdev build" }
        val app = context.applicationContext
        val prefs = app.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (!force && prefs.getBoolean(SEEDED_FLAG, false)) {
            Log.i(TAG, "Fixtures already seeded ($SEEDED_FLAG=true); skipping")
            return false
        }
        val db = DatabaseModule.provideDatabase(app)
        runBlocking { seed(db, AgentDevFixtureData.build(BuildConfig.AGENT_DEV_UID)) }
        prefs.edit().putBoolean(SEEDED_FLAG, true).apply()
        Log.i(TAG, "Fixtures seeded for uid=${BuildConfig.AGENT_DEV_UID}")
        return true
    }

    /** Upserts every fixture row. Parents first so foreign keys (commission payments) hold. */
    suspend fun seed(db: AppDatabase, fixture: AgentDevFixtureData.Fixture) {
        val uid = fixture.uid
        fixture.suppliers.forEach { db.supplierDao().upsert(it, uid) }
        fixture.branches.forEach { db.branchDao().upsert(it, uid) }
        fixture.carTypes.forEach { db.carTypeDao().upsert(it) }
        fixture.customers.forEach { db.customerDao().upsert(it) }
        fixture.reservations.forEach { db.reservationDao().upsert(it) }
        fixture.carSales.forEach { db.carSaleDao().upsert(it) }
        fixture.commissionPayments.forEach { db.carSaleCommissionPaymentDao().upsert(it) }
    }
}
