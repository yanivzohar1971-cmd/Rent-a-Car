package com.rentacar.app.ui.components

import android.app.Activity
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavHostController
import com.rentacar.app.ui.components.AppButton
import com.rentacar.app.LocalBackButtonColor

@Composable
fun BackButton(navController: NavHostController, label: String = "חזרה") {
    val activity = LocalContext.current as? Activity
    AppButton(onClick = {
        val popped = navController.popBackStack()
        if (!popped) activity?.finish()
    }, containerColor = LocalBackButtonColor.current) {
        Text(label)
    }
}


