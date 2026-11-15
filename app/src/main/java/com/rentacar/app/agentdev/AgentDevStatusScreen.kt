package com.rentacar.app.agentdev

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.rentacar.app.BuildConfig

/**
 * AGENT-101 (AgentDev only). Replaces the Firebase-backed navigation graph, which cannot run
 * offline, with a static status page so the process stays foreground while the gateway serves.
 */
@Composable
fun AgentDevStatusScreen() {
    val status by AgentDevBootstrap.status.collectAsState()
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier.padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text("Rent a Car AgentDev", style = MaterialTheme.typography.headlineSmall)
            Text("Offline Agent gateway (loopback only)")
            Text("uid: ${BuildConfig.AGENT_DEV_UID}")
            Text("port: ${BuildConfig.AGENT_DEV_PORT}")
            Text(status)
        }
    }
}
