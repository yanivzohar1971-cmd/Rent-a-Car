package com.rentacar.app.agentapi.production

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.rentacar.app.MainActivity

/**
 * AGENT-137: keeps Claude Agent connectivity alive while the app is not visible, within Android rules.
 *
 *  - Foreground service type `specialUse` (declared with PROPERTY_SPECIAL_USE_FGS_SUBTYPE): the
 *    dataSync type is capped at 6 h/24 h on Android 15 and cannot start from BOOT_COMPLETED, which
 *    does not fit an owner-enabled remote-access channel.
 *  - Started only from allowed contexts: the owner's toggle (app visible), boot/package-replaced,
 *    or the notification. If Android refuses, the runtime falls back to app-process mode.
 *  - Persistent, low-importance notification with no business data and a "השבת" action.
 *  - Network callback wakes the relay loop immediately when connectivity returns.
 *  - START_STICKY: restarted by the system after process death while still enabled.
 */
class AgentRelayService : Service() {
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val rt = ProductionAgentRuntime.get(this)
        if (intent?.action == ACTION_DISABLE) {
            rt?.setEnabled(false)
            stopSelfSafely()
            return START_NOT_STICKY
        }
        if (rt == null || !rt.settings.enabled || !rt.relayConfigured) {
            stopSelfSafely()
            return START_NOT_STICKY
        }
        ServiceCompat.startForeground(
            this, NOTIFICATION_ID, buildNotification(this),
            if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
        )
        rt.serviceActive = true
        rt.ensureRelayLoop()
        registerNetworkWake(rt)
        return START_STICKY
    }

    private fun registerNetworkWake(rt: ProductionAgentRuntime) {
        if (networkCallback != null) return
        val cm = getSystemService(ConnectivityManager::class.java) ?: return
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                rt.wake()
            }
        }
        try {
            cm.registerDefaultNetworkCallback(cb)
            networkCallback = cb
        } catch (_: Throwable) {
        }
    }

    private fun stopSelfSafely() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        networkCallback?.let { cb -> try { getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(cb) } catch (_: Throwable) {} }
        networkCallback = null
        ProductionAgentRuntime.get(this)?.serviceActive = false
        super.onDestroy()
    }

    companion object {
        const val CHANNEL_ID = "claude_agent_access"
        const val NOTIFICATION_ID = 7341
        const val ACTION_DISABLE = "com.rentacar.app.agent.DISABLE"

        fun buildNotification(ctx: Context): Notification {
            val nm = ctx.getSystemService(NotificationManager::class.java)
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL_ID) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(CHANNEL_ID, "גישת Claude", NotificationManager.IMPORTANCE_LOW).apply {
                        description = "מוצג כאשר Claude מורשה לקרוא נתונים מהאפליקציה"
                        setShowBadge(false)
                    }
                )
            }
            val open = PendingIntent.getActivity(
                ctx, 1, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val disable = PendingIntent.getService(
                ctx, 2, Intent(ctx, AgentRelayService::class.java).setAction(ACTION_DISABLE),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            return NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
                .setContentTitle("Rent a Car — גישת Claude פעילה")
                .setContentText("Claude מורשה לקרוא נתונים (קריאה בלבד)")
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setContentIntent(open)
                .addAction(0, "השבת", disable)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .build()
        }
    }
}

/**
 * Restarts background connectivity after reboot or app update, ONLY if the owner left it enabled.
 * BOOT_COMPLETED may start a specialUse foreground service (allowed on Android 15+); if the system
 * refuses, the runtime falls back to app-process mode.
 */
class AgentBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        ProductionAgentRuntime.get(context)?.startBackground()
    }
}
