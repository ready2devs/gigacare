package app.gigacare.services

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*

class ScanService : Service() {

    companion object {
        const val CHANNEL_ID = "gigacare_scan_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START_SCAN = "app.gigacare.START_SCAN"
        const val ACTION_STOP_SCAN = "app.gigacare.STOP_SCAN"

        fun start(context: Context) {
            val intent = Intent(context, ScanService::class.java).apply {
                action = ACTION_START_SCAN
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, ScanService::class.java).apply {
                action = ACTION_STOP_SCAN
            }
            context.startService(intent)
        }
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO + Job())

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_SCAN -> {
                val notification = buildNotification("Iniciando escaneo del sistema...", 0)
                startForeground(NOTIFICATION_ID, notification)
                runScanSimulation()
            }
            ACTION_STOP_SCAN -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    private fun runScanSimulation() {
        serviceScope.launch {
            for (p in 1..100 step 10) {
                delay(400)
                val n = buildNotification("Analizando almacenamiento...", p)
                val manager = getSystemService(NotificationManager::class.java)
                manager.notify(NOTIFICATION_ID, n)
            }
            delay(500)
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    private fun buildNotification(text: String, progress: Int): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("GigaCare Smart Care")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_rotate)
            .setProgress(100, progress, false)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Escaneo en Segundo Plano",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Progreso del escaneo y limpieza del sistema"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        serviceScope.cancel()
        super.onDestroy()
    }
}
