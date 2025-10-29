package com.rentacar.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.rentacar.app.ui.screens.DashboardScreen
import com.rentacar.app.ui.screens.NewReservationScreen
import com.rentacar.app.ui.screens.ReservationDetailsScreen
import com.rentacar.app.ui.screens.SettingsScreen
import com.rentacar.app.ui.screens.ReportsScreen
import com.rentacar.app.ui.screens.CustomersListScreen
import com.rentacar.app.ui.screens.CustomerEditScreen
import com.rentacar.app.di.DatabaseModule
import com.rentacar.app.ui.vm.ReservationViewModel
import androidx.compose.ui.platform.LocalContext
import com.rentacar.app.ui.vm.CustomerViewModel
import com.rentacar.app.ui.vm.SuppliersViewModel
import com.rentacar.app.ui.vm.ExportViewModel
import com.rentacar.app.ui.screens.SuppliersListScreen
import com.rentacar.app.ui.screens.SupplierEditScreen
import com.rentacar.app.ui.screens.SupplierBranchesScreen
import com.rentacar.app.ui.screens.AgentsListScreen
import com.rentacar.app.ui.screens.ReservationsManageScreen
import com.rentacar.app.ui.screens.CommissionsManageScreen
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import com.rentacar.app.data.Customer
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.material3.Icon
import kotlinx.coroutines.delay

object Routes {
    const val Dashboard = "dashboard"
    const val NewReservation = "new_reservation"
    const val NewReservationWithCustomer = "new_reservation/{customerId}"
    const val EditReservation = "edit_reservation/{id}"
    const val ReservationDetails = "reservation_details/{id}"
    const val Settings = "settings"
    const val Reports = "reports"
    const val Customers = "customers"
    const val CustomerEdit = "customer_edit"
    const val CustomerEditWithId = "customer_edit/{id}"
    const val CustomerDetails = "customer_details/{id}"
    const val Suppliers = "suppliers"
    const val SuppliersPick = "suppliers_pick"
    const val SupplierEdit = "supplier_edit"
    const val SupplierEditWithId = "supplier_edit/{id}"
    const val Agents = "agents"
    const val AgentEdit = "agent_edit"
    const val AgentEditWithId = "agent_edit/{id}"
    const val ReservationsManage = "reservations_manage"
    const val CommissionsManage = "commissions_manage"
    const val SupplierBranches = "supplier_branches/{id}"
    const val BranchEdit = "branch_edit/{supplierId}"
    const val BranchEditWithId = "branch_edit/{supplierId}/{branchId}"
    const val Requests = "requests"
    const val RequestEdit = "request_edit"
    const val RequestEditWithId = "request_edit/{id}"
    const val CarPurchase = "car_purchase"
    const val CarPurchaseWithId = "car_purchase/{id}"
    const val CarSalesManage = "car_sales_manage"
    const val MonthlyReport = "monthly_report/{supplierId}/{year}/{month}"
    const val ImportLog = "import_log/{supplierId}"
}

@Composable
fun AppNavGraph(navController: NavHostController = rememberNavController()) {
    val context = LocalContext.current
    val reservationRepo = remember { DatabaseModule.reservationRepository(context) }
    val catalogRepo = remember { DatabaseModule.catalogRepository(context) }
    val customerRepo = remember { DatabaseModule.customerRepository(context) }
    val supplierRepo = remember { DatabaseModule.supplierRepository(context) }
    val reservationVm = remember { ReservationViewModel(reservationRepo, catalogRepo, customerRepo) }
    val customerVm = remember { CustomerViewModel(customerRepo, reservationRepo) }
    val suppliersVm = remember { SuppliersViewModel(supplierRepo, catalogRepo) }
    val exportVm = remember { ExportViewModel(DatabaseModule.provideDatabase(context), reservationRepo, catalogRepo, customerRepo) }

    NavHost(navController, startDestination = "splash") {
        composable("splash") {
            val ctx = LocalContext.current
            androidx.compose.runtime.LaunchedEffect(Unit) {
                kotlinx.coroutines.delay(1200)
                navController.navigate(Routes.Dashboard) { popUpTo("splash") { inclusive = true } }
            }
            androidx.compose.foundation.layout.Box(modifier = androidx.compose.ui.Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
                // Yellow circle behind car icon without changing car size
                androidx.compose.foundation.Canvas(modifier = androidx.compose.ui.Modifier.size(180.dp)) {
                    drawCircle(color = androidx.compose.ui.graphics.Color(android.graphics.Color.parseColor("#FFD000")))
                }
                androidx.compose.material3.Icon(
                    imageVector = androidx.compose.material.icons.Icons.Filled.DirectionsCar,
                    contentDescription = null,
                    tint = androidx.compose.ui.graphics.Color(0xFF2E7D32),
                    modifier = androidx.compose.ui.Modifier.size(96.dp)
                )
            }
        }
        composable(Routes.Dashboard) {
            DashboardScreen(navController, reservationVm)
        }
        composable(Routes.Requests) {
            val reqVm = com.rentacar.app.ui.vm.RequestsViewModel(DatabaseModule.requestRepository(context))
            com.rentacar.app.ui.screens.RequestsScreen(navController, reqVm)
        }
        composable(Routes.RequestEdit) {
            val reqVm = com.rentacar.app.ui.vm.RequestsViewModel(DatabaseModule.requestRepository(context))
            com.rentacar.app.ui.screens.RequestEditScreen(navController, reqVm)
        }
        composable(Routes.RequestEditWithId) { backStackEntry ->
            val id = backStackEntry.arguments?.getString("id")?.toLongOrNull()
            val reqVm = com.rentacar.app.ui.vm.RequestsViewModel(DatabaseModule.requestRepository(context))
            com.rentacar.app.ui.screens.RequestEditScreen(navController, reqVm, id)
        }
        composable(Routes.CarPurchase) {
            val saleVm = com.rentacar.app.ui.vm.CarSaleViewModel(DatabaseModule.carSaleRepository(context))
            com.rentacar.app.ui.screens.CarPurchaseScreen(navController, saleVm)
        }
        composable(Routes.CarPurchaseWithId) { backStackEntry ->
            val id = backStackEntry.arguments?.getString("id")?.toLongOrNull()
            val saleVm = com.rentacar.app.ui.vm.CarSaleViewModel(DatabaseModule.carSaleRepository(context))
            com.rentacar.app.ui.screens.CarPurchaseScreen(navController, saleVm, id)
        }
        composable(Routes.CarSalesManage) {
            val saleVm = com.rentacar.app.ui.vm.CarSaleViewModel(DatabaseModule.carSaleRepository(context))
            com.rentacar.app.ui.screens.SalesManageScreen(navController, saleVm)
        }
        composable(Routes.MonthlyReport) { backStackEntry ->
            val supplierId = backStackEntry.arguments?.getString("supplierId")?.toLongOrNull() ?: 0L
            val year = backStackEntry.arguments?.getString("year")?.toIntOrNull() ?: 0
            val month = backStackEntry.arguments?.getString("month")?.toIntOrNull() ?: 0
            if (supplierId > 0 && year > 0 && month > 0) {
                com.rentacar.app.ui.screens.MonthlyReportScreen(
                    supplierId = supplierId,
                    year = year,
                    month = month,
                    onBack = { navController.popBackStack() }
                )
            } else {
                androidx.compose.material3.Text("פרמטרים שגויים לדוח חודשי")
            }
        }
        composable(Routes.ImportLog) { backStackEntry ->
            val supplierId = backStackEntry.arguments?.getString("supplierId")?.toLongOrNull() ?: 0L
            if (supplierId > 0) {
                com.rentacar.app.ui.screens.ImportLogScreen(
                    supplierId = supplierId,
                    navController = navController
                )
            } else {
                androidx.compose.material3.Text("פרמטרים שגויים ללוג יבוא")
            }
        }
        composable(Routes.NewReservation) {
            // handle supplier pick result
            val handle = navController.currentBackStackEntry?.savedStateHandle
            val pickedSupplierId = handle?.getLiveData<Long>("picked_supplier_id")?.value
            val prefillFirst = handle?.get<String>("prefill_first")
            val prefillLast = handle?.get<String>("prefill_last")
            val prefillPhone = handle?.get<String>("prefill_phone")
            val prefillCarType = handle?.get<String>("prefill_carType")
            val prefillRequestId = handle?.get<Long>("prefill_request_id")
            NewReservationScreen(navController, reservationVm, customerVm, prefillCustomerId = null, editReservationId = null)
        }
        composable(Routes.EditReservation) { backStackEntry ->
            val id = backStackEntry.arguments?.getString("id")?.toLongOrNull()
            NewReservationScreen(navController, reservationVm, customerVm, prefillCustomerId = null, editReservationId = id)
        }
        composable(Routes.NewReservationWithCustomer) { backStackEntry ->
            val cid = backStackEntry.arguments?.getString("customerId")?.toLongOrNull()
            NewReservationScreen(navController, reservationVm, customerVm, prefillCustomerId = cid)
        }
        composable(Routes.Settings) { SettingsScreen(navController, exportVm) }
        composable(Routes.Reports) { ReportsScreen(navController) }
        // Use routes constants for suppliers
        composable("export") { com.rentacar.app.ui.screens.ExportScreen(navController, exportVm) }
        composable(Routes.Customers) { CustomersListScreen(navController, customerVm, reservationVm) }
        composable(Routes.Suppliers) { SuppliersListScreen(navController, suppliersVm, reservationVm) }
        composable(Routes.SuppliersPick) { SuppliersListScreen(navController, suppliersVm, reservationVm, pickMode = true) }
        composable(Routes.SupplierEdit) { 
            com.rentacar.app.ui.screens.SupplierEditScreen(navController, suppliersVm) 
        }
        composable(Routes.SupplierEditWithId) { backStackEntry ->
            val id = backStackEntry.arguments?.getString("id")?.toLongOrNull()
            com.rentacar.app.ui.screens.SupplierEditScreen(navController, suppliersVm, id)
        }
        composable(Routes.SupplierBranches) { backStackEntry ->
            val id = backStackEntry.arguments?.getString("id")?.toLongOrNull()
            if (id != null) {
                com.rentacar.app.ui.screens.SupplierBranchesScreen(navController, suppliersVm, id, reservationVm)
            } else {
                androidx.compose.material3.Text("ספק לא נמצא")
            }
        }
        composable(Routes.BranchEdit) { backStackEntry ->
            val supplierId = backStackEntry.arguments?.getString("supplierId")?.toLongOrNull()
            if (supplierId != null) {
                com.rentacar.app.ui.screens.BranchEditScreen(navController, suppliersVm, supplierId)
            } else {
                androidx.compose.material3.Text("ספק לא נמצא")
            }
        }
        composable(Routes.BranchEditWithId) { backStackEntry ->
            val supplierId = backStackEntry.arguments?.getString("supplierId")?.toLongOrNull()
            val branchId = backStackEntry.arguments?.getString("branchId")?.toLongOrNull()
            if (supplierId != null && branchId != null) {
                com.rentacar.app.ui.screens.BranchEditScreen(navController, suppliersVm, supplierId, branchId)
            } else {
                androidx.compose.material3.Text("ספק או סניף לא נמצא")
            }
        }
        composable(Routes.CustomerEdit) { CustomerEditScreen(navController, customerVm) }
        composable(Routes.CustomerEditWithId) { backStackEntry ->
            val id = backStackEntry.arguments?.getString("id")?.toLongOrNull()
            CustomerEditScreen(navController, customerVm, id)
        }
        composable(Routes.ReservationDetails) { backStackEntry ->
            val id = backStackEntry.arguments?.getString("id")?.toLongOrNull()
            if (id != null) {
                com.rentacar.app.ui.screens.ReservationDetailsScreen(navController, reservationVm, id)
            } else {
                androidx.compose.material3.Text("שגיאת ניווט: מזהה הזמנה")
            }
        }
        composable(Routes.CustomerDetails) { backStackEntry ->
            val id = backStackEntry.arguments?.getString("id")?.toLongOrNull()
            val list by customerVm.list.collectAsState()
            val customer: Customer? = list.find { it.id == id }
            if (customer != null) {
                com.rentacar.app.ui.screens.CustomerDetailsScreen(navController, customer, reservationVm)
            } else {
                androidx.compose.material3.Text("לקוח לא נמצא")
            }
        }
        composable(Routes.Agents) { AgentsListScreen(navController, com.rentacar.app.ui.vm.AgentsViewModel(catalogRepo), reservationVm) }
        composable(Routes.AgentEdit) { 
            com.rentacar.app.ui.screens.AgentEditScreen(navController, com.rentacar.app.ui.vm.AgentsViewModel(catalogRepo)) 
        }
        composable(Routes.AgentEditWithId) { backStackEntry ->
            val id = backStackEntry.arguments?.getString("id")?.toLongOrNull()
            com.rentacar.app.ui.screens.AgentEditScreen(navController, com.rentacar.app.ui.vm.AgentsViewModel(catalogRepo), id)
        }
        composable(Routes.ReservationsManage) { ReservationsManageScreen(navController, reservationVm) }
        composable(Routes.CommissionsManage) { 
            CommissionsManageScreen(navController, reservationVm) 
        }
    }
}


