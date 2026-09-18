package app.gigacare.services

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class ScheduleWorker(
    private val context: Context,
    private val licenseValidator: suspend () -> String
) {

    suspend fun executeScheduledScan(): Boolean = withContext(Dispatchers.IO) {
        val tier = licenseValidator()

        // Verificación estricta de tier: solo usuarios Pro tienen escaneo programado
        if (tier.lowercase() != "pro") {
            return@withContext false
        }

        // Ejecutar escaneo en segundo plano
        ScanService.start(context)
        true
    }
}
