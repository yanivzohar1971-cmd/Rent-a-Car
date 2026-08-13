package com.rentacar.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.AbsoluteAlignment
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.rentacar.app.LocalTitleColor
import com.rentacar.app.LocalTitleTextColor
import com.rentacar.app.data.CarSaleCommissionPaymentLogic
import com.rentacar.app.prefs.SettingsStore
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.ui.vm.CarSaleViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.map

private val StatusUnpaid = Color(0xFFD32F2F)
private val StatusPartial = Color(0xFFEF6C00)
private val StatusPaid = Color(0xFF2E7D32)

@Composable
fun SalesManageScreen(navController: NavHostController, vm: CarSaleViewModel) {
	// Collect nullable to distinguish "not loaded yet" from "loaded but empty"
	val salesOrNull: List<com.rentacar.app.data.CarSale>? by remember {
		vm.list.map { it }
	}.collectAsState(initial = null)

	val paidTotalsBySaleId by vm.paidTotalsBySaleId.collectAsState()

	// Show loading indicator until first data emission
	if (salesOrNull == null) {
		Box(
			modifier = Modifier.fillMaxSize(),
			contentAlignment = Alignment.Center
		) {
			CircularProgressIndicator()
		}
		return
	}

	val sales = salesOrNull!!
	var query by rememberSaveable { mutableStateOf("") }
	var debouncedQuery by remember { mutableStateOf("") }
	var commissionFilter by rememberSaveable {
		mutableStateOf(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.ALL)
	}
	var commissionExpanded by rememberSaveable { mutableStateOf(false) }
	var fromDateFilter by rememberSaveable { mutableStateOf("") }
	var toDateFilter by rememberSaveable { mutableStateOf("") }

	// Debounce search query
	LaunchedEffect(query) {
		delay(300)
		debouncedQuery = query
	}

	val filtered = sales.filter { s ->
		val matchesText = if (debouncedQuery.isBlank()) true else {
			val fullName = "${s.firstName} ${s.lastName}".lowercase()
			val phone = s.phone.lowercase()
			val carType = s.carTypeName.lowercase()
			val q = debouncedQuery.trim().lowercase()

			fullName.contains(q) || phone.contains(q) || carType.contains(q)
		}
		val matchesRange = run {
			val df = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
			val fromStart: Long? = try {
				if (fromDateFilter.isBlank()) null else df.parse(fromDateFilter)?.let { d ->
					val cal = java.util.Calendar.getInstance().apply {
						time = d
						set(java.util.Calendar.HOUR_OF_DAY, 0)
						set(java.util.Calendar.MINUTE, 0)
						set(java.util.Calendar.SECOND, 0)
						set(java.util.Calendar.MILLISECOND, 0)
					}
					cal.timeInMillis
				}
			} catch (_: Throwable) { null }
			val toEnd: Long? = try {
				if (toDateFilter.isBlank()) null else df.parse(toDateFilter)?.let { d ->
					val cal = java.util.Calendar.getInstance().apply {
						time = d
						set(java.util.Calendar.HOUR_OF_DAY, 23)
						set(java.util.Calendar.MINUTE, 59)
						set(java.util.Calendar.SECOND, 59)
						set(java.util.Calendar.MILLISECOND, 999)
					}
					cal.timeInMillis
				}
			} catch (_: Throwable) { null }
			when {
				fromStart == null && toEnd == null -> true
				fromStart != null && toEnd == null -> s.saleDate >= fromStart
				fromStart == null && toEnd != null -> s.saleDate <= toEnd
				else -> (s.saleDate in fromStart!!..toEnd!!)
			}
		}
		val paid = paidTotalsBySaleId[s.id] ?: 0.0
		val matchesCommission = CarSaleCommissionPaymentLogic.matchesCommissionFilter(
			filter = commissionFilter,
			commissionPrice = s.commissionPrice,
			totalPaid = paid
		)
		matchesText && matchesRange && matchesCommission
	}

	val totalCommission = filtered.sumOf { it.commissionPrice }
	val totalActuallyPaid = filtered.sumOf { paidTotalsBySaleId[it.id] ?: 0.0 }
	val openRemainingTotal = if (commissionFilter == CarSaleCommissionPaymentLogic.CommissionCollectionFilter.OPEN) {
		filtered.sumOf { s ->
			CarSaleCommissionPaymentLogic.remaining(
				s.commissionPrice,
				paidTotalsBySaleId[s.id] ?: 0.0
			)
		}
	} else {
		0.0
	}

	Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
		TitleBar(
			title = "ניהול מכירות",
			color = LocalTitleColor.current,
			onHomeClick = { navController.navigate(com.rentacar.app.ui.navigation.Routes.Dashboard) },
			homeAtEnd = false,
			placeStartIconAtLeft = false,
			startPlainContent = {
				androidx.compose.material3.SmallFloatingActionButton(onClick = {
					query = ""; fromDateFilter = ""; toDateFilter = ""
					commissionFilter = CarSaleCommissionPaymentLogic.CommissionCollectionFilter.ALL
				}) {
					Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(4.dp)) {
						Icon(imageVector = Icons.Filled.Search, contentDescription = null)
						Text("נקה", fontSize = 10.sp)
						Text("חיפוש", fontSize = 10.sp)
					}
				}
			}
		)
		Spacer(modifier = Modifier.height(12.dp))

		// Modern search bar
		com.rentacar.app.ui.components.AppSearchBar(
			query = query,
			onQueryChange = { query = it },
			placeholder = "חיפוש מכירה לפי שם, טלפון או סוג רכב..."
		)

		Spacer(modifier = Modifier.height(8.dp))
		Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
			val context2 = LocalContext.current
			FloatingActionButton(onClick = {
				val cal = java.util.Calendar.getInstance()
				if (fromDateFilter.isNotBlank()) try {
					val df = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault()); cal.time = df.parse(fromDateFilter) ?: java.util.Date()
				} catch (_: Throwable) {}
				android.app.DatePickerDialog(context2, { _, y, m, d ->
					val newFromDate = "%02d/%02d/%d".format(d, m + 1, y)

					// Validate that from date is not later than to date
					if (toDateFilter.isNotBlank()) {
						try {
							val df = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
							val fromDate = df.parse(newFromDate)
							val toDate = df.parse(toDateFilter)
							if (fromDate != null && toDate != null && fromDate.after(toDate)) {
								android.widget.Toast.makeText(context2, "תאריך התחלה לא יכול להיות גדול מתאריך הסיום", android.widget.Toast.LENGTH_LONG).show()
								// Don't update the filter - keep the old valid value
								return@DatePickerDialog
							}
						} catch (_: Throwable) { }
					}
					fromDateFilter = newFromDate
				}, cal.get(java.util.Calendar.YEAR), cal.get(java.util.Calendar.MONTH), cal.get(java.util.Calendar.DAY_OF_MONTH)).show()
			}) {
				Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
					Text("🗓"); Spacer(modifier = Modifier.height(2.dp)); Text(if (fromDateFilter.isBlank()) "מתאריך" else fromDateFilter, fontSize = 10.sp)
				}
			}
			FloatingActionButton(onClick = {
				val cal = java.util.Calendar.getInstance()
				if (toDateFilter.isNotBlank()) try {
					val df = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault()); cal.time = df.parse(toDateFilter) ?: java.util.Date()
				} catch (_: Throwable) {}
				android.app.DatePickerDialog(context2, { _, y, m, d ->
					val newToDate = "%02d/%02d/%d".format(d, m + 1, y)

					// Validate that to date is not earlier than from date
					if (fromDateFilter.isNotBlank()) {
						try {
							val df = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
							val fromDate = df.parse(fromDateFilter)
							val toDate = df.parse(newToDate)
							if (fromDate != null && toDate != null && toDate.before(fromDate)) {
								android.widget.Toast.makeText(context2, "תאריך סיום לא יכול להיות קטן מתאריך ההתחלה", android.widget.Toast.LENGTH_LONG).show()
								// Don't update the filter - keep the old valid value
								return@DatePickerDialog
							}
						} catch (_: Throwable) { }
					}
					toDateFilter = newToDate
				}, cal.get(java.util.Calendar.YEAR), cal.get(java.util.Calendar.MONTH), cal.get(java.util.Calendar.DAY_OF_MONTH)).show()
			}) {
				Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
					Text("🗓"); Spacer(modifier = Modifier.height(2.dp)); Text(if (toDateFilter.isBlank()) "עד תאריך" else toDateFilter, fontSize = 10.sp)
				}
			}
			FloatingActionButton(onClick = { commissionExpanded = true }) {
				Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
					Text("%"); Spacer(modifier = Modifier.height(2.dp)); Text(
						when (commissionFilter) {
							CarSaleCommissionPaymentLogic.CommissionCollectionFilter.OPEN -> "פתוח"
							CarSaleCommissionPaymentLogic.CommissionCollectionFilter.CLOSED -> "סגור"
							CarSaleCommissionPaymentLogic.CommissionCollectionFilter.ALL -> "הכל"
						},
						fontSize = 10.sp
					)
				}
			}
			// Physical LEFT of % in RTL: compose AFTER the % FAB
			if (commissionFilter == CarSaleCommissionPaymentLogic.CommissionCollectionFilter.OPEN) {
				Column(
					horizontalAlignment = Alignment.CenterHorizontally,
					modifier = Modifier
						.padding(horizontal = 4.dp)
						.align(Alignment.CenterVertically)
				) {
					Text(
						text = "נותר לתשלום",
						fontSize = 10.sp,
						color = MaterialTheme.colorScheme.error,
						fontWeight = FontWeight.Medium
					)
					Text(
						text = "₪${"%,.0f".format(openRemainingTotal)}",
						fontSize = 13.sp,
						color = MaterialTheme.colorScheme.error,
						fontWeight = FontWeight.Bold
					)
				}
			}
		}
		Spacer(modifier = Modifier.height(12.dp))

		if (commissionExpanded) {
			com.rentacar.app.ui.dialogs.CommissionFilterDialog(
				selectedFilter = commissionFilter,
				onFilterSelected = { filter ->
					commissionFilter = filter
					commissionExpanded = false
				},
				onDismiss = { commissionExpanded = false },
				openRemainingTotal = openRemainingTotal,
				openPaidTotal = if (commissionFilter == CarSaleCommissionPaymentLogic.CommissionCollectionFilter.OPEN) {
					totalActuallyPaid
				} else {
					0.0
				}
			)
		}

		Box(modifier = Modifier.weight(1f)) {
			if (filtered.isEmpty()) {
				com.rentacar.app.ui.components.AppEmptySearchState(
					message = if (
						debouncedQuery.isNotEmpty() ||
						fromDateFilter.isNotEmpty() ||
						toDateFilter.isNotEmpty() ||
						commissionFilter != CarSaleCommissionPaymentLogic.CommissionCollectionFilter.ALL
					) {
						"לא נמצאו תוצאות תואמות לחיפוש שלך."
					} else {
						"אין מכירות להצגה."
					}
				)
			} else {
				val context = LocalContext.current
				val settings = remember(context) { SettingsStore(context) }
				val defaultTintHex = settings.customerPrivateColor().collectAsState(initial = "#2196F3").value
				val iconTint = Color(android.graphics.Color.parseColor(defaultTintHex))

				LazyColumn(
					verticalArrangement = Arrangement.spacedBy(12.dp)
				) {
					items(filtered, key = { s -> s.id }) { s ->
						val paid = paidTotalsBySaleId[s.id] ?: 0.0
						val status = CarSaleCommissionPaymentLogic.paymentStatus(s.commissionPrice, paid)
						val remaining = CarSaleCommissionPaymentLogic.remaining(s.commissionPrice, paid)
						val stripeColor = when (status) {
							CarSaleCommissionPaymentLogic.PaymentStatus.UNPAID -> StatusUnpaid
							CarSaleCommissionPaymentLogic.PaymentStatus.PARTIAL -> StatusPartial
							CarSaleCommissionPaymentLogic.PaymentStatus.PAID -> StatusPaid
							CarSaleCommissionPaymentLogic.PaymentStatus.NO_COMMISSION -> null
						}
						val statusLabel = CarSaleCommissionPaymentLogic.accessibilityLabelHe(status)

						Card(
							modifier = Modifier
								.fillMaxWidth()
								.clickable { navController.navigate("car_purchase/${s.id}") }
								.semantics { contentDescription = statusLabel },
							shape = RoundedCornerShape(12.dp),
							elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
							colors = CardDefaults.cardColors(
								containerColor = MaterialTheme.colorScheme.surface
							)
						) {
							Box(modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
								Column(
									modifier = Modifier
										.fillMaxWidth()
										.padding(16.dp)
										.padding(end = if (stripeColor != null) 6.dp else 0.dp)
								) {
									// Header row - customer name + sale price
									Row(
										modifier = Modifier.fillMaxWidth(),
										horizontalArrangement = Arrangement.SpaceBetween,
										verticalAlignment = Alignment.CenterVertically
									) {
										Row(
											verticalAlignment = Alignment.CenterVertically,
											horizontalArrangement = Arrangement.spacedBy(8.dp)
										) {
											Icon(
												imageVector = Icons.Filled.Person,
												contentDescription = null,
												tint = iconTint,
												modifier = Modifier.size(20.dp)
											)
											Text(
												text = "${s.firstName} ${s.lastName}",
												style = MaterialTheme.typography.titleMedium,
												fontWeight = FontWeight.Bold
											)
										}

										// Sale price
										Row(
											verticalAlignment = Alignment.CenterVertically,
											horizontalArrangement = Arrangement.spacedBy(4.dp)
										) {
											Icon(
												imageVector = Icons.Filled.AttachMoney,
												contentDescription = null,
												tint = Color(0xFF4CAF50),
												modifier = Modifier.size(18.dp)
											)
											Text(
												text = "₪${s.salePrice.toInt()}",
												style = MaterialTheme.typography.titleMedium,
												fontWeight = FontWeight.Bold,
												color = Color(0xFF4CAF50)
											)
										}
									}

									Spacer(modifier = Modifier.height(12.dp))

									// Row 2: Phone + Commission
									Row(
										modifier = Modifier.fillMaxWidth(),
										horizontalArrangement = Arrangement.SpaceBetween,
										verticalAlignment = Alignment.CenterVertically
									) {
										Row(
											verticalAlignment = Alignment.CenterVertically,
											horizontalArrangement = Arrangement.spacedBy(8.dp)
										) {
											Icon(
												imageVector = Icons.Filled.Phone,
												contentDescription = null,
												tint = MaterialTheme.colorScheme.onSurfaceVariant,
												modifier = Modifier.size(16.dp)
											)
											Text(
												text = s.phone,
												style = MaterialTheme.typography.bodyMedium,
												color = MaterialTheme.colorScheme.onSurfaceVariant
											)
										}

										if (s.commissionPrice > 0.0) {
											Row(
												verticalAlignment = Alignment.CenterVertically,
												horizontalArrangement = Arrangement.spacedBy(4.dp)
											) {
												Text(
													text = "עמלה:",
													style = MaterialTheme.typography.bodySmall,
													color = MaterialTheme.colorScheme.primary
												)
												Text(
													text = "₪${s.commissionPrice.toInt()}",
													style = MaterialTheme.typography.bodyMedium,
													fontWeight = FontWeight.Bold,
													color = MaterialTheme.colorScheme.primary
												)
											}
										}
									}

									if (s.commissionPrice > 0.0) {
										Spacer(modifier = Modifier.height(4.dp))
										Text(
											text = when (status) {
												CarSaleCommissionPaymentLogic.PaymentStatus.PAID ->
													"שולם: ₪${"%,.0f".format(paid)}"
												CarSaleCommissionPaymentLogic.PaymentStatus.PARTIAL ->
													"שולם: ₪${"%,.0f".format(paid)} · נותר: ₪${"%,.0f".format(remaining)}"
												CarSaleCommissionPaymentLogic.PaymentStatus.UNPAID ->
													"שולם: ₪0 · נותר: ₪${"%,.0f".format(remaining)}"
												else -> ""
											},
											style = MaterialTheme.typography.bodySmall,
											color = when (status) {
												CarSaleCommissionPaymentLogic.PaymentStatus.PAID -> StatusPaid
												CarSaleCommissionPaymentLogic.PaymentStatus.PARTIAL -> StatusPartial
												CarSaleCommissionPaymentLogic.PaymentStatus.UNPAID -> StatusUnpaid
												else -> MaterialTheme.colorScheme.onSurfaceVariant
											},
											fontWeight = FontWeight.Medium
										)
									}

									Spacer(modifier = Modifier.height(8.dp))

									// Row 3: Car type + Sale date
									val df = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
									Row(
										modifier = Modifier.fillMaxWidth(),
										horizontalArrangement = Arrangement.SpaceBetween,
										verticalAlignment = Alignment.CenterVertically
									) {
										Row(
											verticalAlignment = Alignment.CenterVertically,
											horizontalArrangement = Arrangement.spacedBy(8.dp)
										) {
											Icon(
												imageVector = Icons.Filled.DirectionsCar,
												contentDescription = null,
												tint = MaterialTheme.colorScheme.onSurfaceVariant,
												modifier = Modifier.size(16.dp)
											)
											Text(
												text = s.carTypeName,
												style = MaterialTheme.typography.bodyMedium,
												color = MaterialTheme.colorScheme.onSurfaceVariant
											)
										}

										Text(
											text = df.format(java.util.Date(s.saleDate)),
											style = MaterialTheme.typography.bodySmall,
											color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
										)
									}
								}

								if (stripeColor != null) {
									Box(
										modifier = Modifier
											.align(AbsoluteAlignment.CenterRight)
											.width(5.dp)
											.fillMaxHeight()
											.background(stripeColor)
									)
								}
							}
						}
					}
				}
			}
		}

		// summary bar
		Box(
			modifier = Modifier
				.fillMaxWidth()
				.height(56.dp)
				.padding(top = 8.dp)
				.background(LocalTitleColor.current)
		) {
			Row(
				modifier = Modifier
					.fillMaxWidth()
					.padding(horizontal = 10.dp)
					.align(Alignment.Center),
				horizontalArrangement = Arrangement.SpaceBetween,
				verticalAlignment = Alignment.CenterVertically
			) {
				Text("מכירות: ${filtered.size}", color = LocalTitleTextColor.current, fontSize = 13.sp)
				Text("סה\"כ עמלות: ₪${"%,.0f".format(totalCommission)}", color = LocalTitleTextColor.current, fontSize = 13.sp)
				Text("שולם בפועל: ₪${"%,.0f".format(totalActuallyPaid)}", color = LocalTitleTextColor.current, fontSize = 13.sp)
			}
		}
	}
}
