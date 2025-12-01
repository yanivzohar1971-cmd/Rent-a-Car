package com.rentacar.app.data.admin

import android.util.Log
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.ktx.functions
import com.google.firebase.ktx.Firebase
import kotlinx.coroutines.tasks.await

/**
 * Repository for calling admin Cloud Functions
 */
class AdminFunctionsRepository(
    private val functions: FirebaseFunctions = Firebase.functions
) {
    companion object {
        private const val TAG = "AdminFunctionsRepository"
    }

    /**
     * Check if current user is admin
     */
    suspend fun amIAdmin(): Boolean {
        return try {
            val result = functions.getHttpsCallable("amIAdmin")
                .call(hashMapOf<String, Any>())
                .await()
            
            val data = result.data as? Map<*, *>
            (data?.get("isAdmin") as? Boolean) ?: false
        } catch (e: Exception) {
            Log.e(TAG, "Error checking admin status", e)
            false
        }
    }

    /**
     * List yards with filtering
     */
    suspend fun listYards(
        status: YardStatus? = null,
        search: String? = null,
        limit: Int = 50,
        startAfter: String? = null
    ): YardListResult {
        return try {
            val data = hashMapOf<String, Any>(
                "limit" to limit
            )
            
            if (status != null) {
                data["status"] = status.name
            }
            if (search != null && search.isNotBlank()) {
                data["search"] = search
            }
            if (startAfter != null) {
                data["startAfter"] = startAfter
            }

            val result = functions.getHttpsCallable("adminListYards")
                .call(data)
                .await()

            val resultData = result.data as? Map<*, *>
            val yardsList = (resultData?.get("yards") as? List<*>)?.mapNotNull { item ->
                // Convert map to YardRegistry
                if (item is Map<*, *>) {
                    try {
                        YardRegistry(
                            yardUid = (item["yardUid"] as? String) ?: "",
                            displayName = (item["displayName"] as? String) ?: "",
                            phone = (item["phone"] as? String) ?: "",
                            city = (item["city"] as? String) ?: "",
                            status = YardStatus.valueOf((item["status"] as? String) ?: "PENDING"),
                            statusReason = item["statusReason"] as? String
                        )
                    } catch (e: Exception) {
                        Log.w(TAG, "Error parsing yard registry", e)
                        null
                    }
                } else {
                    null
                }
            } ?: emptyList()

            YardListResult(
                yards = yardsList,
                hasMore = (resultData?.get("hasMore") as? Boolean) ?: false,
                lastYardUid = resultData?.get("lastYardUid") as? String
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error listing yards", e)
            throw e
        }
    }

    /**
     * Set yard status
     */
    suspend fun setYardStatus(
        yardUid: String,
        status: YardStatus,
        reason: String? = null
    ): YardRegistry {
        return try {
            val data = hashMapOf<String, Any>(
                "yardUid" to yardUid,
                "status" to status.name
            )
            if (reason != null) {
                data["reason"] = reason
            }

            val result = functions.getHttpsCallable("adminSetYardStatus")
                .call(data)
                .await()

            val resultData = result.data as? Map<*, *>
            val yardData = resultData?.get("yard") as? Map<*, *>
            
            if (yardData != null) {
                YardRegistry(
                    yardUid = (yardData["yardUid"] as? String) ?: yardUid,
                    displayName = (yardData["displayName"] as? String) ?: "",
                    phone = (yardData["phone"] as? String) ?: "",
                    city = (yardData["city"] as? String) ?: "",
                    status = YardStatus.valueOf((yardData["status"] as? String) ?: status.name),
                    statusReason = yardData["statusReason"] as? String
                )
            } else {
                throw Exception("Invalid response from server")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error setting yard status", e)
            throw e
        }
    }

    /**
     * Assign importer to yard
     */
    suspend fun assignYardImporter(
        yardUid: String,
        importerId: String,
        importerVersion: Int = 1,
        config: Map<String, Any> = emptyMap()
    ): Boolean {
        return try {
            val data = hashMapOf<String, Any>(
                "yardUid" to yardUid,
                "importerId" to importerId,
                "importerVersion" to importerVersion,
                "config" to config
            )

            val result = functions.getHttpsCallable("adminAssignYardImporter")
                .call(data)
                .await()

            val resultData = result.data as? Map<*, *>
            (resultData?.get("success") as? Boolean) ?: false
        } catch (e: Exception) {
            Log.e(TAG, "Error assigning importer", e)
            throw e
        }
    }

    /**
     * Track car view
     */
    suspend fun trackCarView(
        yardUid: String,
        carId: String,
        sessionId: String? = null,
        viewerUid: String? = null
    ): Boolean {
        return try {
            val data = hashMapOf<String, Any>(
                "yardUid" to yardUid,
                "carId" to carId
            )
            if (sessionId != null) {
                data["sessionId"] = sessionId
            }
            if (viewerUid != null) {
                data["viewerUid"] = viewerUid
            }

            val result = functions.getHttpsCallable("trackCarView")
                .call(data)
                .await()

            val resultData = result.data as? Map<*, *>
            (resultData?.get("success") as? Boolean) ?: false
        } catch (e: Exception) {
            Log.e(TAG, "Error tracking car view", e)
            // Don't throw - tracking failures shouldn't break the app
            false
        }
    }

    /**
     * Get dashboard data
     */
    suspend fun getDashboard(): DashboardData {
        return try {
            val result = functions.getHttpsCallable("adminGetDashboard")
                .call(hashMapOf<String, Any>())
                .await()

            val data = result.data as? Map<*, *>
            val systemData = data?.get("system") as? Map<*, *>
            val yardsData = data?.get("yards") as? Map<*, *>
            val topYards = (data?.get("topYardsLast7d") as? List<*>)?.mapNotNull { item ->
                if (item is Map<*, *>) {
                    TopYardItem(
                        yardUid = (item["yardUid"] as? String) ?: "",
                        views = ((item["views"] as? Number)?.toLong()) ?: 0L,
                        displayName = (item["displayName"] as? String) ?: ""
                    )
                } else null
            } ?: emptyList()

            val topCars = (data?.get("topCarsLast7d") as? List<*>)?.mapNotNull { item ->
                if (item is Map<*, *>) {
                    TopCarItem(
                        yardUid = (item["yardUid"] as? String) ?: "",
                        carId = (item["carId"] as? String) ?: "",
                        views = ((item["views"] as? Number)?.toLong()) ?: 0L
                    )
                } else null
            } ?: emptyList()

            DashboardData(
                system = SystemStats(
                    carViewsTotal = ((systemData?.get("carViewsTotal") as? Number)?.toLong()) ?: 0L,
                    carViewsLast7d = ((systemData?.get("carViewsLast7d") as? Number)?.toLong()) ?: 0L,
                    carViewsLast30d = ((systemData?.get("carViewsLast30d") as? Number)?.toLong()) ?: 0L
                ),
                yards = YardCounts(
                    pendingApproval = ((yardsData?.get("pendingApproval") as? Number)?.toInt()) ?: 0,
                    approved = ((yardsData?.get("approved") as? Number)?.toInt()) ?: 0
                ),
                topYardsLast7d = topYards,
                topCarsLast7d = topCars
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error getting dashboard", e)
            throw e
        }
    }
}

data class YardListResult(
    val yards: List<YardRegistry>,
    val hasMore: Boolean,
    val lastYardUid: String?
)

