package com.rentacar.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.NewReleases
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.rentacar.app.LocalTitleColor
import com.rentacar.app.LocalTitleTextColor
import com.rentacar.app.prefs.SettingsStore
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.ui.vm.CarSaleViewModel

@Composable
fun SalesManageScreen(navController: NavHostController, vm: CarSaleViewModel) {
	val sales by vm.list.collectAsState()
	var query by rememberSaveable { mutableStateOf("") }
	var commissionFilter by rememberSaveable { mutableStateOf<String?>(null) }
	var commissionExpanded by rememberSaveable { mutableStateOf(false) }
	var fromDateFilter by rememberSaveable { mutableStateOf("") }
	var toDateFilter by rememberSaveable { mutableStateOf("") }

	val filtered = sales.filter { s ->
		val matchesText = if (query.isBlank()) true else listOf(s.firstName, s.lastName, s.carTypeName).joinToString(" ").contains(query, ignoreCase = true)
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
		val matchesCommission = when (commissionFilter) {
			"with" -> (s.commissionPrice > 0.0)
			"without" -> (s.commissionPrice == 0.0)
			else -> true
		}
		matchesText && matchesRange && matchesCommission
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
					query = ""; fromDateFilter = ""; toDateFilter = ""; commissionFilter = null
				}) {
					Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(4.dp)) {
						Icon(imageVector = Icons.Filled.Search, contentDescription = null)
						Text("נקה", fontSize = 10.sp)
						Text("חיפוש", fontSize = 10.sp)
					}
				}
			}
		)
		Spacer(Modifier.height(12.dp))
		OutlinedTextField(
			value = query,
			onValueChange = { query = it },
			label = { Text("חיפוש (#, שם, משפחה, טלפון, ת" + "ז)") },
			singleLine = true,
			trailingIcon = {
				IconButton(onClick = { query = "" }, enabled = query.isNotBlank()) { Icon(Icons.Filled.Close, contentDescription = "נקה חיפוש") }
			},
			modifier = Modifier.fillMaxWidth()
		)
		Spacer(Modifier.height(8.dp))
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
					Text("🗓"); Spacer(Modifier.height(2.dp)); Text(if (fromDateFilter.isBlank()) "מתאריך" else fromDateFilter, fontSize = 10.sp)
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
					Text("🗓"); Spacer(Modifier.height(2.dp)); Text(if (toDateFilter.isBlank()) "עד תאריך" else toDateFilter, fontSize = 10.sp)
				}
			}
			FloatingActionButton(onClick = { commissionExpanded = true }) {
				Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
					Text("%"); Spacer(Modifier.height(2.dp)); Text(when (commissionFilter) { "with" -> "עם עמלה"; "without" -> "בלי עמלה"; else -> "הכל" })
				}
			}
		}
		Spacer(Modifier.height(12.dp))

		if (commissionExpanded) {
			androidx.compose.material3.AlertDialog(
				onDismissRequest = { commissionExpanded = false },
				confirmButton = {},
				title = { Text("סינון עמלה") },
				text = {
					Column(modifier = Modifier.fillMaxWidth()) {
						androidx.compose.foundation.lazy.LazyColumn(modifier = Modifier.fillMaxWidth().height(200.dp)) {
							item { Row(modifier = Modifier.fillMaxWidth().clickable { commissionFilter = null; commissionExpanded = false }.padding(vertical = 8.dp)) { Text("הכל") } }
							item { Row(modifier = Modifier.fillMaxWidth().clickable { commissionFilter = "with"; commissionExpanded = false }.padding(vertical = 8.dp)) { Text("עם עמלה") } }
							item { Row(modifier = Modifier.fillMaxWidth().clickable { commissionFilter = "without"; commissionExpanded = false }.padding(vertical = 8.dp)) { Text("בלי עמלה") } }
						}
					}
				},
				dismissButton = { androidx.compose.material3.Button(onClick = { commissionExpanded = false }) { Text("סגור") } }
			)
		}

		Box(modifier = Modifier.weight(1f)) {
			val context = LocalContext.current
			val settings = remember(context) { SettingsStore(context) }
			val defaultTintHex = settings.customerPrivateColor().collectAsState(initial = "#2196F3").value
			val iconTint = Color(android.graphics.Color.parseColor(defaultTintHex))
			androidx.compose.foundation.lazy.LazyColumn {
				items(filtered, key = { s -> s.id }) { s ->
					Row(
						modifier = Modifier
							.fillMaxWidth()
							.padding(12.dp)
							.clickable { navController.navigate("car_purchase/${s.id}") },
						horizontalArrangement = Arrangement.spacedBy(12.dp)
					) {
						Icon(imageVector = Icons.Filled.NewReleases, contentDescription = null, tint = iconTint)
						Column(modifier = Modifier.weight(1f)) {
							Text("${s.firstName} ${s.lastName}")
							Text(s.phone)
							Text(s.carTypeName)
						}
						Column(horizontalAlignment = Alignment.End) {
							Text("₪${s.salePrice.toInt()}")
							Text("עמלה: ₪${s.commissionPrice.toInt()}")
						}
					}
				}
			}
			// No save/cancel FABs here (only in edit screen)
		}

		// summary bar
		val totalCommission = filtered.sumOf { it.commissionPrice }
		Box(modifier = Modifier.fillMaxWidth().height(48.dp).padding(top = 8.dp).background(LocalTitleColor.current)) {
			Row(
				modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp).align(Alignment.Center),
				horizontalArrangement = Arrangement.SpaceBetween,
				verticalAlignment = Alignment.CenterVertically
			) {
				Text("מכירות: ${filtered.size}", color = LocalTitleTextColor.current)
				Text("סה\"כ עמלות: ₪${"%.0f".format(totalCommission)}", color = LocalTitleTextColor.current)
			}
		}
	}
}


