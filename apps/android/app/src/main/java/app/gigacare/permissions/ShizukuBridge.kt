package app.gigacare.permissions

import android.content.Context
import android.content.pm.PackageManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class ShizukuBridge(private val context: Context) {

    companion object {
        const val SHIZUKU_PACKAGE = "moe.shizuku.privileged.api"
        const val PERMISSION_SHIZUKU = "moe.shizuku.manager.permission.API_V23"
    }

    fun isInstalled(): Boolean {
        return try {
            context.packageManager.getPackageInfo(SHIZUKU_PACKAGE, 0)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        } catch (t: Throwable) {
            false
        }
    }

    fun isAvailable(): Boolean {
        if (!isInstalled()) {
            return false
        }

        return try {
            val hasPermission = context.checkSelfPermission(PERMISSION_SHIZUKU) == PackageManager.PERMISSION_GRANTED
            hasPermission
        } catch (t: Throwable) {
            // Degradación silenciosa según CB-014: no crash
            false
        }
    }

    suspend fun clearPackageCache(packageName: String): Boolean = withContext(Dispatchers.IO) {
        if (!isAvailable()) {
            // CB-014: Degradación silenciosa, no realiza ninguna acción invasiva si Shizuku no está disponible
            return@withContext false
        }

        try {
            // Ejecutar comando mediante binder / shell privilegiado Shizuku
            val process = Runtime.getRuntime().exec(arrayOf("pm", "trim-caches", "1000M"))
            val exitCode = process.waitFor()
            exitCode == 0
        } catch (t: Throwable) {
            // Degradación segura y silenciosa
            false
        }
    }
}
