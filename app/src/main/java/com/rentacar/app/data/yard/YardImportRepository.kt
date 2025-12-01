package com.rentacar.app.data.yard

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

interface YardImportRepository {
    suspend fun createImportJob(fileName: String): Result<YardImportJobInit>
    fun observeImportJob(jobId: String): Flow<YardImportJob>
    suspend fun loadPreviewRows(jobId: String): Result<List<YardImportPreviewRow>>
    suspend fun commitImport(jobId: String): Result<Unit>
}

class FirebaseYardImportRepository(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
    private val functions: FirebaseFunctions = FirebaseFunctions.getInstance()
) : YardImportRepository {

    private fun yardJobsCollection() =
        auth.currentUser?.uid?.let { uid ->
            db.collection("users").document(uid).collection("yardImportJobs")
        } ?: throw IllegalStateException("No authenticated user")

    override suspend fun createImportJob(fileName: String): Result<YardImportJobInit> = runCatching {
        val payload = hashMapOf("fileName" to fileName)
        val result = functions
            .getHttpsCallable("yardImportCreateJob")
            .call(payload)
            .await()

        @Suppress("UNCHECKED_CAST")
        val raw = result.getData()
        val data = raw as? Map<String, Any?> ?: emptyMap()
        val jobId = data["jobId"] as? String ?: error("Missing jobId")
        val uploadPath = data["uploadPath"] as? String ?: error("Missing uploadPath")
        YardImportJobInit(jobId = jobId, uploadPath = uploadPath)
    }

    override fun observeImportJob(jobId: String): Flow<YardImportJob> = callbackFlow {
        val col = yardJobsCollection()
        val registration = col.document(jobId).addSnapshotListener { snap, error ->
            if (error != null) {
                close(error)
                return@addSnapshotListener
            }
            if (snap != null && snap.exists()) {
                val job = snap.toObject(YardImportJob::class.java)
                if (job != null) trySend(job.copy(jobId = jobId))
            }
        }
        awaitClose { registration.remove() }
    }

    override suspend fun loadPreviewRows(jobId: String): Result<List<YardImportPreviewRow>> = runCatching {
        val col = yardJobsCollection()
        val snap = col.document(jobId).collection("preview").get().await()
        snap.documents.mapNotNull { doc ->
            doc.toObject(YardImportPreviewRow::class.java)
        }
    }

    override suspend fun commitImport(jobId: String): Result<Unit> = runCatching {
        val payload = hashMapOf("jobId" to jobId)
        functions.getHttpsCallable("yardImportCommitJob").call(payload).await()
        Unit
    }
}

