package app.gigacare.service

import android.app.Service
import android.content.Intent
import android.os.IBinder

class CleanWorkerService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null
}
