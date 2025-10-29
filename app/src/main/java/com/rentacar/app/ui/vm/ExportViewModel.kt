package com.rentacar.app.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import android.content.Context
import com.rentacar.app.reports.CsvExporter
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import androidx.room.withTransaction
import com.rentacar.app.prefs.SettingsStore

class ExportViewModel(
    private val db: AppDatabase,
    private val reservationRepo: ReservationRepository,
    private val catalogRepo: CatalogRepository,
    private val customerRepo: CustomerRepository
) : ViewModel() {

    // --- Robust JSON coercion helpers (tolerant to type mismatches and missing fields) ---
    private fun JSONObject.stringOrNull(name: String): String? =
        if (!has(name) || isNull(name)) null else optString(name).takeIf { it.isNotBlank() }

    private fun JSONObject.longOrNull(name: String): Long? {
        if (!has(name) || isNull(name)) return null
        return when (val v = opt(name)) {
            is Number -> v.toLong()
            is String -> v.filter { it.isDigit() || it == '-' }.toLongOrNull()
            is Boolean -> if (v) 1L else 0L
            else -> null
        }
    }

    private fun JSONObject.intOrNull(name: String): Int? {
        if (!has(name) || isNull(name)) return null
        return when (val v = opt(name)) {
            is Number -> v.toInt()
            is String -> v.filter { it.isDigit() || it == '-' }.toIntOrNull()
            is Boolean -> if (v) 1 else 0
            else -> null
        }
    }

    private fun JSONObject.doubleOrNull(name: String): Double? {
        if (!has(name) || isNull(name)) return null
        return when (val v = opt(name)) {
            is Number -> v.toDouble()
            is String -> run {
                val cleaned = buildString {
                    val s = v.trim().replace(',', '.')
                    s.forEach { ch -> if (ch.isDigit() || ch == '-' || ch == '.') append(ch) }
                }
                cleaned.toDoubleOrNull()
            }
            is Boolean -> if (v) 1.0 else 0.0
            else -> null
        }
    }

    private fun JSONObject.boolOrDefault(name: String, default: Boolean): Boolean {
        if (!has(name) || isNull(name)) return default
        return when (val v = opt(name)) {
            is Boolean -> v
            is Number -> v.toInt() != 0
            is String -> {
                val s = v.trim().lowercase()
                s == "true" || s == "1" || s == "yes" || s == "y" || s == "on"
            }
            else -> default
        }
    }

    private fun findArrayCaseInsensitive(container: JSONObject?, name: String): JSONArray? {
        if (container == null) return null
        container.optJSONArray(name)?.let { return it }
        val names = container.names()
        if (names != null) {
            for (i in 0 until names.length()) {
                val key = names.optString(i)
                if (key.equals(name, ignoreCase = true)) {
                    val valArr = container.optJSONArray(key)
                    if (valArr != null) return valArr
                }
            }
        }
        return null
    }

    fun buildSnapshotJson(onReady: (String) -> Unit) {
        viewModelScope.launch {
            val customers = customerRepo.listActive().first()
            val suppliers = catalogRepo.suppliers().first()
            val carTypes = catalogRepo.carTypes().first()
            val branches = suppliers.flatMap { sid -> db.branchDao().getBySupplier(sid.id).first() }
            val reservations = reservationRepo.getAllReservations().first()
            val payments = reservations.flatMap { r -> reservationRepo.getPayments(r.id).first() }
            val agents = catalogRepo.agents().first()
            val cardStubs = db.cardStubDao().getAll().first()
            val commissionRules = db.commissionRuleDao().getAll().first()
            val carSales = db.carSaleDao().getAll().first()
            val requests = db.requestDao().getAll().first()

            // Settings
            val ctx = db.openHelper.writableDatabase.path.let { } // dummy to access context not available; we will accept settings from a passed-in context via separate method
            // We don't have context here; use a fallback mechanism via injected builder below

            val root = JSONObject().apply {
                put("exportVersion", 5)
                put("generatedAt", System.currentTimeMillis())
                put("customers", JSONArray(customers.map { c -> JSONObject().apply {
                    put("id", c.id); put("firstName", c.firstName); put("lastName", c.lastName); put("phone", c.phone); put("tzId", c.tzId); put("address", c.address); put("email", c.email); put("isCompany", c.isCompany); put("active", c.active); put("createdAt", c.createdAt); put("updatedAt", c.updatedAt)
                } }))
                put("suppliers", JSONArray(suppliers.map { s -> JSONObject().apply {
                    put("id", s.id); put("name", s.name); put("phone", s.phone); put("address", s.address); put("taxId", s.taxId); put("email", s.email); put("defaultHold", s.defaultHold); put("fixedHold", s.fixedHold)
                } }))
                put("carTypes", JSONArray(carTypes.map { t -> JSONObject().apply { put("id", t.id); put("name", t.name) } }))
                put("branches", JSONArray(branches.map { b -> JSONObject().apply { put("id", b.id); put("name", b.name); put("address", b.address); put("city", b.city); put("street", b.street); put("phone", b.phone); put("supplierId", b.supplierId) } }))
                put("reservations", JSONArray(reservations.map { r -> JSONObject().apply {
                    put("id", r.id); put("customerId", r.customerId); put("supplierId", r.supplierId); put("branchId", r.branchId); put("carTypeId", r.carTypeId); put("carTypeName", r.carTypeName); put("agentId", r.agentId); put("dateFrom", r.dateFrom); put("dateTo", r.dateTo); put("actualReturnDate", r.actualReturnDate); put("includeVat", r.includeVat); put("vatPercentAtCreation", r.vatPercentAtCreation); put("airportMode", r.airportMode); put("periodTypeDays", r.periodTypeDays); put("agreedPrice", r.agreedPrice); put("kmIncluded", r.kmIncluded); put("requiredHoldAmount", r.requiredHoldAmount); put("status", r.status.name); put("isClosed", r.isClosed); put("supplierOrderNumber", r.supplierOrderNumber); put("notes", r.notes); put("createdAt", r.createdAt); put("updatedAt", r.updatedAt)
                } }))
                put("payments", JSONArray(payments.map { p -> JSONObject().apply {
                    put("id", p.id); put("reservationId", p.reservationId); put("amount", p.amount); put("date", p.date); put("method", p.method); put("note", p.note)
                } }))
                put("agents", JSONArray(agents.map { a -> JSONObject().apply { put("id", a.id); put("name", a.name); put("phone", a.phone); put("email", a.email); put("active", a.active) } }))
                put("cardStubs", JSONArray(cardStubs.map { cs -> JSONObject().apply {
                    put("id", cs.id)
                    put("reservationId", cs.reservationId)
                    put("brand", cs.brand)
                    put("last4", cs.last4)
                    put("expMonth", cs.expMonth)
                    put("expYear", cs.expYear)
                    put("holderFirstName", cs.holderFirstName)
                    put("holderLastName", cs.holderLastName)
                    put("holderTz", cs.holderTz)
                } }))
                put("commissionRules", JSONArray(commissionRules.map { cr -> JSONObject().apply {
                    put("id", cr.id); put("minDays", cr.minDays); put("maxDays", cr.maxDays); put("percent", cr.percent)
                } }))
                put("carSales", JSONArray(carSales.map { s -> JSONObject().apply {
                    put("id", s.id)
                    put("firstName", s.firstName)
                    put("lastName", s.lastName)
                    put("carTypeName", s.carTypeName)
                    put("saleDate", s.saleDate)
                    put("salePrice", s.salePrice)
                    put("commissionPrice", s.commissionPrice)
                    put("notes", s.notes)
                    put("createdAt", s.createdAt)
                    put("updatedAt", s.updatedAt)
                } }))
                put("requests", JSONArray(requests.map { r -> JSONObject().apply {
                    put("id", r.id)
                    put("isPurchase", r.isPurchase)
                    put("firstName", r.firstName)
                    put("lastName", r.lastName)
                    put("phone", r.phone)
                    put("carTypeName", r.carTypeName)
                    put("createdAt", r.createdAt)
                } }))
            }
            onReady(root.toString())
        }
    }

    suspend fun buildSettingsJson(context: Context): JSONObject {
        val settings = SettingsStore(context)
        val defaultHold = settings.defaultHold().first()
        val buttonColor = settings.buttonColor().first()
        val titleColor = settings.titleColor().first()
        val titleTextColor = settings.titleTextColor().first()
        val privateColor = settings.customerPrivateColor().first()
        val companyColor = settings.customerCompanyColor().first()
        val resFuture = settings.reservationIconFutureColor().first()
        val resToday = settings.reservationIconTodayColor().first()
        val resPast = settings.reservationIconPastColor().first()
        val c1to6 = settings.commissionDays1to6().first()
        val c7to23 = settings.commissionDays7to23().first()
        val c24plus = settings.commissionDays24plus().first()
        val cExtra30 = settings.commissionExtraPer30().first()
        val defaultSupplierName = settings.defaultSupplierName().first()
        return JSONObject().apply {
            put("defaultHold", defaultHold)
            put("buttonColor", buttonColor)
            put("titleColor", titleColor)
            put("titleTextColor", titleTextColor)
            put("customerPrivateColor", privateColor)
            put("customerCompanyColor", companyColor)
            put("defaultSupplierName", defaultSupplierName)
            // New title icon circle settings
            put("titleIconCircleEnabled", SettingsStore(context).titleIconCircleEnabled().first())
            put("titleIconCircleColor", SettingsStore(context).titleIconCircleColor().first())
            // Reservation icon colors
            put("reservationIconFutureColor", resFuture)
            put("reservationIconTodayColor", resToday)
            put("reservationIconPastColor", resPast)
            put("commissionDays1to6", c1to6)
            put("commissionDays7to23", c7to23)
            put("commissionDays24plus", c24plus)
            put("commissionExtraPer30", cExtra30)
        }
    }

    fun buildSnapshotJsonIncludingSettings(context: Context, onReady: (String) -> Unit) {
        viewModelScope.launch {
            val base = JSONObject(buildSnapshotJsonDeferred())
            val settings = buildSettingsJson(context)
            base.put("settings", settings)
            onReady(base.toString())
        }
    }

    private suspend fun buildSnapshotJsonDeferred(): String {
        return kotlinx.coroutines.suspendCancellableCoroutine { cont ->
            buildSnapshotJson { cont.resume(it) {} }
        }
    }

    // CSV builders (return content string via callback)
    fun buildCustomersCsv(onReady: (String) -> Unit) { viewModelScope.launch(Dispatchers.IO) {
        val customers = customerRepo.listActive().first()
        val headers = listOf("id","firstName","lastName","phone","tzId","address","email","isCompany","active","createdAt","updatedAt")
        val lines = buildList {
            add(headers.joinToString(","))
            customers.forEach { c ->
                add(
                    listOf(
                        c.id,
                        c.firstName,
                        c.lastName,
                        c.phone,
                        c.tzId ?: "",
                        c.address ?: "",
                        c.email ?: "",
                        c.isCompany,
                        c.active,
                        c.createdAt,
                        c.updatedAt
                    ).joinToString(",")
                )
            }
        }.joinToString("\n"); onReady(lines)
    } }

    fun buildSuppliersCsv(onReady: (String) -> Unit) { viewModelScope.launch(Dispatchers.IO) {
        val suppliers = catalogRepo.suppliers().first()
        val headers = listOf("id","name","phone","address","taxId","email","defaultHold","fixedHold")
        val lines = buildList {
            add(headers.joinToString(","))
            suppliers.forEach { s -> add(listOf(s.id,s.name,s.phone?:"",s.address?:"",s.taxId?:"",s.email?:"",s.defaultHold,s.fixedHold?:"").joinToString(",")) }
        }.joinToString("\n"); onReady(lines)
    } }

    fun buildBranchesCsv(onReady: (String) -> Unit) { viewModelScope.launch(Dispatchers.IO) {
        val suppliers = catalogRepo.suppliers().first()
        val branches = suppliers.flatMap { s -> db.branchDao().getBySupplier(s.id).first() }
        val headers = listOf("id","name","address","city","street","phone","supplierId")
        val lines = buildList { add(headers.joinToString(",")); branches.forEach { b -> add(listOf(b.id,b.name,b.address?:"",b.city?:"",b.street?:"",b.phone?:"",b.supplierId).joinToString(",")) } }.joinToString("\n"); onReady(lines)
    } }

    fun buildCarTypesCsv(onReady: (String) -> Unit) { viewModelScope.launch(Dispatchers.IO) {
        val types = catalogRepo.carTypes().first()
        val headers = listOf("id","name")
        val lines = buildList { add(headers.joinToString(",")); types.forEach { t -> add(listOf(t.id,t.name).joinToString(",")) } }.joinToString("\n"); onReady(lines)
    } }

    fun buildReservationsCsv(onReady: (String) -> Unit) { viewModelScope.launch(Dispatchers.IO) {
        val reservations = reservationRepo.getAllReservations().first()
        val headers = listOf("id","customerId","supplierId","branchId","carTypeId","carTypeName","agentId","dateFrom","dateTo","actualReturnDate","agreedPrice","kmIncluded","requiredHoldAmount","status","supplierOrderNumber","notes")
        val lines = buildList {
            add(headers.joinToString(","))
            reservations.forEach { r -> add(listOf(r.id,r.customerId,r.supplierId,r.branchId,r.carTypeId,r.carTypeName?:(""),r.agentId?:(""),r.dateFrom,r.dateTo,r.actualReturnDate?:(""),r.agreedPrice,r.kmIncluded,r.requiredHoldAmount,r.status.name,r.supplierOrderNumber?:(""), r.notes?:(""
            )).joinToString(",")) }
        }.joinToString("\n"); onReady(lines)
    } }

    fun buildAgentsCsv(onReady: (String) -> Unit) { viewModelScope.launch(Dispatchers.IO) {
        val agents = catalogRepo.agents().first()
        val headers = listOf("id","name","phone","email","active")
        val lines = buildList { add(headers.joinToString(",")); agents.forEach { a -> add(listOf(a.id,a.name,a.phone?:"",a.email?:"",a.active).joinToString(",")) } }.joinToString("\n"); onReady(lines)
    } }

    fun buildPaymentsCsv(onReady: (String) -> Unit) { viewModelScope.launch(Dispatchers.IO) {
        val reservations = reservationRepo.getAllReservations().first()
        val payments = reservations.flatMap { r -> reservationRepo.getPayments(r.id).first() }
        val headers = listOf("id","reservationId","amount","date","method","note")
        val lines = buildList { add(headers.joinToString(",")); payments.forEach { p -> add(listOf(p.id,p.reservationId,p.amount,p.date,p.method,p.note?:"").joinToString(",")) } }.joinToString("\n"); onReady(lines)
    } }

    fun exportCustomers(context: Context) { viewModelScope.launch { CsvExporter.shareCsv(context, CsvExporter.exportCustomers(context, customerRepo.listActive().first())) } }
    fun exportSuppliers(context: Context) { viewModelScope.launch { CsvExporter.shareCsv(context, CsvExporter.exportSuppliers(context, catalogRepo.suppliers().first())) } }
    fun exportBranches(context: Context) { viewModelScope.launch {
        val suppliers = catalogRepo.suppliers().first()
        val branches = suppliers.flatMap { s -> db.branchDao().getBySupplier(s.id).first() }
        CsvExporter.shareCsv(context, CsvExporter.exportBranches(context, branches))
    } }
    fun exportCarTypes(context: Context) { viewModelScope.launch { CsvExporter.shareCsv(context, CsvExporter.exportCarTypes(context, catalogRepo.carTypes().first())) } }
    fun exportReservations(context: Context) { viewModelScope.launch { CsvExporter.shareCsv(context, CsvExporter.exportReservations(context, reservationRepo.getAllReservations().first())) } }
    fun exportPayments(context: Context) { viewModelScope.launch {
        val reservations = reservationRepo.getAllReservations().first()
        val payments = reservations.flatMap { r -> reservationRepo.getPayments(r.id).first() }
        CsvExporter.shareCsv(context, CsvExporter.exportPayments(context, payments))
    } }
    
    fun exportCarSales(context: Context) { viewModelScope.launch { 
        val carSales = db.carSaleDao().getAll().first()
        CsvExporter.shareCsv(context, CsvExporter.exportCarSales(context, carSales))
    } }
    
    fun exportRequests(context: Context) { viewModelScope.launch { 
        val requests = db.requestDao().getAll().first()
        CsvExporter.shareCsv(context, CsvExporter.exportRequests(context, requests))
    } }

    fun importSnapshotJson(context: Context, uri: Uri, onDone: (Boolean) -> Unit) {
        android.util.Log.d("ExportViewModel", "importSnapshotJson STARTED for URI: $uri")
        viewModelScope.launch(Dispatchers.IO) {
            runCatching {
                android.util.Log.d("ExportViewModel", "Reading file from URI...")
                val json = context.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: run {
                    android.util.Log.e("ExportViewModel", "Failed to open input stream")
                    return@runCatching false
                }
                android.util.Log.d("ExportViewModel", "JSON loaded, length: ${json.length}")
                val root = JSONObject(json)
                android.util.Log.d("ExportViewModel", "JSON parsed successfully")
                val tables = root.optJSONObject("tables")
                android.util.Log.d("ExportViewModel", "Tables object found: ${tables != null}")
                fun arr(name: String): JSONArray =
                    findArrayCaseInsensitive(root, name)
                        ?: findArrayCaseInsensitive(tables, name)
                        ?: JSONArray()

                val reservations = arr("reservations")
                val customers = arr("customers")
                val suppliers = arr("suppliers")
                val carTypes = arr("carTypes")
                val branches = arr("branches")
                val payments = arr("payments")
                val agents = arr("agents")
                val cardStubs = arr("cardStubs")
                val commissionRules = arr("commissionRules")
                val carSales = arr("carSales")
                val settingsObj = root.optJSONObject("settings")
                val requests = arr("requests")

                db.withTransaction {
                    // Customers
                    for (i in 0 until customers.length()) {
                        val o = customers.getJSONObject(i)
                        runCatching {
                            db.customerDao().upsert(
                                Customer(
                                    id = o.longOrNull("id") ?: 0L,
                                    firstName = o.stringOrNull("firstName") ?: "",
                                    lastName = o.stringOrNull("lastName") ?: "",
                                    phone = o.stringOrNull("phone") ?: "",
                                    tzId = o.stringOrNull("tzId"),
                                    address = o.stringOrNull("address"),
                                    email = o.stringOrNull("email"),
                                    isCompany = o.boolOrDefault("isCompany", false),
                                    active = o.boolOrDefault("active", true),
                                    createdAt = o.longOrNull("createdAt") ?: System.currentTimeMillis(),
                                    updatedAt = o.longOrNull("updatedAt") ?: System.currentTimeMillis()
                                )
                            )
                        }
                    }
                    // Suppliers
                    for (i in 0 until suppliers.length()) {
                        val o = suppliers.getJSONObject(i)
                        runCatching {
                            db.supplierDao().upsert(
                                Supplier(
                                    id = o.longOrNull("id") ?: 0L,
                                    name = o.stringOrNull("name") ?: "",
                                    phone = o.stringOrNull("phone"),
                                    address = o.stringOrNull("address"),
                                    taxId = o.stringOrNull("taxId"),
                                    email = o.stringOrNull("email"),
                                    defaultHold = o.intOrNull("defaultHold") ?: 2000,
                                    fixedHold = o.intOrNull("fixedHold"),
                                    commissionDays1to6 = o.intOrNull("commissionDays1to6"),
                                    commissionDays7to23 = o.intOrNull("commissionDays7to23"),
                                    commissionDays24plus = o.intOrNull("commissionDays24plus"),
                                    activeTemplateId = o.longOrNull("activeTemplateId"),
                                    importFunctionCode = o.intOrNull("importFunctionCode"),
                                    importTemplateId = o.longOrNull("importTemplateId")
                                )
                            )
                        }
                    }
                    // Car types
                    for (i in 0 until carTypes.length()) {
                        val o = carTypes.getJSONObject(i)
                        runCatching { db.carTypeDao().upsert(CarType(id = o.longOrNull("id") ?: 0L, name = o.stringOrNull("name") ?: "")) }
                    }
                    // Branches
                    for (i in 0 until branches.length()) {
                        val o = branches.getJSONObject(i)
                        runCatching {
                            db.branchDao().upsert(
                                Branch(
                                    id = o.longOrNull("id") ?: 0L,
                                    name = o.stringOrNull("name") ?: "",
                                    address = o.stringOrNull("address"),
                                    city = o.stringOrNull("city"),
                                    street = o.stringOrNull("street"),
                                    phone = o.stringOrNull("phone"),
                                    supplierId = o.longOrNull("supplierId") ?: 0L
                                )
                            )
                        }
                    }
                    // Reservations
                    for (i in 0 until reservations.length()) {
                        val o = reservations.getJSONObject(i)
                        runCatching {
                            db.reservationDao().upsert(
                                Reservation(
                                    id = o.longOrNull("id") ?: 0L,
                                    customerId = o.longOrNull("customerId") ?: 0L,
                                    supplierId = o.longOrNull("supplierId") ?: 0L,
                                    branchId = o.longOrNull("branchId") ?: 0L,
                                    carTypeId = o.longOrNull("carTypeId") ?: 0L,
                                    carTypeName = o.stringOrNull("carTypeName"),
                                    agentId = o.longOrNull("agentId"),
                                    dateFrom = o.longOrNull("dateFrom") ?: 0L,
                                    dateTo = o.longOrNull("dateTo") ?: 0L,
                                    actualReturnDate = o.longOrNull("actualReturnDate"),
                                    includeVat = o.boolOrDefault("includeVat", true),
                                    vatPercentAtCreation = o.doubleOrNull("vatPercentAtCreation"),
                                    airportMode = o.boolOrDefault("airportMode", false),
                                    periodTypeDays = o.intOrNull("periodTypeDays") ?: 1,
                                    agreedPrice = o.doubleOrNull("agreedPrice") ?: 0.0,
                                    kmIncluded = o.intOrNull("kmIncluded") ?: 0,
                                    requiredHoldAmount = o.intOrNull("requiredHoldAmount") ?: 2000,
                                    status = runCatching { ReservationStatus.valueOf(o.stringOrNull("status") ?: "Draft") }.getOrDefault(ReservationStatus.Draft),
                                    isClosed = o.boolOrDefault("isClosed", false),
                                    supplierOrderNumber = o.stringOrNull("supplierOrderNumber"),
                                    externalContractNumber = o.stringOrNull("externalContractNumber"),
                                    notes = o.stringOrNull("notes"),
                                    isQuote = o.boolOrDefault("isQuote", false),
                                    createdAt = o.longOrNull("createdAt") ?: System.currentTimeMillis(),
                                    updatedAt = o.longOrNull("updatedAt") ?: System.currentTimeMillis()
                                )
                            )
                        }
                    }
                    // Payments
                    for (i in 0 until payments.length()) {
                        val o = payments.getJSONObject(i)
                        runCatching {
                            db.paymentDao().upsert(
                                Payment(
                                    id = o.longOrNull("id") ?: 0L,
                                    reservationId = o.longOrNull("reservationId") ?: 0L,
                                    amount = o.doubleOrNull("amount") ?: 0.0,
                                    date = o.longOrNull("date") ?: System.currentTimeMillis(),
                                    method = o.stringOrNull("method") ?: "",
                                    note = o.stringOrNull("note")
                                )
                            )
                        }
                    }
                    // Agents
                    for (i in 0 until agents.length()) {
                        val o = agents.getJSONObject(i)
                        runCatching {
                            db.agentDao().upsert(
                                Agent(
                                    id = o.longOrNull("id") ?: 0L,
                                    name = o.stringOrNull("name") ?: "",
                                    phone = o.stringOrNull("phone"),
                                    email = o.stringOrNull("email"),
                                    active = o.boolOrDefault("active", true)
                                )
                            )
                        }
                    }
                    // Card stubs
                    for (i in 0 until cardStubs.length()) {
                        val o = cardStubs.getJSONObject(i)
                        runCatching {
                            db.cardStubDao().upsert(
                                CardStub(
                                    id = o.longOrNull("id") ?: 0L,
                                    reservationId = o.longOrNull("reservationId") ?: 0L,
                                    brand = o.stringOrNull("brand") ?: "",
                                    last4 = o.stringOrNull("last4") ?: "",
                                    expMonth = o.intOrNull("expMonth"),
                                    expYear = o.intOrNull("expYear"),
                                    holderFirstName = o.stringOrNull("holderFirstName"),
                                    holderLastName = o.stringOrNull("holderLastName"),
                                    holderTz = o.stringOrNull("holderTz")
                                )
                            )
                        }
                    }
                    // Commission rules
                    for (i in 0 until commissionRules.length()) {
                        val o = commissionRules.getJSONObject(i)
                        runCatching {
                            db.commissionRuleDao().upsert(
                                CommissionRule(
                                    id = o.longOrNull("id") ?: 0L,
                                    minDays = o.intOrNull("minDays") ?: 0,
                                    maxDays = o.intOrNull("maxDays"),
                                    percent = o.doubleOrNull("percent") ?: 0.0
                                )
                            )
                        }
                    }
                    // Car sales
                    for (i in 0 until carSales.length()) {
                        val o = carSales.getJSONObject(i)
                        runCatching {
                            db.carSaleDao().upsert(
                                CarSale(
                                    id = o.longOrNull("id") ?: 0L,
                                    firstName = o.stringOrNull("firstName") ?: "",
                                    lastName = o.stringOrNull("lastName") ?: "",
                                    phone = o.stringOrNull("phone") ?: "",
                                    carTypeName = o.stringOrNull("carTypeName") ?: "",
                                    saleDate = o.longOrNull("saleDate") ?: System.currentTimeMillis(),
                                    salePrice = o.doubleOrNull("salePrice") ?: 0.0,
                                    commissionPrice = o.doubleOrNull("commissionPrice") ?: 0.0,
                                    notes = o.stringOrNull("notes"),
                                    createdAt = o.longOrNull("createdAt") ?: System.currentTimeMillis(),
                                    updatedAt = o.longOrNull("updatedAt") ?: System.currentTimeMillis()
                                )
                            )
                        }
                    }
                    // Requests
                    for (i in 0 until requests.length()) {
                        val o = requests.getJSONObject(i)
                        runCatching {
                            db.requestDao().upsert(
                                Request(
                                    id = o.longOrNull("id") ?: 0L,
                                    isPurchase = o.boolOrDefault("isPurchase", false),
                                    isQuote = o.boolOrDefault("isQuote", false),
                                    firstName = o.stringOrNull("firstName") ?: "",
                                    lastName = o.stringOrNull("lastName") ?: "",
                                    phone = o.stringOrNull("phone") ?: "",
                                    carTypeName = o.stringOrNull("carTypeName") ?: "",
                                    createdAt = o.longOrNull("createdAt") ?: System.currentTimeMillis()
                                )
                            )
                        }
                    }
                }

                // Import settings outside transaction
                settingsObj?.let { s ->
                    val settings = SettingsStore(context)
                    s.optInt("defaultHold", 2000).let { settings.setDefaultHold(it) }
                    s.optString("buttonColor").takeIf { it.isNotBlank() }?.let { settings.setButtonColor(it) }
                    s.optString("titleColor").takeIf { it.isNotBlank() }?.let { settings.setTitleColor(it) }
                    s.optString("titleTextColor").takeIf { it.isNotBlank() }?.let { settings.setTitleTextColor(it) }
                    s.optString("customerPrivateColor").takeIf { it.isNotBlank() }?.let { settings.setCustomerPrivateColor(it) }
                    s.optString("customerCompanyColor").takeIf { it.isNotBlank() }?.let { settings.setCustomerCompanyColor(it) }
                    // New title icon circle settings
                    settings.setTitleIconCircleEnabled(s.optBoolean("titleIconCircleEnabled", false))
                    s.optString("titleIconCircleColor").takeIf { it.isNotBlank() }?.let { settings.setTitleIconCircleColor(it) }
                    // Reservation icon colors
                    s.optString("reservationIconFutureColor").takeIf { it.isNotBlank() }?.let { settings.setReservationIconFutureColor(it) }
                    s.optString("reservationIconTodayColor").takeIf { it.isNotBlank() }?.let { settings.setReservationIconTodayColor(it) }
                    s.optString("reservationIconPastColor").takeIf { it.isNotBlank() }?.let { settings.setReservationIconPastColor(it) }
                    s.optString("commissionDays1to6").takeIf { it.isNotBlank() }?.let { settings.setCommissionDays1to6(it) }
                    s.optString("commissionDays7to23").takeIf { it.isNotBlank() }?.let { settings.setCommissionDays7to23(it) }
                    s.optString("commissionDays24plus").takeIf { it.isNotBlank() }?.let { settings.setCommissionDays24plus(it) }
                    s.optString("commissionExtraPer30").takeIf { it.isNotBlank() }?.let { settings.setCommissionExtraPer30(it) }
                    val defSup = s.optString("defaultSupplierName").ifBlank { null }
                    settings.setDefaultSupplierName(defSup)
                }
                true
            }.onSuccess { onDone(it) }.onFailure { onDone(false) }
        }
    }

    // Settings CSV
    fun buildSettingsCsv(context: Context, onReady: (String) -> Unit) { viewModelScope.launch(Dispatchers.IO) {
        val settings = SettingsStore(context)
        val defaultHold = settings.defaultHold().first()
        val buttonColor = settings.buttonColor().first()
        val titleColor = settings.titleColor().first()
        val titleTextColor = settings.titleTextColor().first()
        val privateColor = settings.customerPrivateColor().first()
        val companyColor = settings.customerCompanyColor().first()
        val defaultSupplierName = settings.defaultSupplierName().first()
        val titleIconCircleEnabled = settings.titleIconCircleEnabled().first()
        val titleIconCircleColor = settings.titleIconCircleColor().first()
        val resFuture = settings.reservationIconFutureColor().first()
        val resToday = settings.reservationIconTodayColor().first()
        val resPast = settings.reservationIconPastColor().first()
        val c1to6 = settings.commissionDays1to6().first()
        val c7to23 = settings.commissionDays7to23().first()
        val c24plus = settings.commissionDays24plus().first()
        val cExtra30 = settings.commissionExtraPer30().first()
        val headers = listOf("key","value")
        val rows = listOf(
            "defaultHold" to defaultHold.toString(),
            "buttonColor" to buttonColor,
            "titleColor" to titleColor,
            "titleTextColor" to titleTextColor,
            "customerPrivateColor" to privateColor,
            "customerCompanyColor" to companyColor,
            "defaultSupplierName" to (defaultSupplierName ?: ""),
            "titleIconCircleEnabled" to titleIconCircleEnabled.toString(),
            "titleIconCircleColor" to titleIconCircleColor,
            "reservationIconFutureColor" to resFuture,
            "reservationIconTodayColor" to resToday,
            "reservationIconPastColor" to resPast
            , "commissionDays1to6" to c1to6
            , "commissionDays7to23" to c7to23
            , "commissionDays24plus" to c24plus
            , "commissionExtraPer30" to cExtra30
        )
        val content = buildList {
            add(headers.joinToString(","))
            rows.forEach { (k,v) -> add(listOf(k,v).joinToString(",")) }
        }.joinToString("\n")
        onReady(content)
    } }

    fun importSettingsCsv(context: Context, uri: Uri, onDone: (Boolean) -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            runCatching {
                val content = context.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: return@runCatching false
                val lines = content.split('\n').map { it.trim() }.filter { it.isNotBlank() }
                if (lines.isEmpty()) return@runCatching false
                val settings = SettingsStore(context)
                lines.drop(1).forEach { line ->
                    val parts = line.split(',')
                    if (parts.size >= 2) {
                        val key = parts[0]
                        val value = parts.subList(1, parts.size).joinToString(",")
                        when (key) {
                            "defaultHold" -> value.toIntOrNull()?.let { settings.setDefaultHold(it) }
                            "buttonColor" -> settings.setButtonColor(value)
                            "titleColor" -> settings.setTitleColor(value)
                            "titleTextColor" -> settings.setTitleTextColor(value)
                            "customerPrivateColor" -> settings.setCustomerPrivateColor(value)
                            "customerCompanyColor" -> settings.setCustomerCompanyColor(value)
                            "defaultSupplierName" -> settings.setDefaultSupplierName(value.ifBlank { null })
                            "titleIconCircleEnabled" -> settings.setTitleIconCircleEnabled(value.equals("true", true))
                            "titleIconCircleColor" -> settings.setTitleIconCircleColor(value)
                            "reservationIconFutureColor" -> settings.setReservationIconFutureColor(value)
                            "reservationIconTodayColor" -> settings.setReservationIconTodayColor(value)
                            "reservationIconPastColor" -> settings.setReservationIconPastColor(value)
                            "commissionDays1to6" -> settings.setCommissionDays1to6(value)
                            "commissionDays7to23" -> settings.setCommissionDays7to23(value)
                            "commissionDays24plus" -> settings.setCommissionDays24plus(value)
                            "commissionExtraPer30" -> settings.setCommissionExtraPer30(value)
                        }
                    }
                }
                true
            }.onSuccess { onDone(it) }.onFailure { onDone(false) }
        }
    }

    // CSV importers per table (simple CSV without quoted commas)
    fun importCustomersCsv(context: Context, uri: Uri, onDone: (Boolean) -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            runCatching {
                val text = context.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: return@runCatching false
                val rows = text.split('\n').drop(1)
                db.withTransaction {
                    rows.forEach { line ->
                        val c = line.split(',')
                        if (c.size >= 11) {
                            db.customerDao().upsert(
                                Customer(
                                    id = c[0].toLongOrNull() ?: 0,
                                    firstName = c[1],
                                    lastName = c[2],
                                    phone = c[3],
                                    tzId = c[4].ifBlank { null },
                                    address = c[5].ifBlank { null },
                                    email = c[6].ifBlank { null },
                                    isCompany = c[7].toBooleanStrictOrNull() ?: false,
                                    active = c[8].toBooleanStrictOrNull() ?: true,
                                    createdAt = c[9].toLongOrNull() ?: System.currentTimeMillis(),
                                    updatedAt = c[10].toLongOrNull() ?: System.currentTimeMillis()
                                )
                            )
                        }
                    }
                }
                true
            }.onSuccess { onDone(it) }.onFailure { onDone(false) }
        }
    }

    fun importSuppliersCsv(context: Context, uri: Uri, onDone: (Boolean) -> Unit) { viewModelScope.launch(Dispatchers.IO) {
        runCatching {
            val text = context.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: return@runCatching false
            val rows = text.split('\n').drop(1)
            db.withTransaction {
                rows.forEach { line ->
                    val c = line.split(',')
                    if (c.size >= 8) {
                        db.supplierDao().upsert(
                            Supplier(
                                id = c[0].toLongOrNull() ?: 0,
                                name = c[1],
                                phone = c[2].ifBlank { null },
                                address = c[3].ifBlank { null },
                                taxId = c[4].ifBlank { null },
                                email = c[5].ifBlank { null },
                                defaultHold = c[6].toIntOrNull() ?: 2000,
                                fixedHold = c[7].toIntOrNull()
                            )
                        )
                    }
                }
            }
            true
        }.onSuccess { onDone(it) }.onFailure { onDone(false) }
    } }

    fun importBranchesCsv(context: Context, uri: Uri, onDone: (Boolean) -> Unit) { viewModelScope.launch(Dispatchers.IO) {
        runCatching {
            val text = context.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: return@runCatching false
            val rows = text.split('\n').drop(1)
            db.withTransaction {
                rows.forEach { line ->
                    val c = line.split(',')
                    if (c.size >= 7) {
                        db.branchDao().upsert(
                            Branch(
                                id = c[0].toLongOrNull() ?: 0,
                                name = c[1],
                                address = c[2].ifBlank { null },
                                city = c[3].ifBlank { null },
                                street = c[4].ifBlank { null },
                                phone = c[5].ifBlank { null },
                                supplierId = c[6].toLongOrNull() ?: 0
                            )
                        )
                    }
                }
            }
            true
        }.onSuccess { onDone(it) }.onFailure { onDone(false) }
    } }

    fun importCarTypesCsv(context: Context, uri: Uri, onDone: (Boolean) -> Unit) { viewModelScope.launch(Dispatchers.IO) {
        runCatching {
            val text = context.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: return@runCatching false
            val rows = text.split('\n').drop(1)
            db.withTransaction {
                rows.forEach { line ->
                    val c = line.split(',')
                    if (c.size >= 2) db.carTypeDao().upsert(CarType(id = c[0].toLongOrNull() ?: 0, name = c[1]))
                }
            }
            true
        }.onSuccess { onDone(it) }.onFailure { onDone(false) }
    } }

    fun importReservationsCsv(context: Context, uri: Uri, onDone: (Boolean) -> Unit) { viewModelScope.launch(Dispatchers.IO) {
        runCatching {
            val text = context.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: return@runCatching false
            val rows = text.split('\n').drop(1)
            db.withTransaction {
                rows.forEach { line ->
                    val c = line.split(',')
                    if (c.size >= 16) {
                        db.reservationDao().upsert(
                            Reservation(
                                id = c[0].toLongOrNull() ?: 0,
                                customerId = c[1].toLongOrNull() ?: 0,
                                supplierId = c[2].toLongOrNull() ?: 0,
                                branchId = c[3].toLongOrNull() ?: 0,
                                carTypeId = c[4].toLongOrNull() ?: 0,
                                carTypeName = c[5].ifBlank { null },
                                agentId = c[6].toLongOrNull(),
                                dateFrom = c[7].toLongOrNull() ?: 0,
                                dateTo = c[8].toLongOrNull() ?: 0,
                                actualReturnDate = c[9].toLongOrNull(),
                                agreedPrice = c[10].toDoubleOrNull() ?: 0.0,
                                kmIncluded = c[11].toIntOrNull() ?: 0,
                                requiredHoldAmount = c[12].toIntOrNull() ?: 2000,
                                status = runCatching { ReservationStatus.valueOf(c[13]) }.getOrDefault(ReservationStatus.Draft),
                                supplierOrderNumber = c[14].ifBlank { null },
                                notes = c[15].ifBlank { null },
                                isQuote = c.getOrNull(16)?.toBooleanStrictOrNull() ?: false
                            )
                        )
                    }
                }
            }
            true
        }.onSuccess { onDone(it) }.onFailure { onDone(false) }
    } }

    fun importPaymentsCsv(context: Context, uri: Uri, onDone: (Boolean) -> Unit) { viewModelScope.launch(Dispatchers.IO) {
        runCatching {
            val text = context.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: return@runCatching false
            val rows = text.split('\n').drop(1)
            db.withTransaction {
                rows.forEach { line ->
                    val c = line.split(',')
                    if (c.size >= 6) {
                        db.paymentDao().upsert(
                            Payment(
                                id = c[0].toLongOrNull() ?: 0,
                                reservationId = c[1].toLongOrNull() ?: 0,
                                amount = c[2].toDoubleOrNull() ?: 0.0,
                                date = c[3].toLongOrNull() ?: System.currentTimeMillis(),
                                method = c[4],
                                note = c[5].ifBlank { null }
                            )
                        )
                    }
                }
            }
            true
        }.onSuccess { onDone(it) }.onFailure { onDone(false) }
    } }
}
