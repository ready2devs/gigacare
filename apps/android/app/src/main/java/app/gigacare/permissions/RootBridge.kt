package app.gigacare.permissions

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

class RootBridge {

    companion object {
        private val SU_BINARY_PATHS = arrayOf(
            "/system/bin/su",
            "/system/xbin/su",
            "/sbin/su",
            "/system/su",
            "/system/bin/.ext/.su",
            "/system/usr/we-need-root/su-backup",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/system/sd/xbin/su",
            "/system/bin/failsafe/su",
            "/data/local/su"
        )
    }

    fun isRooted(): Boolean {
        for (path in SU_BINARY_PATHS) {
            try {
                val file = File(path)
                if (file.exists()) {
                    return true
                }
            } catch (t: Throwable) {
                // Silencioso
            }
        }

        return try {
            val process = Runtime.getRuntime().exec(arrayOf("which", "su"))
            val exitCode = process.waitFor()
            exitCode == 0
        } catch (t: Throwable) {
            false
        }
    }

    suspend fun clearAppCacheRoot(packageName: String, userOptIn: Boolean): Boolean =
        withContext(Dispatchers.IO) {
            if (!userOptIn) {
                // Estrictamente opt-in: el usuario debe haber activado explícitamente el switch de root
                return@withContext false
            }

            if (!isRooted()) {
                return@withContext false
            }

            try {
                val process = Runtime.getRuntime().exec(arrayOf("su", "-c", "rm -rf /data/data/$packageName/cache/*"))
                val exit = process.waitFor()
                exit == 0
            } catch (t: Throwable) {
                false
            }
        }
}
