package com.rentacar.app.data.sync

import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.QuerySnapshot
import com.rentacar.app.data.*
import com.rentacar.app.data.ReservationStatus
import com.rentacar.app.data.AppDatabase
import com.rentacar.app.data.auth.CurrentUserProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

data class CloudRestoreResult(
    val restoredCounts: Map<String, Int>, // entityType -> count restored
    val errors: List<String>              // EN messages for any failed step
)

class CloudToLocalRestoreRepository(
    private val db: AppDatabase,
    private val firestore: FirebaseFirestore,
    private val currentUserProvider: CurrentUserProvider
) {
    
    companion object {
        private const val TAG = "cloud_restore"
    }
    
    suspend fun restoreMissingDataFromCloud(): CloudRestoreResult = withContext(Dispatchers.IO) {
        val currentUid = currentUserProvider.requireCurrentUid()
        val restoredCounts = mutableMapOf<String, Int>()
        val errors = mutableListOf<String>()
        
        // Restore each entity type
        restoreCustomers(currentUid, restoredCounts, errors)
        restoreSuppliers(currentUid, restoredCounts, errors)
        restoreAgents(currentUid, restoredCounts, errors)
        restoreCarTypes(currentUid, restoredCounts, errors)
        restoreBranches(currentUid, restoredCounts, errors)
        restoreReservations(currentUid, restoredCounts, errors)
        restorePayments(currentUid, restoredCounts, errors)
        restoreCommissionRules(currentUid, restoredCounts, errors)
        restoreCardStubs(currentUid, restoredCounts, errors)
        restoreRequests(currentUid, restoredCounts, errors)
        restoreCarSales(currentUid, restoredCounts, errors)
        
        return@withContext CloudRestoreResult(
            restoredCounts = restoredCounts,
            errors = errors
        )
    }
    
    private suspend fun restoreCustomers(
        currentUid: String,
        restoredCounts: MutableMap<String, Int>,
        errors: MutableList<String>
    ) {
        try {
            val collection = UserCollections.userCollection(firestore, "customers")
            val snapshot: QuerySnapshot = collection
                .get()
                .await()
            
            Log.d(TAG, "Fetched ${snapshot.size()} customers from Firestore")
            
            var restored = 0
            var updated = 0
            for (doc in snapshot.documents) {
                try {
                    val data = doc.data ?: continue
                    val id = (data["id"] as? Number)?.toLong() ?: continue
                    val remoteUpdatedAt = (data["updatedAt"] as? Number)?.toLong() ?: System.currentTimeMillis()
                    
                    // Check if exists
                    val existing = db.customerDao().getById(id, currentUid).firstOrNull()
                    
                    if (existing == null) {
                        // Insert new
                        val customer = Customer(
                            id = id,
                            firstName = (data["firstName"] as? String) ?: "",
                            lastName = (data["lastName"] as? String) ?: "",
                            phone = (data["phone"] as? String) ?: "",
                            tzId = data["tzId"] as? String,
                            address = data["address"] as? String,
                            email = data["email"] as? String,
                            isCompany = (data["isCompany"] as? Boolean) ?: false,
                            active = (data["active"] as? Boolean) ?: true,
                            createdAt = (data["createdAt"] as? Number)?.toLong() ?: System.currentTimeMillis(),
                            updatedAt = remoteUpdatedAt,
                            userUid = currentUid
                        )
                        
                        db.customerDao().insertIgnore(customer)
                        restored++
                    } else {
                        // Entity exists - check if remote is newer (has updatedAt field)
                        if (remoteUpdatedAt > existing.updatedAt) {
                            // Remote is newer - update local
                            val updatedCustomer = existing.copy(
                                firstName = (data["firstName"] as? String) ?: existing.firstName,
                                lastName = (data["lastName"] as? String) ?: existing.lastName,
                                phone = (data["phone"] as? String) ?: existing.phone,
                                tzId = data["tzId"] as? String ?: existing.tzId,
                                address = data["address"] as? String ?: existing.address,
                                email = data["email"] as? String ?: existing.email,
                                isCompany = (data["isCompany"] as? Boolean) ?: existing.isCompany,
                                active = (data["active"] as? Boolean) ?: existing.active,
                                updatedAt = remoteUpdatedAt,
                                userUid = existing.userUid ?: currentUid
                            )
                            db.customerDao().upsert(updatedCustomer)
                            updated++
                        }
                        // If local is newer or equal, skip update (no deletes, no overwrites)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error restoring customer ${doc.id}", e)
                    errors.add("Customer ${doc.id}: ${e.message}")
                }
            }
            
            restoredCounts["customer"] = restored + updated
            Log.d(TAG, "Restored $restored customers, updated $updated customers (action=RESTORE_INSERT/RESTORE_UPDATE)")
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching customers from Firestore", e)
            errors.add("Failed to fetch customers: ${e.message}")
        }
    }
    
    private suspend fun restoreSuppliers(
        currentUid: String,
        restoredCounts: MutableMap<String, Int>,
        errors: MutableList<String>
    ) {
        try {
            val collection = UserCollections.userCollection(firestore, "suppliers")
            val snapshot: QuerySnapshot = collection
                .get()
                .await()
            
            Log.d(TAG, "Fetched ${snapshot.size()} suppliers from Firestore")
            
            var restored = 0
            for (doc in snapshot.documents) {
                try {
                    val data = doc.data ?: continue
                    val id = (data["id"] as? Number)?.toLong() ?: continue
                    
                    val exists = db.supplierDao().getById(id, currentUid).firstOrNull() != null
                    if (exists) continue
                    
                    val supplier = Supplier(
                        id = id,
                        name = (data["name"] as? String) ?: "",
                        address = data["address"] as? String,
                        taxId = data["taxId"] as? String,
                        phone = data["phone"] as? String,
                        email = data["email"] as? String,
                        defaultHold = (data["defaultHold"] as? Number)?.toInt() ?: 2000,
                        fixedHold = (data["fixedHold"] as? Number)?.toInt(),
                        commissionDays1to6 = (data["commissionDays1to6"] as? Number)?.toInt(),
                        commissionDays7to23 = (data["commissionDays7to23"] as? Number)?.toInt(),
                        commissionDays24plus = (data["commissionDays24plus"] as? Number)?.toInt(),
                        activeTemplateId = (data["activeTemplateId"] as? Number)?.toLong(),
                        importFunctionCode = (data["importFunctionCode"] as? Number)?.toInt(),
                        importTemplateId = (data["importTemplateId"] as? Number)?.toLong(),
                        priceListImportFunctionCode = (data["priceListImportFunctionCode"] as? Number)?.toInt(),
                        userUid = currentUid
                    )
                    
                    db.supplierDao().insertIgnore(supplier)
                    restored++
                } catch (e: Exception) {
                    Log.e(TAG, "Error restoring supplier ${doc.id}", e)
                    errors.add("Supplier ${doc.id}: ${e.message}")
                }
            }
            
            restoredCounts["supplier"] = restored
            Log.d(TAG, "Restored $restored suppliers")
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching suppliers from Firestore", e)
            errors.add("Failed to fetch suppliers: ${e.message}")
        }
    }
    
    private suspend fun restoreAgents(
        currentUid: String,
        restoredCounts: MutableMap<String, Int>,
        errors: MutableList<String>
    ) {
        try {
            val collection = UserCollections.userCollection(firestore, "agents")
            val snapshot: QuerySnapshot = collection
                .get()
                .await()
            
            Log.d(TAG, "Fetched ${snapshot.size()} agents from Firestore")
            
            var restored = 0
            val existing = db.agentDao().getAll(currentUid).firstOrNull() ?: emptyList()
            val existingIds = existing.map { it.id }.toSet()
            
            for (doc in snapshot.documents) {
                try {
                    val data = doc.data ?: continue
                    val id = (data["id"] as? Number)?.toLong() ?: continue
                    
                    if (existingIds.contains(id)) continue
                    
                    val agent = Agent(
                        id = id,
                        name = (data["name"] as? String) ?: "",
                        phone = data["phone"] as? String,
                        email = data["email"] as? String,
                        active = (data["active"] as? Boolean) ?: true,
                        userUid = currentUid
                    )
                    
                    db.agentDao().insertIgnore(agent)
                    restored++
                } catch (e: Exception) {
                    Log.e(TAG, "Error restoring agent ${doc.id}", e)
                    errors.add("Agent ${doc.id}: ${e.message}")
                }
            }
            
            restoredCounts["agent"] = restored
            Log.d(TAG, "Restored $restored agents")
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching agents from Firestore", e)
            errors.add("Failed to fetch agents: ${e.message}")
        }
    }
    
    private suspend fun restoreCarTypes(
        currentUid: String,
        restoredCounts: MutableMap<String, Int>,
        errors: MutableList<String>
    ) {
        try {
            val collection = UserCollections.userCollection(firestore, "carTypes")
            val snapshot: QuerySnapshot = collection
                .get()
                .await()
            
            Log.d(TAG, "Fetched ${snapshot.size()} carTypes from Firestore")
            
            var restored = 0
            val existing = db.carTypeDao().getAll(currentUid).firstOrNull() ?: emptyList()
            val existingIds = existing.map { it.id }.toSet()
            
            for (doc in snapshot.documents) {
                try {
                    val data = doc.data ?: continue
                    val id = (data["id"] as? Number)?.toLong() ?: continue
                    
                    if (existingIds.contains(id)) continue
                    
                    val carType = CarType(
                        id = id,
                        name = (data["name"] as? String) ?: "",
                        userUid = currentUid
                    )
                    
                    db.carTypeDao().insertIgnore(carType)
                    restored++
                } catch (e: Exception) {
                    Log.e(TAG, "Error restoring carType ${doc.id}", e)
                    errors.add("CarType ${doc.id}: ${e.message}")
                }
            }
            
            restoredCounts["carType"] = restored
            Log.d(TAG, "Restored $restored carTypes")
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching carTypes from Firestore", e)
            errors.add("Failed to fetch carTypes: ${e.message}")
        }
    }
    
    private suspend fun restoreBranches(
        currentUid: String,
        restoredCounts: MutableMap<String, Int>,
        errors: MutableList<String>
    ) {
        try {
            val collection = UserCollections.userCollection(firestore, "branches")
            val snapshot: QuerySnapshot = collection
                .get()
                .await()
            
            Log.d(TAG, "Fetched ${snapshot.size()} branches from Firestore")
            
            var restored = 0
            val allSuppliers = db.supplierDao().getAll(currentUid).firstOrNull() ?: emptyList()
            val existingIds = mutableSetOf<Long>()
            
            for (supplier in allSuppliers) {
                val branches = db.branchDao().getBySupplier(supplier.id, currentUid).firstOrNull() ?: emptyList()
                existingIds.addAll(branches.map { it.id })
            }
            
            for (doc in snapshot.documents) {
                try {
                    val data = doc.data ?: continue
                    val id = (data["id"] as? Number)?.toLong() ?: continue
                    
                    if (existingIds.contains(id)) continue
                    
                    val branch = Branch(
                        id = id,
                        name = (data["name"] as? String) ?: "",
                        address = data["address"] as? String,
                        city = data["city"] as? String,
                        street = data["street"] as? String,
                        phone = data["phone"] as? String,
                        supplierId = (data["supplierId"] as? Number)?.toLong() ?: 0L,
                        userUid = currentUid
                    )
                    
                    db.branchDao().insertIgnore(branch)
                    restored++
                } catch (e: Exception) {
                    Log.e(TAG, "Error restoring branch ${doc.id}", e)
                    errors.add("Branch ${doc.id}: ${e.message}")
                }
            }
            
            restoredCounts["branch"] = restored
            Log.d(TAG, "Restored $restored branches")
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching branches from Firestore", e)
            errors.add("Failed to fetch branches: ${e.message}")
        }
    }
    
    private suspend fun restoreReservations(
        currentUid: String,
        restoredCounts: MutableMap<String, Int>,
        errors: MutableList<String>
    ) {
        try {
            val collection = UserCollections.userCollection(firestore, "reservations")
            val snapshot: QuerySnapshot = collection
                .get()
                .await()
            
            Log.d(TAG, "Fetched ${snapshot.size()} reservations from Firestore")
            
            var restored = 0
            var updated = 0
            for (doc in snapshot.documents) {
                try {
                    val data = doc.data ?: continue
                    val id = (data["id"] as? Number)?.toLong() ?: continue
                    val remoteUpdatedAt = (data["updatedAt"] as? Number)?.toLong() ?: System.currentTimeMillis()
                    
                    val existing = db.reservationDao().getById(id, currentUid).firstOrNull()
                    
                    if (existing == null) {
                        // Insert new
                        val statusStr = (data["status"] as? String) ?: "Draft"
                        val status = try {
                            ReservationStatus.valueOf(statusStr)
                        } catch (e: Exception) {
                            ReservationStatus.Draft
                        }
                        
                        val reservation = Reservation(
                            id = id,
                            customerId = (data["customerId"] as? Number)?.toLong() ?: 0L,
                            supplierId = (data["supplierId"] as? Number)?.toLong() ?: 0L,
                            branchId = (data["branchId"] as? Number)?.toLong() ?: 0L,
                            carTypeId = (data["carTypeId"] as? Number)?.toLong() ?: 0L,
                            carTypeName = data["carTypeName"] as? String,
                            agentId = (data["agentId"] as? Number)?.toLong(),
                            dateFrom = (data["dateFrom"] as? Number)?.toLong() ?: System.currentTimeMillis(),
                            dateTo = (data["dateTo"] as? Number)?.toLong() ?: System.currentTimeMillis(),
                            actualReturnDate = (data["actualReturnDate"] as? Number)?.toLong(),
                            includeVat = (data["includeVat"] as? Boolean) ?: true,
                            vatPercentAtCreation = (data["vatPercentAtCreation"] as? Number)?.toDouble(),
                            airportMode = (data["airportMode"] as? Boolean) ?: false,
                            agreedPrice = (data["agreedPrice"] as? Number)?.toDouble() ?: 0.0,
                            kmIncluded = (data["kmIncluded"] as? Number)?.toInt() ?: 0,
                            requiredHoldAmount = (data["requiredHoldAmount"] as? Number)?.toInt() ?: 2000,
                            periodTypeDays = (data["periodTypeDays"] as? Number)?.toInt() ?: 1,
                            commissionPercentUsed = (data["commissionPercentUsed"] as? Number)?.toDouble(),
                            status = status,
                            isClosed = (data["isClosed"] as? Boolean) ?: false,
                            supplierOrderNumber = data["supplierOrderNumber"] as? String,
                            externalContractNumber = data["externalContractNumber"] as? String,
                            notes = data["notes"] as? String,
                            isQuote = (data["isQuote"] as? Boolean) ?: false,
                            createdAt = (data["createdAt"] as? Number)?.toLong() ?: System.currentTimeMillis(),
                            updatedAt = remoteUpdatedAt,
                            userUid = currentUid
                        )
                        
                        db.reservationDao().insertIgnore(reservation)
                        restored++
                    } else {
                        // Entity exists - check if remote is newer (has updatedAt field)
                        if (remoteUpdatedAt > existing.updatedAt) {
                            // Remote is newer - update local
                            val statusStr = (data["status"] as? String) ?: existing.status.name
                            val status = try {
                                ReservationStatus.valueOf(statusStr)
                            } catch (e: Exception) {
                                existing.status
                            }
                            
                            val updatedReservation = existing.copy(
                                customerId = (data["customerId"] as? Number)?.toLong() ?: existing.customerId,
                                supplierId = (data["supplierId"] as? Number)?.toLong() ?: existing.supplierId,
                                branchId = (data["branchId"] as? Number)?.toLong() ?: existing.branchId,
                                carTypeId = (data["carTypeId"] as? Number)?.toLong() ?: existing.carTypeId,
                                carTypeName = data["carTypeName"] as? String ?: existing.carTypeName,
                                agentId = (data["agentId"] as? Number)?.toLong() ?: existing.agentId,
                                dateFrom = (data["dateFrom"] as? Number)?.toLong() ?: existing.dateFrom,
                                dateTo = (data["dateTo"] as? Number)?.toLong() ?: existing.dateTo,
                                actualReturnDate = (data["actualReturnDate"] as? Number)?.toLong() ?: existing.actualReturnDate,
                                includeVat = (data["includeVat"] as? Boolean) ?: existing.includeVat,
                                vatPercentAtCreation = (data["vatPercentAtCreation"] as? Number)?.toDouble() ?: existing.vatPercentAtCreation,
                                airportMode = (data["airportMode"] as? Boolean) ?: existing.airportMode,
                                agreedPrice = (data["agreedPrice"] as? Number)?.toDouble() ?: existing.agreedPrice,
                                kmIncluded = (data["kmIncluded"] as? Number)?.toInt() ?: existing.kmIncluded,
                                requiredHoldAmount = (data["requiredHoldAmount"] as? Number)?.toInt() ?: existing.requiredHoldAmount,
                                periodTypeDays = (data["periodTypeDays"] as? Number)?.toInt() ?: existing.periodTypeDays,
                                commissionPercentUsed = (data["commissionPercentUsed"] as? Number)?.toDouble() ?: existing.commissionPercentUsed,
                                status = status,
                                isClosed = (data["isClosed"] as? Boolean) ?: existing.isClosed,
                                supplierOrderNumber = data["supplierOrderNumber"] as? String ?: existing.supplierOrderNumber,
                                externalContractNumber = data["externalContractNumber"] as? String ?: existing.externalContractNumber,
                                notes = data["notes"] as? String ?: existing.notes,
                                isQuote = (data["isQuote"] as? Boolean) ?: existing.isQuote,
                                updatedAt = remoteUpdatedAt,
                                userUid = existing.userUid ?: currentUid
                            )
                            db.reservationDao().upsert(updatedReservation)
                            updated++
                        }
                        // If local is newer or equal, skip update (no deletes, no overwrites)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error restoring reservation ${doc.id}", e)
                    errors.add("Reservation ${doc.id}: ${e.message}")
                }
            }
            
            restoredCounts["reservation"] = restored + updated
            Log.d(TAG, "Restored $restored reservations, updated $updated reservations (action=RESTORE_INSERT/RESTORE_UPDATE)")
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching reservations from Firestore", e)
            errors.add("Failed to fetch reservations: ${e.message}")
        }
    }
    
    private suspend fun restorePayments(
        currentUid: String,
        restoredCounts: MutableMap<String, Int>,
        errors: MutableList<String>
    ) {
        try {
            val collection = UserCollections.userCollection(firestore, "payments")
            val snapshot: QuerySnapshot = collection
                .get()
                .await()
            
            Log.d(TAG, "Fetched ${snapshot.size()} payments from Firestore")
            
            var restored = 0
            val allReservations = db.reservationDao().getAll(currentUid).firstOrNull() ?: emptyList()
            val existingIds = mutableSetOf<Long>()
            
            for (reservation in allReservations) {
                val payments = db.paymentDao().getForReservation(reservation.id, currentUid).firstOrNull() ?: emptyList()
                existingIds.addAll(payments.map { it.id })
            }
            
            for (doc in snapshot.documents) {
                try {
                    val data = doc.data ?: continue
                    val id = (data["id"] as? Number)?.toLong() ?: continue
                    
                    if (existingIds.contains(id)) continue
                    
                    val payment = Payment(
                        id = id,
                        reservationId = (data["reservationId"] as? Number)?.toLong() ?: 0L,
                        amount = (data["amount"] as? Number)?.toDouble() ?: 0.0,
                        date = (data["date"] as? Number)?.toLong() ?: System.currentTimeMillis(),
                        method = (data["method"] as? String) ?: "",
                        note = data["note"] as? String,
                        userUid = currentUid
                    )
                    
                    db.paymentDao().insertIgnore(payment)
                    restored++
                } catch (e: Exception) {
                    Log.e(TAG, "Error restoring payment ${doc.id}", e)
                    errors.add("Payment ${doc.id}: ${e.message}")
                }
            }
            
            restoredCounts["payment"] = restored
            Log.d(TAG, "Restored $restored payments")
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching payments from Firestore", e)
            errors.add("Failed to fetch payments: ${e.message}")
        }
    }
    
    private suspend fun restoreCommissionRules(
        currentUid: String,
        restoredCounts: MutableMap<String, Int>,
        errors: MutableList<String>
    ) {
        try {
            val collection = UserCollections.userCollection(firestore, "commissionRules")
            val snapshot: QuerySnapshot = collection
                .get()
                .await()
            
            Log.d(TAG, "Fetched ${snapshot.size()} commissionRules from Firestore")
            
            var restored = 0
            val existing = db.commissionRuleDao().getAll(currentUid).firstOrNull() ?: emptyList()
            val existingIds = existing.map { it.id }.toSet()
            
            for (doc in snapshot.documents) {
                try {
                    val data = doc.data ?: continue
                    val id = (data["id"] as? Number)?.toLong() ?: continue
                    
                    if (existingIds.contains(id)) continue
                    
                    val rule = CommissionRule(
                        id = id,
                        minDays = (data["minDays"] as? Number)?.toInt() ?: 0,
                        maxDays = (data["maxDays"] as? Number)?.toInt(),
                        percent = (data["percent"] as? Number)?.toDouble() ?: 0.0,
                        userUid = currentUid
                    )
                    
                    db.commissionRuleDao().insertIgnore(rule)
                    restored++
                } catch (e: Exception) {
                    Log.e(TAG, "Error restoring commissionRule ${doc.id}", e)
                    errors.add("CommissionRule ${doc.id}: ${e.message}")
                }
            }
            
            restoredCounts["commissionRule"] = restored
            Log.d(TAG, "Restored $restored commissionRules")
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching commissionRules from Firestore", e)
            errors.add("Failed to fetch commissionRules: ${e.message}")
        }
    }
    
    private suspend fun restoreCardStubs(
        currentUid: String,
        restoredCounts: MutableMap<String, Int>,
        errors: MutableList<String>
    ) {
        try {
            val collection = UserCollections.userCollection(firestore, "cardStubs")
            val snapshot: QuerySnapshot = collection
                .get()
                .await()
            
            Log.d(TAG, "Fetched ${snapshot.size()} cardStubs from Firestore")
            
            var restored = 0
            val allReservations = db.reservationDao().getAll(currentUid).firstOrNull() ?: emptyList()
            val existingIds = mutableSetOf<Long>()
            
            for (reservation in allReservations) {
                val stubs = db.cardStubDao().getForReservation(reservation.id, currentUid).firstOrNull() ?: emptyList()
                existingIds.addAll(stubs.map { it.id })
            }
            
            for (doc in snapshot.documents) {
                try {
                    val data = doc.data ?: continue
                    val id = (data["id"] as? Number)?.toLong() ?: continue
                    
                    if (existingIds.contains(id)) continue
                    
                    val cardStub = CardStub(
                        id = id,
                        reservationId = (data["reservationId"] as? Number)?.toLong() ?: 0L,
                        brand = (data["brand"] as? String) ?: "",
                        last4 = (data["last4"] as? String) ?: "",
                        expMonth = (data["expMonth"] as? Number)?.toInt(),
                        expYear = (data["expYear"] as? Number)?.toInt(),
                        holderFirstName = data["holderFirstName"] as? String,
                        holderLastName = data["holderLastName"] as? String,
                        holderTz = data["holderTz"] as? String,
                        userUid = currentUid
                    )
                    
                    db.cardStubDao().insertIgnore(cardStub)
                    restored++
                } catch (e: Exception) {
                    Log.e(TAG, "Error restoring cardStub ${doc.id}", e)
                    errors.add("CardStub ${doc.id}: ${e.message}")
                }
            }
            
            restoredCounts["cardStub"] = restored
            Log.d(TAG, "Restored $restored cardStubs")
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching cardStubs from Firestore", e)
            errors.add("Failed to fetch cardStubs: ${e.message}")
        }
    }
    
    private suspend fun restoreRequests(
        currentUid: String,
        restoredCounts: MutableMap<String, Int>,
        errors: MutableList<String>
    ) {
        try {
            val collection = UserCollections.userCollection(firestore, "requests")
            val snapshot: QuerySnapshot = collection
                .get()
                .await()
            
            Log.d(TAG, "Fetched ${snapshot.size()} requests from Firestore")
            
            var restored = 0
            val existing = db.requestDao().getAll(currentUid).firstOrNull() ?: emptyList()
            val existingIds = existing.map { it.id }.toSet()
            
            for (doc in snapshot.documents) {
                try {
                    val data = doc.data ?: continue
                    val id = (data["id"] as? Number)?.toLong() ?: continue
                    
                    if (existingIds.contains(id)) continue
                    
                    val request = Request(
                        id = id,
                        isPurchase = (data["isPurchase"] as? Boolean) ?: false,
                        isQuote = (data["isQuote"] as? Boolean) ?: false,
                        firstName = (data["firstName"] as? String) ?: "",
                        lastName = (data["lastName"] as? String) ?: "",
                        phone = (data["phone"] as? String) ?: "",
                        carTypeName = (data["carTypeName"] as? String) ?: "",
                        createdAt = (data["createdAt"] as? Number)?.toLong() ?: System.currentTimeMillis(),
                        userUid = currentUid
                    )
                    
                    db.requestDao().insertIgnore(request)
                    restored++
                } catch (e: Exception) {
                    Log.e(TAG, "Error restoring request ${doc.id}", e)
                    errors.add("Request ${doc.id}: ${e.message}")
                }
            }
            
            restoredCounts["request"] = restored
            Log.d(TAG, "Restored $restored requests")
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching requests from Firestore", e)
            errors.add("Failed to fetch requests: ${e.message}")
        }
    }
    
    /**
     * Helper to safely convert Firestore Timestamp or Number to Long milliseconds.
     * Supports both Timestamp and Long/Number types for backward compatibility.
     */
    private fun anyToMillis(value: Any?): Long? = when (value) {
        is com.google.firebase.Timestamp -> value.toDate().time
        is Number -> value.toLong()
        else -> null
    }

    private suspend fun restoreCarSales(
        currentUid: String,
        restoredCounts: MutableMap<String, Int>,
        errors: MutableList<String>
    ) {
        try {
            val collection = UserCollections.userCollection(firestore, "carSales")
            val snapshot: QuerySnapshot = collection
                .get()
                .await()
            
            Log.i(TAG, "cloud_restore: carSales snapshot size=${snapshot.size()} for uid=$currentUid")
            
            var restored = 0
            var updated = 0
            val existingList = db.carSaleDao().getAll(currentUid).firstOrNull() ?: emptyList()
            val existingMap = existingList.associateBy { it.id }
            
            for (doc in snapshot.documents) {
                try {
                    val data = doc.data ?: continue
                    
                    // Check for numeric id field (required for restore)
                    val remoteIdAny = data["id"]
                    if (remoteIdAny !is Number) {
                        Log.w(TAG, "cloud_restore: skipping carSale doc=${doc.id} – missing numeric id field (id=$remoteIdAny)")
                        continue
                    }
                    val id = remoteIdAny.toLong()
                    
                    // Convert timestamps safely (supports both Timestamp and Long)
                    val createdAtMillis = anyToMillis(data["createdAt"]) ?: System.currentTimeMillis()
                    val updatedAtMillis = anyToMillis(data["updatedAt"]) ?: createdAtMillis
                    val saleDateMillis = anyToMillis(data["saleDate"]) ?: createdAtMillis
                    
                    val existing = existingMap[id]
                    
                    if (existing == null) {
                        // Insert new - include all fields (new V2 fields are nullable, so missing fields default to null)
                        val carSale = CarSale(
                            id = id,
                            firstName = (data["firstName"] as? String) ?: "",
                            lastName = (data["lastName"] as? String) ?: "",
                            phone = (data["phone"] as? String) ?: "",
                            carTypeName = (data["carTypeName"] as? String) ?: "",
                            saleDate = saleDateMillis,
                            salePrice = (data["salePrice"] as? Number)?.toDouble() ?: 0.0,
                            commissionPrice = (data["commissionPrice"] as? Number)?.toDouble() ?: 0.0,
                            notes = data["notes"] as? String,
                            createdAt = createdAtMillis,
                            updatedAt = updatedAtMillis,
                            userUid = currentUid,
                            // Yard fleet management fields (migration 33->34)
                            brand = data["brand"] as? String,
                            model = data["model"] as? String,
                            year = (data["year"] as? Number)?.toInt(),
                            mileageKm = (data["mileageKm"] as? Number)?.toInt(),
                            publicationStatus = data["publicationStatus"] as? String,
                            imagesJson = data["imagesJson"] as? String,
                            // CarListing V2 fields (migration 34->35)
                            roleContext = data["roleContext"] as? String,
                            saleOwnerType = data["saleOwnerType"] as? String,
                            brandId = data["brandId"] as? String,
                            modelFamilyId = data["modelFamilyId"] as? String,
                            generationId = data["generationId"] as? String,
                            variantId = data["variantId"] as? String,
                            engineId = data["engineId"] as? String,
                            transmissionId = data["transmissionId"] as? String,
                            engineDisplacementCc = (data["engineDisplacementCc"] as? Number)?.toInt(),
                            enginePowerHp = (data["enginePowerHp"] as? Number)?.toInt(),
                            fuelType = data["fuelType"] as? String,
                            gearboxType = data["gearboxType"] as? String,
                            gearCount = (data["gearCount"] as? Number)?.toInt(),
                            handCount = (data["handCount"] as? Number)?.toInt(),
                            bodyType = data["bodyType"] as? String,
                            ac = when (val acValue = data["ac"]) {
                                is Boolean -> acValue
                                is Number -> acValue.toInt() == 1
                                else -> null
                            },
                            ownershipDetails = data["ownershipDetails"] as? String,
                            licensePlatePartial = data["licensePlatePartial"] as? String,
                            vinLastDigits = data["vinLastDigits"] as? String,
                            color = data["color"] as? String,
                            // Import metadata fields (migration 37->38)
                            importJobId = data["importJobId"] as? String,
                            importedAt = (data["importedAt"] as? Number)?.toLong(),
                            isNewFromImport = when (val value = data["isNewFromImport"]) {
                                is Boolean -> value
                                is Number -> value.toInt() != 0
                                else -> false
                            }
                        )
                        
                        db.carSaleDao().insertIgnore(carSale)
                        restored++
                    } else {
                        // Entity exists - check if remote is newer (has updatedAt field)
                        if (updatedAtMillis > existing.updatedAt) {
                            // Remote is newer - update local (include all fields, new V2 fields default to null if missing)
                            val updatedCarSale = existing.copy(
                                firstName = (data["firstName"] as? String) ?: existing.firstName,
                                lastName = (data["lastName"] as? String) ?: existing.lastName,
                                phone = (data["phone"] as? String) ?: existing.phone,
                                carTypeName = (data["carTypeName"] as? String) ?: existing.carTypeName,
                                saleDate = saleDateMillis,
                                salePrice = (data["salePrice"] as? Number)?.toDouble() ?: existing.salePrice,
                                commissionPrice = (data["commissionPrice"] as? Number)?.toDouble() ?: existing.commissionPrice,
                                notes = data["notes"] as? String ?: existing.notes,
                                updatedAt = updatedAtMillis,
                                userUid = existing.userUid ?: currentUid,
                                // Yard fleet management fields (migration 33->34)
                                brand = data["brand"] as? String ?: existing.brand,
                                model = data["model"] as? String ?: existing.model,
                                year = (data["year"] as? Number)?.toInt() ?: existing.year,
                                mileageKm = (data["mileageKm"] as? Number)?.toInt() ?: existing.mileageKm,
                                publicationStatus = data["publicationStatus"] as? String ?: existing.publicationStatus,
                                imagesJson = data["imagesJson"] as? String ?: existing.imagesJson,
                                // CarListing V2 fields (migration 34->35)
                                roleContext = data["roleContext"] as? String ?: existing.roleContext,
                                saleOwnerType = data["saleOwnerType"] as? String ?: existing.saleOwnerType,
                                brandId = data["brandId"] as? String ?: existing.brandId,
                                modelFamilyId = data["modelFamilyId"] as? String ?: existing.modelFamilyId,
                                generationId = data["generationId"] as? String ?: existing.generationId,
                                variantId = data["variantId"] as? String ?: existing.variantId,
                                engineId = data["engineId"] as? String ?: existing.engineId,
                                transmissionId = data["transmissionId"] as? String ?: existing.transmissionId,
                                engineDisplacementCc = (data["engineDisplacementCc"] as? Number)?.toInt() ?: existing.engineDisplacementCc,
                                enginePowerHp = (data["enginePowerHp"] as? Number)?.toInt() ?: existing.enginePowerHp,
                                fuelType = data["fuelType"] as? String ?: existing.fuelType,
                                gearboxType = data["gearboxType"] as? String ?: existing.gearboxType,
                                gearCount = (data["gearCount"] as? Number)?.toInt() ?: existing.gearCount,
                                handCount = (data["handCount"] as? Number)?.toInt() ?: existing.handCount,
                                bodyType = data["bodyType"] as? String ?: existing.bodyType,
                                ac = when (val acValue = data["ac"]) {
                                    is Boolean -> acValue
                                    is Number -> acValue.toInt() == 1
                                    else -> null
                                } ?: existing.ac,
                                ownershipDetails = data["ownershipDetails"] as? String ?: existing.ownershipDetails,
                                licensePlatePartial = data["licensePlatePartial"] as? String ?: existing.licensePlatePartial,
                                vinLastDigits = data["vinLastDigits"] as? String ?: existing.vinLastDigits,
                                color = data["color"] as? String ?: existing.color,
                                // Import metadata fields (migration 37->38)
                                importJobId = data["importJobId"] as? String ?: existing.importJobId,
                                importedAt = (data["importedAt"] as? Number)?.toLong() ?: existing.importedAt,
                                isNewFromImport = when (val value = data["isNewFromImport"]) {
                                    is Boolean -> value
                                    is Number -> value.toInt() != 0
                                    else -> existing.isNewFromImport
                                }
                            )
                            db.carSaleDao().upsert(updatedCarSale)
                            updated++
                        }
                        // If local is newer or equal, skip update (no deletes, no overwrites)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error restoring carSale ${doc.id}", e)
                    errors.add("CarSale ${doc.id}: ${e.message}")
                }
            }
            
            restoredCounts["carSale"] = restored + updated
            Log.i(TAG, "cloud_restore: carSales restored=$restored updated=$updated for uid=$currentUid")
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching carSales from Firestore", e)
            errors.add("Failed to fetch carSales: ${e.message}")
        }
    }
}

