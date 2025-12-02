package com.rentacar.app.data.yard

import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.FirebaseFunctionsException
import kotlinx.coroutines.channels.awaitClose
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

    companion object {
        private const val TAG = "YardImportRepository"
    }

    private fun yardJobsCollection() =
        auth.currentUser?.uid?.let { uid ->
            db.collection("users").document(uid).collection("yardImportJobs")
        } ?: throw IllegalStateException("No authenticated user")

    override suspend fun createImportJob(fileName: String): Result<YardImportJobInit> {
        return try {
            val payload = hashMapOf("fileName" to fileName)
            val result = functions
                .getHttpsCallable("yardImportCreateJob")
                .call(payload)
                .await()

            @Suppress("UNCHECKED_CAST")
            val raw = result.getData()
            val data = raw as? Map<String, Any?> ?: emptyMap()
            val jobId = data["jobId"] as? String ?: return Result.failure(
                Exception("Missing jobId in response")
            )
            val uploadPath = data["uploadPath"] as? String ?: return Result.failure(
                Exception("Missing uploadPath in response")
            )
            Result.success(YardImportJobInit(jobId = jobId, uploadPath = uploadPath))
        } catch (e: FirebaseFunctionsException) {
            Log.e(TAG, "Firebase Functions error creating import job", e)
            val errorMessage = when (e.code) {
                FirebaseFunctionsException.Code.NOT_FOUND -> "ייבוא צי: הפונקציה לא נמצאה. אנא ודא שהפונקציות מופעלות."
                FirebaseFunctionsException.Code.UNAUTHENTICATED -> "ייבוא צי: נדרשת התחברות מחדש."
                FirebaseFunctionsException.Code.PERMISSION_DENIED -> "ייבוא צי: אין הרשאה לביצוע פעולה זו."
                FirebaseFunctionsException.Code.INVALID_ARGUMENT -> e.message ?: "ייבוא צי: פרמטרים לא תקינים."
                else -> e.message ?: "ייבוא צי: שגיאה ביצירת עבודת הייבוא."
            }
            Result.failure(Exception(errorMessage))
        } catch (e: Exception) {
            Log.e(TAG, "Error creating import job", e)
            Result.failure(Exception("ייבוא צי: שגיאה ביצירת עבודת הייבוא: ${e.message}"))
        }
    }

    override fun observeImportJob(jobId: String): Flow<YardImportJob> = callbackFlow {
        Log.d(TAG, "observeImportJob: starting observation for jobId=$jobId")
        val col = yardJobsCollection()
        val registration = col.document(jobId).addSnapshotListener { snap, error ->
            if (error != null) {
                Log.e(TAG, "observeImportJob: snapshot error for jobId=$jobId", error)
                close(error)
                return@addSnapshotListener
            }
            if (snap != null && snap.exists()) {
                Log.d(TAG, "observeImportJob: snapshot received for jobId=$jobId, exists=${snap.exists()}")
                try {
                    val job = snap.toObject(YardImportJob::class.java)
                    if (job != null) {
                        Log.d(TAG, "observeImportJob: deserialized job: status=${job.status}")
                        trySend(job.copy(jobId = jobId))
                    } else {
                        Log.e(TAG, "observeImportJob: failed to deserialize job document")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "observeImportJob: deserialization error", e)
                    close(e)
                }
            } else {
                Log.d(TAG, "observeImportJob: snapshot is null or doesn't exist")
            }
        }
        awaitClose {
            Log.d(TAG, "observeImportJob: closing observation for jobId=$jobId")
            registration.remove()
        }
    }

    override suspend fun loadPreviewRows(jobId: String): Result<List<YardImportPreviewRow>> {
        Log.d(TAG, "loadPreviewRows: jobId=$jobId")
        return try {
            val col = yardJobsCollection()
            val snap = col.document(jobId).collection("preview").get().await()
            Log.d(TAG, "loadPreviewRows: loaded ${snap.documents.size} preview documents")
            val rows = snap.documents.mapNotNull { doc ->
                doc.toObject(YardImportPreviewRow::class.java)
            }
            Log.d(TAG, "loadPreviewRows: successfully deserialized ${rows.size} rows")
            Result.success(rows)
        } catch (e: Exception) {
            Log.e(TAG, "loadPreviewRows: error", e)
            Result.failure(e)
        }
    }

    override suspend fun commitImport(jobId: String): Result<Unit> {
        return try {
            val payload = hashMapOf("jobId" to jobId)
            functions.getHttpsCallable("yardImportCommitJob").call(payload).await()
            Result.success(Unit)
        } catch (e: FirebaseFunctionsException) {
            Log.e(TAG, "Firebase Functions error committing import", e)
            val errorMessage = when (e.code) {
                FirebaseFunctionsException.Code.NOT_FOUND -> "ייבוא צי: הפונקציה לא נמצאה. אנא ודא שהפונקציות מופעלות."
                FirebaseFunctionsException.Code.UNAUTHENTICATED -> "ייבוא צי: נדרשת התחברות מחדש."
                FirebaseFunctionsException.Code.PERMISSION_DENIED -> "ייבוא צי: אין הרשאה לביצוע פעולה זו."
                FirebaseFunctionsException.Code.INVALID_ARGUMENT -> e.message ?: "ייבוא צי: פרמטרים לא תקינים."
                else -> e.message ?: "ייבוא צי: שגיאה באישור הייבוא."
            }
            Result.failure(Exception(errorMessage))
        } catch (e: Exception) {
            Log.e(TAG, "Error committing import", e)
            Result.failure(Exception("ייבוא צי: שגיאה באישור הייבוא: ${e.message}"))
        }
    }
}

