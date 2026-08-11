package com.rentacar.app.data.admin

import android.util.Log
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.ktx.functions
import com.google.firebase.ktx.Firebase
import kotlinx.coroutines.tasks.await

/**
 * Admin repository for calling admin Cloud Functions
 * Follows existing Result<T> pattern
 */
interface AdminRepository {
    suspend fun amIAdmin(): Boolean
    suspend fun getDashboard(): Result<AdminDashboardData>
    suspend fun listYards(
        status: YardStatus?,
        searchQuery: String?,
        pageToken: String?
    ): Result<YardListPage>
    suspend fun getYardDetails(yardUid: String): Result<AdminYardDetails>
    suspend fun updateYardStatus(
        yardUid: String,
        status: YardStatus,
        reason: String?
    ): Result<Unit>
    suspend fun assignYardImporter(
        yardUid: String,
        importerId: String,
        importerVersion: Int
    ): Result<Unit>
}

class FirebaseAdminRepository(
    private val functions: FirebaseFunctions = Firebase.functions
) : AdminRepository {
    
    companion object {
        private const val TAG = "FirebaseAdminRepository"
    }
    
    override suspend fun amIAdmin(): Boolean {
        return try {
            val result = functions.getHttpsCallable("amIAdmin")
                .call(hashMapOf<String, Any>())
                .await()
            
            val raw = result.getData()
            @Suppress("UNCHECKED_CAST")
            val data = raw as? Map<*, *> ?: emptyMap<Any, Any>()
            (data["isAdmin"] as? Boolean) ?: false
        } catch (e: Exception) {
            Log.e(TAG, "Error checking admin status", e)
            false
        }
    }
    
    override suspend fun getDashboard(): Result<AdminDashboardData> {
        return try {
            val result = functions.getHttpsCallable("adminGetDashboard")
                .call(hashMapOf<String, Any>())
                .await()
            
            val raw = result.getData()
            @Suppress("UNCHECKED_CAST")
            val data = raw as? Map<*, *> ?: return Result.failure(Exception("Invalid response"))
            
            val yardsData = data["yards"] as? Map<*, *> ?: emptyMap<Any, Any>()
            val importsData = data["imports"] as? Map<*, *> ?: emptyMap<Any, Any>()
            val viewsData = data["views"] as? Map<*, *> ?: emptyMap<Any, Any>()
            
            val dashboard = AdminDashboardData(
                yards = AdminDashboardData.YardsStats(
                    pending = ((yardsData["pending"] as? Number)?.toInt()) ?: 0,
                    approved = ((yardsData["approved"] as? Number)?.toInt()) ?: 0,
                    needsInfo = ((yardsData["needsInfo"] as? Number)?.toInt()) ?: 0,
                    rejected = ((yardsData["rejected"] as? Number)?.toInt()) ?: 0
                ),
                imports = AdminDashboardData.ImportStats(
                    carsImportedLast7d = ((importsData["carsImportedLast7d"] as? Number)?.toInt()) ?: 0,
                    carsImportedLast30d = ((importsData["carsImportedLast30d"] as? Number)?.toInt()) ?: 0
                ),
                views = AdminDashboardData.ViewsStats(
                    totalCarViews = ((viewsData["totalCarViews"] as? Number)?.toInt()) ?: 0,
                    carViewsLast7d = ((viewsData["carViewsLast7d"] as? Number)?.toInt()) ?: 0,
                    carViewsLast30d = ((viewsData["carViewsLast30d"] as? Number)?.toInt()) ?: 0
                ),
                topYardsLast7d = (data["topYardsLast7d"] as? List<*>)?.mapNotNull { item ->
                    if (item is Map<*, *>) {
                        AdminDashboardData.TopYardItem(
                            yardUid = (item["yardUid"] as? String) ?: "",
                            displayName = (item["displayName"] as? String) ?: "",
                            views = ((item["views"] as? Number)?.toInt()) ?: 0
                        )
                    } else null
                } ?: emptyList(),
                topCarsLast7d = (data["topCarsLast7d"] as? List<*>)?.mapNotNull { item ->
                    if (item is Map<*, *>) {
                        AdminDashboardData.TopCarItem(
                            yardUid = (item["yardUid"] as? String) ?: "",
                            yardName = (item["yardName"] as? String) ?: "",
                            carId = (item["carId"] as? String) ?: "",
                            views = ((item["views"] as? Number)?.toInt()) ?: 0
                        )
                    } else null
                } ?: emptyList()
            )
            
            Result.success(dashboard)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting dashboard", e)
            Result.failure(e)
        }
    }
    
    override suspend fun listYards(
        status: YardStatus?,
        searchQuery: String?,
        pageToken: String?
    ): Result<YardListPage> {
        return try {
            val data = hashMapOf<String, Any>()
            if (status != null) {
                data["status"] = status.name
            }
            if (searchQuery != null && searchQuery.isNotBlank()) {
                data["searchQuery"] = searchQuery
            }
            if (pageToken != null) {
                data["pageToken"] = pageToken
            }
            
            val result = functions.getHttpsCallable("adminListYards")
                .call(data)
                .await()
            
            val raw = result.getData()
            @Suppress("UNCHECKED_CAST")
            val resultData = raw as? Map<*, *> ?: return Result.failure(Exception("Invalid response"))
            val items = (resultData["items"] as? List<*>)?.mapNotNull { item ->
                if (item is Map<*, *>) {
                    AdminYardSummary(
                        yardUid = (item["yardUid"] as? String) ?: "",
                        displayName = (item["displayName"] as? String) ?: "",
                        city = (item["city"] as? String) ?: "",
                        phone = (item["phone"] as? String) ?: "",
                        status = YardStatus.fromString(item["status"] as? String),
                        hasImportProfile = (item["hasImportProfile"] as? Boolean) ?: false
                    )
                } else null
            } ?: emptyList()
            
            Result.success(
                YardListPage(
                    items = items,
                    nextPageToken = resultData["nextPageToken"] as? String
                )
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error listing yards", e)
            Result.failure(e)
        }
    }
    
    override suspend fun getYardDetails(yardUid: String): Result<AdminYardDetails> {
        return try {
            val result = functions.getHttpsCallable("adminGetYardDetails")
                .call(hashMapOf("yardUid" to yardUid))
                .await()
            
            val raw = result.getData()
            @Suppress("UNCHECKED_CAST")
            val resultData = raw as? Map<*, *> ?: return Result.failure(Exception("Invalid response"))
            val yardData = resultData["yard"] as? Map<*, *> ?: return Result.failure(Exception("Yard not found"))
            val profileData = resultData["profile"] as? Map<*, *>
            
            val core = AdminYardDetails.AdminYardCore(
                yardUid = (yardData["yardUid"] as? String) ?: yardUid,
                displayName = (yardData["displayName"] as? String) ?: "",
                phone = (yardData["phone"] as? String) ?: "",
                city = (yardData["city"] as? String) ?: "",
                status = YardStatus.fromString(yardData["status"] as? String),
                statusReason = yardData["statusReason"] as? String,
                importerId = (yardData["importProfile"] as? Map<*, *>)?.get("importerId") as? String,
                importerVersion = ((yardData["importProfile"] as? Map<*, *>)?.get("importerVersion") as? Number)?.toInt()
            )
            
            val profile = profileData?.let {
                AdminYardDetails.AdminYardProfileView(
                    legalName = it["legalName"] as? String,
                    companyId = it["companyId"] as? String,
                    addressCity = it["addressCity"] as? String,
                    addressStreet = it["addressStreet"] as? String,
                    usageValidUntil = it["usageValidUntil"] as? String
                )
            }
            
            Result.success(AdminYardDetails(core, profile))
        } catch (e: Exception) {
            Log.e(TAG, "Error getting yard details", e)
            Result.failure(e)
        }
    }
    
    override suspend fun updateYardStatus(
        yardUid: String,
        status: YardStatus,
        reason: String?
    ): Result<Unit> {
        return try {
            val data = hashMapOf<String, Any>(
                "yardUid" to yardUid,
                "status" to status.name
            )
            if (reason != null) {
                data["reason"] = reason
            }
            
            functions.getHttpsCallable("adminSetYardStatus")
                .call(data)
                .await()
            
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Error updating yard status", e)
            Result.failure(e)
        }
    }
    
    override suspend fun assignYardImporter(
        yardUid: String,
        importerId: String,
        importerVersion: Int
    ): Result<Unit> {
        return try {
            val data = hashMapOf<String, Any>(
                "yardUid" to yardUid,
                "importerId" to importerId,
                "importerVersion" to importerVersion
            )
            
            functions.getHttpsCallable("adminAssignYardImporter")
                .call(data)
                .await()
            
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Error assigning importer", e)
            Result.failure(e)
        }
    }
}
