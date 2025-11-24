package com.rentacar.app.ui.vm

import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.CatalogRepository
import com.rentacar.app.data.Customer
import com.rentacar.app.data.CustomerRepository
import com.rentacar.app.data.Payment
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationRepository
import com.rentacar.app.data.ReservationStatus
import com.rentacar.app.domain.CommissionCalculator
import com.rentacar.app.share.ShareService
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import org.apache.poi.ss.usermodel.Workbook
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

class ReservationViewModel(
    private val reservations: ReservationRepository,
    private val catalog: CatalogRepository,
    private val customers: CustomerRepository,
    private val requests: com.rentacar.app.data.RequestRepository? = null
) : ViewModel() {

    val reservationList: StateFlow<List<Reservation>> =
        reservations.getOpenReservations()
            .map { list ->
                android.util.Log.d("ReservationViewModel", "Open reservations flow updated: ${list.size} items")
                val now = System.currentTimeMillis()
                val filtered = list.filter { it.dateFrom >= now && it.status != ReservationStatus.Cancelled }
                android.util.Log.d("ReservationViewModel", "Filtered reservations: ${filtered.size} items")
                filtered
            }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val suppliers = catalog.suppliers().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val carTypes = catalog.carTypes().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val customerList = customers.listActive().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val allReservations = reservations.getAllReservations().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val agents = catalog.agents().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun branchesBySupplier(supplierId: Long) = catalog.branchesBySupplier(supplierId)

    fun reservation(id: Long): Flow<Reservation?> = reservations.getReservation(id)

    fun payments(reservationId: Long) = reservations.getPayments(reservationId)
    fun reservationsByCustomer(customerId: Long) = reservations.getByCustomer(customerId)
    fun reservationsBySupplier(supplierId: Long) = reservations.getBySupplier(supplierId)
    fun reservationsByAgent(agentId: Long) = reservations.getByAgent(agentId)
    fun reservationsByBranch(branchId: Long) = reservations.getByBranch(branchId)

    fun customer(id: Long) = customers.getById(id)

    fun createReservation(reservation: Reservation, onDone: (Long) -> Unit = {}) {
        viewModelScope.launch {
            val id = reservations.upsert(reservation)
            onDone(id)
        }
    }

    fun createCustomerAndReservation(
        firstName: String,
        lastName: String,
        phone: String,
        tzId: String? = null,
        address: String? = null,
        email: String? = null,
        isCompany: Boolean = false,
        reservationBuilder: (customerId: Long) -> Reservation,
        onDone: (Long) -> Unit = {}
    ) {
        viewModelScope.launch {
            val customerId = customers.upsert(
                Customer(
                    firstName = firstName,
                    lastName = lastName,
                    phone = phone,
                    tzId = tzId?.ifBlank { null },
                    address = address?.ifBlank { null },
                    email = email?.ifBlank { null },
                    isCompany = isCompany
                )
            )
            val reservation = reservationBuilder(customerId)
            val id = reservations.upsert(reservation)
            onDone(id)
        }
    }

    fun updateReservationStatus(reservation: Reservation, status: ReservationStatus) {
        viewModelScope.launch {
            reservations.update(reservation.copy(status = status, updatedAt = System.currentTimeMillis()))
        }
    }

    fun updateSupplierOrderNumber(reservation: Reservation, orderNumber: String?) {
        viewModelScope.launch {
            reservations.update(reservation.copy(supplierOrderNumber = orderNumber?.ifBlank { null }, updatedAt = System.currentTimeMillis()))
        }
    }

    fun addPayment(reservationId: Long, amount: Double, method: String, note: String? = null) {
        viewModelScope.launch {
            reservations.addPayment(Payment(reservationId = reservationId, amount = amount, date = System.currentTimeMillis(), method = method, note = note))
        }
    }

    fun deleteRequest(id: Long) {
        viewModelScope.launch {
            requests?.delete(id)
        }
    }

    fun addSupplier(name: String, phone: String? = null, address: String? = null, taxId: String? = null, email: String? = null, onDone: (Long) -> Unit = {}) {
        viewModelScope.launch {
            val id = catalog.upsertSupplier(com.rentacar.app.data.Supplier(name = name, phone = phone?.ifBlank { null }, address = address?.ifBlank { null }, taxId = taxId?.ifBlank { null }, email = email?.ifBlank { null }))
            onDone(id)
        }
    }

    fun addBranch(supplierId: Long, name: String, address: String? = null, onDone: (Long) -> Unit = {}) {
        viewModelScope.launch {
            val id = catalog.upsertBranch(com.rentacar.app.data.Branch(name = name, address = address?.ifBlank { null }, supplierId = supplierId))
            onDone(id)
        }
    }

    fun updateBranch(branch: com.rentacar.app.data.Branch, onDone: (Long) -> Unit = {}) {
        viewModelScope.launch {
            val id = catalog.upsertBranch(branch)
            onDone(id)
        }
    }

    fun updateReservation(reservation: Reservation, onDone: () -> Unit = {}) {
        viewModelScope.launch {
            android.util.Log.d("ReservationViewModel", "Updating reservation: ${reservation.id}")
            reservations.update(reservation)
            android.util.Log.d("ReservationViewModel", "Reservation updated successfully: ${reservation.id}")
            onDone()
        }
    }

    fun exportReservationsToExcel(
        context: Context,
        reservationsToExport: List<Reservation>,
        customers: List<Customer>,
        suppliers: List<com.rentacar.app.data.Supplier>,
        carTypes: List<com.rentacar.app.data.CarType>
    ) {
        viewModelScope.launch {
            try {
                if (reservationsToExport.isEmpty()) {
                    Toast.makeText(context, "אין הזמנות לייצוא", Toast.LENGTH_SHORT).show()
                    return@launch
                }

                // Create workbook & sheet
                val workbook: Workbook = XSSFWorkbook()
                val sheet = workbook.createSheet("הזמנות")

                // Helper function to format dates
                val dateFormat = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
                val dateTimeFormat = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault())
                fun formatDate(timestamp: Long): String = dateFormat.format(Date(timestamp))
                fun formatDateTime(timestamp: Long): String = dateTimeFormat.format(Date(timestamp))
                fun diffDays(start: Long, end: Long): Int = TimeUnit.MILLISECONDS.toDays(end - start).toInt()

                // Helper function to get status in Hebrew
                fun getStatusText(status: ReservationStatus): String = when (status) {
                    ReservationStatus.Draft -> "טיוטה"
                    ReservationStatus.SentToSupplier -> "נשלח לספק"
                    ReservationStatus.SentToCustomer -> "נשלח ללקוח"
                    ReservationStatus.Confirmed -> "אושר"
                    ReservationStatus.Paid -> "שולם"
                    ReservationStatus.Cancelled -> "בוטל"
                }

                // Header row
                val headerRow = sheet.createRow(0)
                val headers = listOf(
                    "מספר הזמנה",
                    "תאריך הקמה",
                    "שם לקוח",
                    "טלפון",
                    "תעודת זהות",
                    "ספק",
                    "סוג רכב",
                    "תאריך מ",
                    "תאריך עד",
                    "תאריך החזרה בפועל",
                    "ימים",
                    "מחיר",
                    "ק\"מ כלול",
                    "מסגרת אשראי",
                    "מספר הזמנה ספק",
                    "מספר חוזה חיצוני",
                    "סטטוס",
                    "נסגר",
                    "הצעת מחיר",
                    "עמלה",
                    "הערות"
                )
                headers.forEachIndexed { index, header ->
                    headerRow.createCell(index).setCellValue(header)
                }

                // Data rows
                reservationsToExport.forEachIndexed { index, reservation ->
                    val row = sheet.createRow(index + 1)
                    val customer = customers.find { it.id == reservation.customerId }
                    val supplier = suppliers.find { it.id == reservation.supplierId }
                    val carType = carTypes.find { it.id == reservation.carTypeId }

                    val days = diffDays(reservation.dateFrom, reservation.dateTo).coerceAtLeast(1)
                    val vatPct = reservation.vatPercentAtCreation ?: 17.0
                    val basePrice = if (reservation.includeVat) {
                        reservation.agreedPrice / (1 + vatPct / 100.0)
                    } else {
                        reservation.agreedPrice
                    }
                    val commission = CommissionCalculator.calculate(days, basePrice)

                    var colIndex = 0
                    row.createCell(colIndex++).setCellValue(reservation.id.toDouble())
                    row.createCell(colIndex++).setCellValue(formatDateTime(reservation.createdAt))
                    row.createCell(colIndex++).setCellValue(
                        listOfNotNull(customer?.firstName, customer?.lastName).joinToString(" ").ifBlank { "—" }
                    )
                    row.createCell(colIndex++).setCellValue(customer?.phone ?: "—")
                    row.createCell(colIndex++).setCellValue(customer?.tzId ?: "—")
                    row.createCell(colIndex++).setCellValue(supplier?.name ?: "—")
                    row.createCell(colIndex++).setCellValue(
                        reservation.carTypeName ?: carType?.name ?: "—"
                    )
                    row.createCell(colIndex++).setCellValue(formatDateTime(reservation.dateFrom))
                    row.createCell(colIndex++).setCellValue(formatDateTime(reservation.dateTo))
                    row.createCell(colIndex++).setCellValue(
                        reservation.actualReturnDate?.let { formatDateTime(it) } ?: "—"
                    )
                    row.createCell(colIndex++).setCellValue(days.toDouble())
                    row.createCell(colIndex++).setCellValue(reservation.agreedPrice)
                    row.createCell(colIndex++).setCellValue(reservation.kmIncluded.toDouble())
                    row.createCell(colIndex++).setCellValue(reservation.requiredHoldAmount.toDouble())
                    row.createCell(colIndex++).setCellValue(reservation.supplierOrderNumber ?: "—")
                    row.createCell(colIndex++).setCellValue(reservation.externalContractNumber ?: "—")
                    row.createCell(colIndex++).setCellValue(getStatusText(reservation.status))
                    row.createCell(colIndex++).setCellValue(if (reservation.isClosed) "כן" else "לא")
                    row.createCell(colIndex++).setCellValue(if (reservation.isQuote) "כן" else "לא")
                    row.createCell(colIndex++).setCellValue(commission.amount)
                    row.createCell(colIndex).setCellValue(reservation.notes ?: "—")
                }

                // Auto-size columns
                for (i in headers.indices) {
                    sheet.autoSizeColumn(i)
                }

                // Build file name: ניהול_הזמנות_dd-MM-yyyy.xlsx
                val dateStr = SimpleDateFormat("dd-MM-yyyy", Locale.getDefault()).format(Date())
                val fileName = "ניהול_הזמנות_${dateStr}.xlsx"

                // Convert workbook to bytes
                val outputStream = ByteArrayOutputStream()
                workbook.write(outputStream)
                workbook.close()
                val bytes = outputStream.toByteArray()
                outputStream.close()

                // Save and share
                val uri = ShareService.saveBytesToCacheAndGetUri(context, bytes, fileName)
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                context.startActivity(
                    Intent.createChooser(intent, "שיתוף ניהול הזמנות")
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            } catch (e: Exception) {
                android.util.Log.e("ReservationViewModel", "Error exporting to Excel", e)
                Toast.makeText(context, "שגיאה בייצוא: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }
}
