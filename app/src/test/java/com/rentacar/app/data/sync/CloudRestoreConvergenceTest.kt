package com.rentacar.app.data.sync

import android.app.Application
import androidx.room.Room
import com.rentacar.app.data.AppDatabase
import com.rentacar.app.data.Customer
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import com.rentacar.app.data.auth.CurrentUserProvider
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * AGENT-143: cloud → Room restore convergence on a synthetic in-memory Room DB with a fake cloud
 * (no Firebase, no production data).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class CloudRestoreConvergenceTest {
    private val uid = "owner-uid"
    private lateinit var db: AppDatabase

    /** Fake cloud: collection -> docs; optional failure per collection; counts fetches. */
    private class FakeCloud : CloudDocumentSource {
        val data = mutableMapOf<String, MutableList<CloudDoc>>()
        val failing = mutableSetOf<String>()
        override suspend fun fetchAll(collection: String): CloudSnapshot {
            if (collection in failing) throw RuntimeException("UNAVAILABLE: network down")
            return CloudSnapshot(data[collection].orEmpty().toList())
        }
    }

    private val cloud = FakeCloud()

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(RuntimeEnvironment.getApplication(), AppDatabase::class.java).allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    private fun repo() = CloudToLocalRestoreRepository(db, null, CurrentUserProvider, source = cloud, uidProvider = { uid })

    private fun customerDoc(id: Long, name: String, updatedAt: Long? = 1_000) = CloudDoc(
        id.toString(),
        buildMap {
            put("id", id); put("firstName", name); put("lastName", "L"); put("phone", "05$id"); put("isCompany", false)
            put("active", true); put("createdAt", 500L); if (updatedAt != null) put("updatedAt", updatedAt)
        }
    )

    private fun reservationDoc(id: Long, customerId: Long, price: Double, updatedAt: Long = 1_000) = CloudDoc(
        id.toString(),
        mapOf("id" to id, "customerId" to customerId, "supplierId" to 1L, "branchId" to 1L, "carTypeId" to 1L,
            "dateFrom" to 10L, "dateTo" to 20L, "agreedPrice" to price, "status" to "Confirmed", "createdAt" to 500L, "updatedAt" to updatedAt)
    )

    private fun localCustomer(id: Long, name: String, updatedAt: Long, owner: String? = uid) = Customer(
        id = id, firstName = name, lastName = "L", phone = "05$id", createdAt = 500, updatedAt = updatedAt, userUid = owner
    )

    private fun customers() = runBlocking { db.customerDao().getAll(uid).firstOrNull().orEmpty() }
    private fun customer(id: Long) = runBlocking { db.customerDao().getById(id, uid).firstOrNull() }

    @Test
    fun cloudHasMoreRecords_missingOnesAreInserted_existingKept() = runBlocking {
        db.customerDao().upsert(localCustomer(1, "local-1", 1_000))
        cloud.data["customers"] = mutableListOf(customerDoc(1, "cloud-1", 1_000), customerDoc(2, "cloud-2"), customerDoc(3, "cloud-3"))
        val r = repo().restoreMissingDataFromCloud()
        assertEquals(listOf(1L, 2L, 3L), customers().map { it.id }.sorted())
        assertEquals("equal timestamps: local kept", "local-1", customer(1)!!.firstName)
        assertTrue(r.complete)
    }

    @Test
    fun roomHasMoreRecords_nothingDeleted() = runBlocking {
        listOf(1L, 2L, 3L).forEach { db.customerDao().upsert(localCustomer(it, "local-$it", 1_000)) }
        cloud.data["customers"] = mutableListOf(customerDoc(1, "x", 1_000))
        repo().restoreMissingDataFromCloud()
        assertEquals(3, customers().size)
    }

    @Test
    fun newerCloudVersionUpdates_olderDoesNot() = runBlocking {
        db.customerDao().upsert(localCustomer(1, "local-1", 1_000))
        db.customerDao().upsert(localCustomer(2, "local-2", 5_000))
        cloud.data["customers"] = mutableListOf(customerDoc(1, "cloud-newer", 2_000), customerDoc(2, "cloud-older", 3_000))
        repo().restoreMissingDataFromCloud()
        assertEquals("cloud-newer", customer(1)!!.firstName)
        assertEquals("local-2", customer(2)!!.firstName)
    }

    @Test
    fun missingCloudTimestampNeverOverwritesLocal_regression() = runBlocking {
        // Previously a missing updatedAt defaulted to "now" and overwrote the local record on every restore.
        db.customerDao().upsert(localCustomer(1, "local-1", 1_000))
        cloud.data["customers"] = mutableListOf(customerDoc(1, "cloud-no-timestamp", updatedAt = null))
        repo().restoreMissingDataFromCloud()
        assertEquals("local-1", customer(1)!!.firstName)
    }

    @Test
    fun pendingLocalChangeIsNeverOverwritten() = runBlocking {
        db.customerDao().upsert(localCustomer(1, "edited-offline", 1_000))
        db.syncQueueDao().insertOrReplace(SyncQueueEntity(entityType = "customer", entityId = 1, isDirty = true, lastDirtyAt = 1_500))
        cloud.data["customers"] = mutableListOf(customerDoc(1, "cloud-newer", 9_000))
        val r = repo().restoreMissingDataFromCloud()
        assertEquals("edited-offline", customer(1)!!.firstName)
        assertEquals(1, r.skippedPendingLocal["customer"])
        assertEquals("pending row still queued for upload", 1, db.syncQueueDao().getDirtyCountByType("customer"))
    }

    @Test
    fun idUsedByAnotherOwnerIsReportedAsConflict_notCountedAsRestored() = runBlocking {
        db.customerDao().upsert(localCustomer(7, "other-owner-row", 1_000, owner = "someone-else"))
        cloud.data["customers"] = mutableListOf(customerDoc(7, "mine"))
        val r = repo().restoreMissingDataFromCloud()
        assertEquals(1, r.conflicts)
        assertFalse(r.complete)
        assertEquals(0, r.restoredCounts["customer"])
        assertEquals("other owner's row untouched", "other-owner-row",
            db.customerDao().getById(7, "someone-else").firstOrNull()!!.firstName)
    }

    @Test
    fun runningTwiceIsIdempotent_noDuplicates() = runBlocking {
        cloud.data["customers"] = (1L..50L).map { customerDoc(it, "c$it") }.toMutableList()
        cloud.data["reservations"] = (1L..80L).map { reservationDoc(it, (it % 50) + 1, 100.0 + it) }.toMutableList()
        repo().restoreMissingDataFromCloud()
        val second = repo().restoreMissingDataFromCloud()
        assertEquals(50, customers().size)
        assertEquals(80, db.reservationDao().getAll(uid).firstOrNull()!!.size)
        assertEquals("nothing to do the second time", 0, second.restoredCounts["customer"])
        assertEquals(0, second.restoredCounts["reservation"])
    }

    @Test
    fun interruptedCollectionIsReported_andResumesLater() = runBlocking {
        cloud.data["customers"] = (1L..10L).map { customerDoc(it, "c$it") }.toMutableList()
        cloud.data["reservations"] = (1L..10L).map { reservationDoc(it, it, 50.0) }.toMutableList()
        cloud.failing += "reservations"
        val first = repo().restoreMissingDataFromCloud()
        assertFalse("incomplete when a collection failed", first.complete)
        assertEquals(10, customers().size)
        assertEquals(0, db.reservationDao().getAll(uid).firstOrNull()!!.size)
        cloud.failing.clear()
        val second = repo().restoreMissingDataFromCloud()
        assertTrue(second.complete)
        assertEquals(10, db.reservationDao().getAll(uid).firstOrNull()!!.size)
    }

    @Test
    fun financialValuesArriveUnchanged() = runBlocking {
        cloud.data["reservations"] = mutableListOf(reservationDoc(1, 1, 1234.56))
        repo().restoreMissingDataFromCloud()
        val r: Reservation = db.reservationDao().getById(1, uid).firstOrNull()!!
        assertEquals(1234.56, r.agreedPrice, 0.0)
        assertEquals(ReservationStatus.Confirmed, r.status)
        assertEquals(uid, r.userUid)
    }

    @Test
    fun restoredInactiveCustomerIsInRoomEvenIfUiHidesIt() = runBlocking {
        cloud.data["customers"] = mutableListOf(customerDoc(1, "active"), CloudDoc("2", customerDoc(2, "inactive").data!! + ("active" to false)))
        repo().restoreMissingDataFromCloud()
        assertEquals(2, customers().size)
        assertEquals("UI list (active only) hides one", 1, db.customerDao().listActive(uid).firstOrNull()!!.size)
    }

    @Test
    fun paginationFetchesEveryPage() = runBlocking {
        val all = (1..1234).toList()
        val got = fetchAllPages(500) { after, limit -> all.drop(after).take(limit) }
        assertEquals(all, got)
        assertEquals(listOf(1000), fetchAllPages(500) { after, limit -> if (after == 0) List(500) { 1 } + emptyList() else if (after == 500) List(500) { 1 } else emptyList() }.let { listOf(it.size) })
    }

    @Test
    fun policyTable() {
        val d = RestoreMergePolicy
        assertEquals(RestoreMergePolicy.Decision.INSERT, d.decide(false, null, null, false))
        assertEquals(RestoreMergePolicy.Decision.SKIP_LOCAL_PENDING, d.decide(true, 1, 9, true))
        assertEquals(RestoreMergePolicy.Decision.SKIP_NO_REMOTE_TIMESTAMP, d.decide(true, 1, null, false))
        assertEquals(RestoreMergePolicy.Decision.UPDATE, d.decide(true, 1, 2, false))
        assertEquals(RestoreMergePolicy.Decision.SKIP_LOCAL_NEWER_OR_EQUAL, d.decide(true, 2, 2, false))
    }
}
