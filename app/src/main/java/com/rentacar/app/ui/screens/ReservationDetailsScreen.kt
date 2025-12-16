package com.rentacar.app.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.rentacar.app.ui.vm.ReservationViewModel
import com.rentacar.app.data.ReservationStatus
import com.rentacar.app.pdf.PdfGenerator
import com.rentacar.app.share.ShareService
import com.rentacar.app.ui.components.BackButton
import com.rentacar.app.ui.components.AppButton
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.LocalTitleColor
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun ReservationDetailsScreen(navController: NavHostController, vm: ReservationViewModel, id: Long) {
    val reservation = vm.reservation(id).collectAsState(initial = null).value
    val payments = vm.payments(id).collectAsState(initial = emptyList()).value
    val suppliers = vm.suppliers.collectAsState().value
    val carTypes = vm.carTypes.collectAsState().value
    val customer = reservation?.let { vm.customer(it.customerId).collectAsState(initial = null).value }
    val branches = reservation?.let { vm.branchesBySupplier(it.supplierId).collectAsState(initial = emptyList()).value } ?: emptyList()

    var orderNumber by rememberSaveable { mutableStateOf(reservation?.supplierOrderNumber ?: "") }
    LaunchedEffect(reservation?.supplierOrderNumber) {
        val current = reservation?.supplierOrderNumber ?: ""
        if (orderNumber != current) orderNumber = current
    }
    var paymentAmount by rememberSaveable { mutableStateOf("") }
    val paymentMethods = listOf("מזומן", "אשראי", "צ'ק", "דיגיטלי")
    var paymentMethod by rememberSaveable { mutableStateOf(paymentMethods.first()) }
    var methodExpanded by rememberSaveable { mutableStateOf(false) }
    // בוטל לפי בקשה: אין צ'קבוקס "שולם" במסך זה
    var showShareDialog by rememberSaveable { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        TitleBar("תשלומים להזמנה #$id", LocalTitleColor.current, onHomeClick = { navController.navigate(com.rentacar.app.ui.navigation.Routes.Dashboard) })
        val supplierName = reservation?.let { r -> suppliers.find { it.id == r.supplierId }?.name } ?: ""
        val branchName = reservation?.let { r -> 
            if (r.airportMode) {
                "נתב\"ג"
            } else {
                branches.find { it.id == r.branchId }?.name ?: ""
            }
        } ?: ""
        if (supplierName.isNotBlank() || branchName.isNotBlank()) {
            Text("ספק: ${supplierName} | סניף: ${branchName}")
        }
        val customerName = listOfNotNull(customer?.firstName, customer?.lastName).joinToString(" ")
        if (customerName.isNotBlank()) {
            Text("לקוח: ${customerName}")
        }
        Text("סטטוס נוכחי: ${reservation?.status ?: ""}")
        Spacer(Modifier.height(8.dp))
        val isClosed = reservation?.isClosed ?: false
        val isCancelled = reservation?.status == ReservationStatus.Cancelled
        Row(modifier = Modifier.fillMaxWidth()) {
            Checkbox(checked = isClosed, onCheckedChange = null)
            Text("סגורה")
        }
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(orderNumber, { orderNumber = it }, label = { Text("מס׳ הזמנה מהספק") }, singleLine = true, modifier = Modifier.fillMaxWidth(), enabled = !isClosed)
        Spacer(Modifier.height(8.dp))

        // Actions: Save and Send PDF (RTL Hebrew)
        Spacer(Modifier.height(16.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween) {
            AppButton(enabled = reservation != null, onClick = { showShareDialog = true }) { Text("שליחה") }
            AppButton(onClick = {
                reservation?.let { r ->
                    if (!isClosed && !isCancelled) vm.updateSupplierOrderNumber(r, orderNumber)
                }
            }, enabled = reservation != null && !isClosed && !isCancelled) { Text("שמור") }
        }
        if (showShareDialog && reservation != null) {
            val r = reservation
            val dfDate = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
            val dfTime = SimpleDateFormat("HH:mm", Locale.getDefault())
            val fromDate = dfDate.format(Date(r.dateFrom))
            val toDate = dfDate.format(Date(r.dateTo))
            val fromTime = dfTime.format(Date(r.dateFrom))
            val toTime = dfTime.format(Date(r.dateTo))
            val days = (((r.dateTo - r.dateFrom) / (1000*60*60*24))).toInt()
            val custName = listOfNotNull(customer?.firstName, customer?.lastName).joinToString(" ")
            val phone = customer?.phone ?: ""
            val tz = customer?.tzId ?: ""
            val carTypeName = r.carTypeName ?: (carTypes.find { it.id == r.carTypeId }?.name ?: r.carTypeId.toString())
            val branchNamePdf = if (r.airportMode) {
                "נתב\"ג"
            } else {
                val branchObj = branches.find { it.id == r.branchId }
                branchObj?.let { b ->
                    val addr = listOfNotNull(b.city, b.street, b.address).joinToString(" ").trim()
                    if (addr.isNotBlank()) "${b.name} – ${addr}" else b.name
                } ?: r.branchId.toString()
            }
            val supplierNamePdf = suppliers.find { it.id == r.supplierId }?.name ?: r.supplierId.toString()
            val lines = buildList<String> {
                add(if (r.isQuote) "הצעת מחיר #$id" else "הזמנה #$id")
                add("תאריך יציאה: $fromDate $fromTime  |  תאריך חזרה: $toDate $toTime  |  ימים: $days")
                add("לקוח: $custName  |  טלפון: $phone  |  ת" + "ז: $tz")
                add("ספק: $supplierNamePdf  |  סניף: $branchNamePdf")
                add("סוג רכב: $carTypeName")
                add("מחיר מסוכם: ${r.agreedPrice.toInt()} ₪  |  ק" + "מ כלול: ${r.kmIncluded}")
                add("מסגרת אשראי נדרשת: ${r.requiredHoldAmount} ₪")
                r.supplierOrderNumber?.let { add("מס׳ הזמנה מהספק: $it") }
                add("סטטוס: ${r.status}")
                r.notes?.takeIf { it.isNotBlank() }?.let { add("הערות: $it") }
            }
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { showShareDialog = false },
                confirmButton = {},
                dismissButton = { AppButton(onClick = { showShareDialog = false }) { Text("סגור") } },
                title = { Text("בחר סוג שליחה") },
                text = {
                    Column {
                        AppButton(onClick = {
                            ShareService.shareText(navController.context, ShareService.buildSupplierText(
                                firstName = customer?.firstName ?: "",
                                lastName = customer?.lastName ?: "",
                                phone = phone,
                                tzId = tz,
                                email = customer?.email,
                                fromDate = fromDate,
                                toDate = toDate,
                                days = days,
                                carType = carTypeName,
                                price = r.agreedPrice,
                                kmIncluded = r.kmIncluded,
                                branch = branchNamePdf,
                                supplier = supplierNamePdf,
                                holdAmount = r.requiredHoldAmount,
                                holdNote = ""
                            ))
                            showShareDialog = false
                        }) { Text("טקסט") }
                        Spacer(Modifier.height(8.dp))
                        AppButton(onClick = {
                            val pdf = PdfGenerator.generateSimpleReservationPdf(
                                lines + listOf(
                                    "",
                                    "תנאים והגבלות (יש להגיע עם):",
                                    "1. רישיון נהיגה מקורי בתוקף.",
                                    "2. תעודת זהות מקורית.",
                                    "3. כרטיס אשראי עם מסגרת פנויה (מינ׳ 2,000 ₪ או לפי מדיניות הספק). בעל הכרטיס צריך להיות נוכח.",
                                    "4. החברה אינה מתחייבת לדגם או צבע.",
                                    "5. אי הגעה בזמן הנקוב עלולה לגרום לביטול ההזמנה!"
                                ),
                                rtl = true
                            )
                            ShareService.sharePdf(navController.context, pdf)
                            showShareDialog = false
                        }) { Text("PDF") }
                        Spacer(Modifier.height(8.dp))
                        AppButton(onClick = {
                            val png = ShareService.generateImageFromLines(lines, rtl = true)
                            ShareService.shareImage(navController.context, png)
                            showShareDialog = false
                        }) { Text("תמונה") }
                        // Share supplier documents option - only show if supplier is available
                        if (reservation?.supplierId != null) {
                            Spacer(Modifier.height(8.dp))
                            AppButton(onClick = {
                                showShareDialog = false
                                navController.navigate("supplier_documents/${reservation.supplierId}")
                            }) { Text("שתף מסמכי ספק") }
                        }
                    }
                }
            )
        }
    }
}
