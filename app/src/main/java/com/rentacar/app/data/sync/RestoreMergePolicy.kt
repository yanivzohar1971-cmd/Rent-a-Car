package com.rentacar.app.data.sync

import com.google.firebase.firestore.FieldPath
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await

/**
 * AGENT-143: decision rules for cloud → Room restore (pure, unit-tested).
 *
 *  - A cloud record whose id is missing locally is inserted.
 *  - An existing local record is updated ONLY when the cloud carries an explicit `updatedAt` that is
 *    strictly newer. A missing cloud timestamp never counts as "newer" (previously it defaulted to
 *    `System.currentTimeMillis()`, which overwrote local data on every restore).
 *  - An existing local record with a pending (dirty, not yet uploaded) change is never overwritten.
 */
object RestoreMergePolicy {
    enum class Decision { INSERT, UPDATE, SKIP_LOCAL_PENDING, SKIP_LOCAL_NEWER_OR_EQUAL, SKIP_NO_REMOTE_TIMESTAMP }

    fun decide(localExists: Boolean, localUpdatedAt: Long?, remoteUpdatedAt: Long?, localPending: Boolean): Decision = when {
        !localExists -> Decision.INSERT
        localPending -> Decision.SKIP_LOCAL_PENDING
        remoteUpdatedAt == null -> Decision.SKIP_NO_REMOTE_TIMESTAMP
        localUpdatedAt == null || remoteUpdatedAt > localUpdatedAt -> Decision.UPDATE
        else -> Decision.SKIP_LOCAL_NEWER_OR_EQUAL
    }
}

/** One cloud document (Firestore document id + field map). Mirrors the parts of DocumentSnapshot the restore uses. */
data class CloudDoc(val id: String, val data: Map<String, Any?>?)

/** A fetched collection (keeps the `size()` / `documents` shape the restore code was written against). */
class CloudSnapshot(val documents: List<CloudDoc>) {
    fun size(): Int = documents.size
}

/** Source of the signed-in user's cloud documents (users/{uid}/{collection}). */
interface CloudDocumentSource {
    /** Fetches EVERY document of the collection (all pages). Throws on network / permission errors. */
    suspend fun fetchAll(collection: String): CloudSnapshot
}

/** Firestore implementation, paginated by document id so large collections are fetched completely. */
class FirestoreDocumentSource(
    private val firestore: FirebaseFirestore,
    private val pageSize: Long = 500
) : CloudDocumentSource {
    override suspend fun fetchAll(collection: String): CloudSnapshot {
        val ref = UserCollections.userCollection(firestore, collection)
        val out = mutableListOf<CloudDoc>()
        var last: com.google.firebase.firestore.DocumentSnapshot? = null
        while (true) {
            var q = ref.orderBy(FieldPath.documentId()).limit(pageSize)
            if (last != null) q = q.startAfter(last)
            val page = q.get().await()
            page.documents.forEach { out += CloudDoc(it.id, it.data) }
            if (page.size() < pageSize) break
            last = page.documents.last()
        }
        return CloudSnapshot(out)
    }
}

/** Generic paginator used by [FirestoreDocumentSource] semantics; exposed for tests. */
suspend fun <T> fetchAllPages(pageSize: Int, fetchPage: suspend (afterIndex: Int, limit: Int) -> List<T>): List<T> {
    val out = mutableListOf<T>()
    while (true) {
        val page = fetchPage(out.size, pageSize)
        out += page
        if (page.size < pageSize) return out
    }
}
