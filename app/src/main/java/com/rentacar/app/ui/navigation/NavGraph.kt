package com.rentacar.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import android.widget.Toast
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
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.LaunchedEffect
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
import kotlinx.coroutines.launch
import com.rentacar.app.ui.auth.AuthScreen
import com.rentacar.app.ui.auth.AuthViewModel
import com.rentacar.app.data.auth.FirebaseAuthRepository
import com.rentacar.app.data.auth.AuthRepository
import com.rentacar.app.data.auth.AuthProvider
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.rentacar.app.data.auth.UserProfile
import com.rentacar.app.data.auth.PrimaryRole
import com.rentacar.app.ui.auth.SelectRoleScreen

object Routes {
    const val Auth = "auth"
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
    // Yard-only routes
    const val YardCarEdit = "yard_car_edit"
    const val YardCarEditWithId = "yard_car_edit/{carId}"
    const val CarSalesManage = "car_sales_manage"
    const val MonthlyReport = "monthly_report/{supplierId}/{year}/{month}"
    const val ImportLog = "import_log/{supplierId}"
    const val SupplierDocuments = "supplier_documents/{supplierId}"
    const val DocumentPreview = "documentPreview/{supplierId}/{documentPath}"
    const val SupplierPriceLists = "supplier_price_lists/{supplierId}"
    const val PriceListDetails = "price_list_details/{headerId}"
    const val DebugDbBrowser = "debug_db_browser"
    const val AdminRoleManagement = "admin_role_management"
    const val YardHome = "yard_home"
    const val YardProfile = "yard_profile"
    const val YardFleet = "yard_fleet"
}

@Composable
fun AppNavGraph(navController: NavHostController? = null) {
    val context = LocalContext.current
    val reservationRepo = remember { DatabaseModule.reservationRepository(context) }
    val catalogRepo = remember { DatabaseModule.catalogRepository(context) }
    val customerRepo = remember { DatabaseModule.customerRepository(context) }
    val supplierRepo = remember { DatabaseModule.supplierRepository(context) }
    val reservationVm = remember { ReservationViewModel(reservationRepo, catalogRepo, customerRepo) }
    val customerVm = remember { CustomerViewModel(customerRepo, reservationRepo) }
    val db = remember { DatabaseModule.provideDatabase(context) }
    val suppliersVm = remember { SuppliersViewModel(supplierRepo, catalogRepo, db.supplierPriceListDao()) }
    val exportVm = remember { ExportViewModel(db, reservationRepo, catalogRepo, customerRepo) }
    
    // Auth setup - use AuthProvider to ensure same FirebaseAuth instance
    val authRepository = remember {
        FirebaseAuthRepository(
            auth = AuthProvider.auth,
            firestore = FirebaseFirestore.getInstance()
        )
    }
    val authViewModel = remember { AuthViewModel(authRepository) }
    val authState by authViewModel.uiState.collectAsState()
    val authNavigationState by authViewModel.authNavigationState.collectAsState()
    
    // Handle auth events (messages, errors, etc.)
    LaunchedEffect(Unit) {
        authViewModel.authEvents.collect { event ->
            when (event) {
                is com.rentacar.app.ui.auth.AuthEvent.ShowMessage -> {
                    Toast.makeText(context, event.message, Toast.LENGTH_LONG).show()
                }
            }
        }
    }
    
    // Backfill user_uid after successful login
    LaunchedEffect(authState.isLoggedIn, authState.currentUser?.uid) {
        val currentUser = authState.currentUser
        if (authState.isLoggedIn && currentUser != null) {
            val uid = currentUser.uid
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                try {
                    com.rentacar.app.data.UserUidBackfill.backfillUserUidForCurrentUser(context, uid)
                } catch (e: Exception) {
                    android.util.Log.e("NavGraph", "Error during user_uid backfill", e)
                    // Non-fatal: continue even if backfill fails
                }
            }
        }
    }
    
    // Use AuthNavigationState for navigation decisions (prevents Login flash on startup)
    when (authNavigationState) {
        is com.rentacar.app.ui.auth.AuthNavigationState.Loading -> {
            // Show neutral loading/splash screen while checking auth state
            SplashScreen()
        }
        is com.rentacar.app.ui.auth.AuthNavigationState.LoggedOut -> {
            // Show login screen
            AuthScreen(viewModel = authViewModel)
        }
        is com.rentacar.app.ui.auth.AuthNavigationState.LoggedIn -> {
            // IMPORTANT: Ensure profile is loaded before checking needsRoleSelection
            // Use LaunchedEffect to trigger profile refresh if needed
            val authState by authViewModel.uiState.collectAsState()
            LaunchedEffect(authState.isLoggedIn, authState.currentUser, authState.hasCheckedExistingUser) {
                if (authState.isLoggedIn && authState.currentUser == null && !authState.hasCheckedExistingUser) {
                    // Profile not loaded yet - refresh it
                    // This will either load the profile or detect missing profile and force logout
                    authViewModel.refreshUserProfile()
                }
            }
            
            // CRITICAL FIX: Wait for currentUser to be loaded before building MainAppNavHost
            // This ensures startDestination is computed with the correct primaryRole
            // Also ensure we don't stay in Splash forever - if profile check completed and still null, force logout
            val currentUser = authState.currentUser
            val hasCheckedExistingUser = authState.hasCheckedExistingUser
            
            if (currentUser == null && !hasCheckedExistingUser) {
                // Profile still loading → don't build the main NavHost yet
                // Show neutral loading screen to prevent premature navigation
                SplashScreen()
            } else if (currentUser == null && hasCheckedExistingUser) {
                // Profile check completed but user is null - this means profile is missing
                // The ViewModel should have already triggered logout, but if not, show Splash briefly
                // The logout will change authNavigationState to LoggedOut, so this is just a safety net
                SplashScreen()
            } else {
                // Profile loaded → now we can check role selection and build navigation
                val needsRoleSelection = authViewModel.needsRoleSelection()
                
                if (needsRoleSelection) {
                    // Show blocking role selection screen for legacy users
                    SelectRoleScreen(
                        viewModel = authViewModel,
                        onRoleSelected = {
                            // Role selected and saved - refresh profile to trigger recomposition
                            kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Main).launch {
                                authViewModel.refreshUserProfile()
                            }
                        }
                    )
                } else {
                    // FIXED: Create NavController inside LoggedIn branch to reset back stack on each login
                    // This ensures that after logout/login, user always starts from correct screen based on role
                    val mainNavController = rememberNavController()
                    MainAppNavHost(mainNavController, reservationVm, customerVm, suppliersVm, exportVm, authViewModel, authRepository, db, catalogRepo, customerRepo, supplierRepo, context)
                }
            }
        }
    }
}

// Extracted main app navigation into separate composable
@Composable
private fun MainAppNavHost(
    navController: NavHostController,
    reservationVm: ReservationViewModel,
    customerVm: CustomerViewModel,
    suppliersVm: SuppliersViewModel,
    exportVm: ExportViewModel,
    authViewModel: AuthViewModel,
    authRepository: com.rentacar.app.data.auth.AuthRepository,
    db: com.rentacar.app.data.AppDatabase,
    catalogRepo: com.rentacar.app.data.CatalogRepository,
    customerRepo: com.rentacar.app.data.CustomerRepository,
    supplierRepo: com.rentacar.app.data.SupplierRepository,
    context: android.content.Context
) {
    // FIXED: Removed navigation to "auth" - logout is handled by top-level AppNavGraph
    // When authViewModel.logout() is called, authNavigationState becomes LoggedOut,
    // and AppNavGraph automatically switches to AuthScreen. No need to navigate here.
    
    // Get user email from auth state and provide it via CompositionLocal for TitleBar
    val authState by authViewModel.uiState.collectAsState()
    val userEmail = authState.currentUser?.email?.takeIf { it.isNotBlank() }
    
    // Provide user email globally for TitleBar components
    androidx.compose.runtime.CompositionLocalProvider(
        com.rentacar.app.ui.components.LocalUserEmail provides userEmail
    ) {
        // Determine start destination based on user role
        val userProfile = authState.currentUser
        
        // Parse stored primaryRole and requestedRole from strings to PrimaryRole enum
        val rawPrimaryRole = userProfile?.primaryRole
            ?.takeIf { it.isNotBlank() }
            ?.let { PrimaryRole.fromString(it) }
        
        val requestedRole = userProfile?.requestedRole
            ?.takeIf { it.isNotBlank() }
            ?.let { PrimaryRole.fromString(it) }
        
        // Decide the effective role for navigation
        // Priority: explicit flags/requestedRole > stored primaryRole > default
        val effectiveRole = when {
            // 1) Explicit yard flag or explicit requested YARD → treat as YARD for UI
            userProfile?.isYard == true || requestedRole == PrimaryRole.YARD -> PrimaryRole.YARD
            
            // 2) Explicit agent flag or requested AGENT → treat as AGENT for UI
            userProfile?.isAgent == true || requestedRole == PrimaryRole.AGENT -> PrimaryRole.AGENT
            
            // 3) Fallback to stored primaryRole (PRIVATE_USER, ADMIN, etc.)
            rawPrimaryRole != null -> rawPrimaryRole
            
            // 4) Last resort
            else -> PrimaryRole.PRIVATE_USER
        }
        
        val startDestination = when (effectiveRole) {
            PrimaryRole.YARD -> Routes.YardHome
            else -> Routes.Dashboard // Default for AGENT, PRIVATE_USER, ADMIN, etc.
        }
        
        NavHost(navController, startDestination = startDestination) {
        composable(Routes.Dashboard) {
            DashboardScreen(navController, reservationVm)
        }
        composable(Routes.Requests) {
            val reqVm = remember {
                com.rentacar.app.ui.vm.RequestsViewModel(DatabaseModule.requestRepository(context))
            }
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
            val saleVm = remember { com.rentacar.app.ui.vm.CarSaleViewModel(DatabaseModule.carSaleRepository(context)) }
            com.rentacar.app.ui.screens.CarPurchaseScreen(navController, saleVm)
        }
        composable(Routes.CarPurchaseWithId) { backStackEntry ->
            val id = backStackEntry.arguments?.getString("id")?.toLongOrNull()
            val saleVm = remember { com.rentacar.app.ui.vm.CarSaleViewModel(DatabaseModule.carSaleRepository(context)) }
            com.rentacar.app.ui.screens.CarPurchaseScreen(navController, saleVm, id)
        }
        composable(Routes.CarSalesManage) {
            val saleVm = remember { com.rentacar.app.ui.vm.CarSaleViewModel(DatabaseModule.carSaleRepository(context)) }
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
        composable(Routes.Settings) { SettingsScreen(navController, exportVm, authViewModel) }
        composable(Routes.AdminRoleManagement) {
            val adminRepository = remember {
                com.rentacar.app.data.auth.FirebaseAdminRepository(
                    FirebaseFirestore.getInstance()
                )
            }
            // Get authRepository from parent scope
            val adminAuthRepository = remember {
                FirebaseAuthRepository(
                    auth = AuthProvider.auth,
                    firestore = FirebaseFirestore.getInstance()
                )
            }
            val adminViewModel = remember {
                com.rentacar.app.ui.admin.AdminViewModel(
                    adminRepository = adminRepository,
                    authRepository = adminAuthRepository
                )
            }
            com.rentacar.app.ui.admin.AdminRoleManagementScreen(navController, adminViewModel)
        }
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
        composable(Routes.Agents) {
            val agentsVm = remember {
                com.rentacar.app.ui.vm.AgentsViewModel(catalogRepo)
            }
            AgentsListScreen(navController, agentsVm, reservationVm)
        }
        composable(Routes.AgentEdit) { 
            com.rentacar.app.ui.screens.AgentEditScreen(navController, com.rentacar.app.ui.vm.AgentsViewModel(catalogRepo)) 
        }
        composable(Routes.AgentEditWithId) { backStackEntry ->
            val id = backStackEntry.arguments?.getString("id")?.toLongOrNull()
            com.rentacar.app.ui.screens.AgentEditScreen(navController, com.rentacar.app.ui.vm.AgentsViewModel(catalogRepo), id)
        }
        composable(Routes.ReservationsManage) { backStackEntry ->
            val savedStateHandle = backStackEntry.savedStateHandle
            val showCommissions = savedStateHandle.get<Boolean>("showCommissions") ?: false
            val payoutMonth = savedStateHandle.get<String>("selectedPayoutMonth")
            ReservationsManageScreen(
                navController = navController, 
                vm = reservationVm,
                initialShowCommissions = showCommissions,
                initialPayoutMonth = payoutMonth
            )
        }
        composable(Routes.CommissionsManage) { backStackEntry ->
            // Redirect to ReservationsManage with showCommissions=true
            // Use savedStateHandle to pass the flag
            val savedStateHandle = backStackEntry.savedStateHandle
            savedStateHandle["showCommissions"] = true
            
            // Set default payout month (current month + 1)
            val cal = java.util.Calendar.getInstance()
            cal.add(java.util.Calendar.MONTH, 1)
            val year = cal.get(java.util.Calendar.YEAR)
            val month = cal.get(java.util.Calendar.MONTH) + 1
            savedStateHandle["selectedPayoutMonth"] = String.format("%04d-%02d", year, month)
            
            // Navigate to reservations manage
            androidx.compose.runtime.LaunchedEffect(Unit) {
                navController.navigate(Routes.ReservationsManage) {
                    popUpTo(Routes.ReservationsManage) { inclusive = false }
                }
            }
            
            // Show loading while redirecting
            androidx.compose.foundation.layout.Box(
                modifier = androidx.compose.ui.Modifier.fillMaxSize(),
                contentAlignment = androidx.compose.ui.Alignment.Center
            ) {
                androidx.compose.material3.CircularProgressIndicator()
            } 
        }
        composable(Routes.SupplierDocuments) { backStackEntry ->
            val supplierId = backStackEntry.arguments?.getString("supplierId")?.toLongOrNull()
            if (supplierId != null) {
                com.rentacar.app.ui.screens.SupplierDocumentsScreen(navController, supplierId)
            } else {
                androidx.compose.material3.Text("ספק לא נמצא")
            }
        }
        composable(Routes.DocumentPreview) { backStackEntry ->
            val supplierId = backStackEntry.arguments?.getString("supplierId")?.toLongOrNull()
            val documentPath = backStackEntry.arguments?.getString("documentPath")
            if (supplierId != null && documentPath != null) {
                val decodedPath = android.net.Uri.decode(documentPath)
                com.rentacar.app.ui.screens.DocumentPreviewScreen(navController, supplierId, decodedPath)
            } else {
                androidx.compose.material3.Text("פרמטרים שגויים לתצוגה מקדימה")
            }
        }
        composable(Routes.SupplierPriceLists) { backStackEntry ->
            val supplierId = backStackEntry.arguments?.getString("supplierId")?.toLongOrNull()
            if (supplierId != null) {
                // Use remember to memoize ViewModel - only create once per supplierId
                // This prevents duplicate ViewModel creation on recomposition
                val viewModel = remember(supplierId) {
                    android.util.Log.d("SupplierPriceListsVM", "Creating ViewModel for supplierId=$supplierId")
                    com.rentacar.app.ui.vm.SupplierPriceListsViewModel(
                        supplierId = supplierId,
                        supplierDao = db.supplierDao(),
                        priceListDao = db.supplierPriceListDao()
                    )
                }
                com.rentacar.app.ui.screens.SupplierPriceListsScreen(
                    navController = navController,
                    supplierId = supplierId,
                    viewModel = viewModel,
                    onPriceListClick = { headerId ->
                        android.util.Log.d("NavGraph", "Navigating to PriceListDetailsScreen, headerId=$headerId")
                        navController.navigate("price_list_details/$headerId") {
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                )
            } else {
                androidx.compose.material3.Text("ספק לא נמצא")
            }
        }
        composable(
            route = Routes.PriceListDetails,
            arguments = listOf(
                androidx.navigation.navArgument("headerId") { 
                    type = androidx.navigation.NavType.LongType 
                }
            )
        ) { backStackEntry ->
            val headerId = backStackEntry.arguments?.getLong("headerId") ?: 0L
            // Log only once when composable is first created (not on every recomposition)
            LaunchedEffect(headerId) {
                if (headerId > 0) {
                    android.util.Log.d("PriceListDetailsNav", "Navigating to details, headerId=$headerId")
                }
            }
            
            if (headerId > 0) {
                val db = DatabaseModule.provideDatabase(LocalContext.current)
                // Ensure headerId is in SavedStateHandle for ViewModel
                backStackEntry.savedStateHandle["headerId"] = headerId
                // Use remember to memoize ViewModel - only create once per headerId
                // This prevents duplicate ViewModel creation on recomposition
                val viewModel = remember(headerId) {
                    android.util.Log.d("PriceListDetailsVM", "Creating ViewModel for headerId=$headerId")
                    com.rentacar.app.ui.vm.PriceListDetailsViewModel(
                        savedStateHandle = backStackEntry.savedStateHandle,
                        supplierDao = db.supplierDao(),
                        priceListDao = db.supplierPriceListDao()
                    )
                }

                com.rentacar.app.ui.screens.PriceListDetailsScreen(
                    headerId = headerId,
                    onBack = { navController.popBackStack() },
                    viewModel = viewModel,
                    onOpenSupplierPriceLists = { supplierId ->
                        navController.navigate("supplier_price_lists/$supplierId") {
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                )
            } else {
                androidx.compose.material3.Text("מחירון לא נמצא"                )
            }
        }
        composable(com.rentacar.app.ui.navigation.Routes.DebugDbBrowser) {
            com.rentacar.app.ui.debug.DebugDbBrowserScreen(navController = navController)
        }
        // Yard screens
        composable(Routes.YardHome) {
            com.rentacar.app.ui.yard.YardHomeScreen(
                navController = navController,
                authViewModel = authViewModel
            )
        }
        composable(Routes.YardProfile) {
            com.rentacar.app.ui.yard.YardProfileScreen(navController = navController)
        }
        composable(Routes.YardCarEdit) { backStackEntry ->
            val viewModel = remember {
                com.rentacar.app.ui.vm.yard.YardCarEditViewModel(
                    repo = DatabaseModule.carSaleRepository(context),
                    carCatalogRepository = DatabaseModule.carCatalogRepository(context),
                    savedStateHandle = backStackEntry.savedStateHandle
                )
            }
            com.rentacar.app.ui.yard.YardCarEditScreen(navController = navController, viewModel = viewModel)
        }
        composable(
            route = Routes.YardCarEditWithId,
            arguments = listOf(
                androidx.navigation.navArgument("carId") {
                    type = androidx.navigation.NavType.LongType
                }
            )
        ) { backStackEntry ->
            val carId = backStackEntry.arguments?.getLong("carId")
            if (carId != null) {
                backStackEntry.savedStateHandle["carId"] = carId
            }
            val viewModel = remember(carId) {
                com.rentacar.app.ui.vm.yard.YardCarEditViewModel(
                    repo = DatabaseModule.carSaleRepository(context),
                    carCatalogRepository = DatabaseModule.carCatalogRepository(context),
                    savedStateHandle = backStackEntry.savedStateHandle
                )
            }
            com.rentacar.app.ui.yard.YardCarEditScreen(navController = navController, viewModel = viewModel)
        }
        composable(Routes.YardFleet) {
            val yardFleetRepository = remember {
                com.rentacar.app.data.YardFleetRepository(
                    DatabaseModule.carSaleRepository(context)
                )
            }
            val yardFleetVm = remember {
                com.rentacar.app.ui.vm.yard.YardFleetViewModel(yardFleetRepository)
            }
            com.rentacar.app.ui.yard.YardFleetScreen(
                navController = navController,
                viewModel = yardFleetVm
            )
        }
        }
    }
}

// Simple neutral loading/splash screen shown while checking auth state
@Composable
private fun SplashScreen() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        // Reuse existing splash design (yellow circle with car icon)
        Canvas(modifier = Modifier.size(180.dp)) {
            drawCircle(color = Color(android.graphics.Color.parseColor("#FFD000")))
        }
        Icon(
            imageVector = Icons.Filled.DirectionsCar,
            contentDescription = null,
            tint = Color(0xFF2E7D32),
            modifier = Modifier.size(96.dp)
        )
    }
}


