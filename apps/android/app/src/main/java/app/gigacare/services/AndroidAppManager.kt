package app.gigacare.services

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

data class InstalledAppInfo(
    val packageName: String,
    val appName: String,
    val isSystemApp: Boolean,
    val firstInstallTime: Long,
    val lastUpdateTime: Long,
    val estimatedSizeBytes: Long
)

data class OrphanFolderInfo(
    val path: String,
    val packageName: String,
    val sizeBytes: Long,
    val locationType: String // data, media, obb
)

class AndroidAppManager(private val context: Context) {

    private val packageManager: PackageManager = context.packageManager

    suspend fun listInstalledApps(includeSystem: Boolean = false): List<InstalledAppInfo> =
        withContext(Dispatchers.IO) {
            val flags = PackageManager.GET_META_DATA
            val packages = packageManager.getInstalledApplications(flags)

            packages.mapNotNull { appInfo ->
                val isSystem = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                if (!includeSystem && isSystem) {
                    return@mapNotNull null
                }

                val pkgInfo = try {
                    packageManager.getPackageInfo(appInfo.packageName, 0)
                } catch (e: Exception) {
                    null
                }

                val sourceDir = File(appInfo.sourceDir)
                val appSize = if (sourceDir.exists()) sourceDir.length() else 0L

                InstalledAppInfo(
                    packageName = appInfo.packageName,
                    appName = packageManager.getApplicationLabel(appInfo).toString(),
                    isSystemApp = isSystem,
                    firstInstallTime = pkgInfo?.firstInstallTime ?: 0L,
                    lastUpdateTime = pkgInfo?.lastUpdateTime ?: 0L,
                    estimatedSizeBytes = appSize
                )
            }
        }

    fun createUninstallIntent(packageName: String): Intent {
        return Intent(Intent.ACTION_UNINSTALL_PACKAGE).apply {
            data = Uri.parse("package:$packageName")
            putExtra(Intent.EXTRA_RETURN_RESULT, true)
        }
    }

    suspend fun scanOrphanResiduals(): List<OrphanFolderInfo> = withContext(Dispatchers.IO) {
        val installedPackages = packageManager.getInstalledApplications(0)
            .map { it.packageName }
            .toSet()

        val orphans = mutableListOf<OrphanFolderInfo>()
        val extStorage = Environment.getExternalStorageDirectory() ?: return@withContext emptyList()

        val checkDirs = listOf(
            Pair(File(extStorage, "Android/data"), "data"),
            Pair(File(extStorage, "Android/media"), "media"),
            Pair(File(extStorage, "Android/obb"), "obb")
        )

        for ((targetDir, locType) in checkDirs) {
            if (targetDir.exists() && targetDir.isDirectory) {
                val subDirs = targetDir.listFiles() ?: continue
                for (subDir in subDirs) {
                    if (subDir.isDirectory) {
                        val pkgCandidate = subDir.name
                        // Si el nombre no pertenece a ningún paquete instalado, es un residuo huérfano
                        if (!installedPackages.contains(pkgCandidate)) {
                            orphans.add(
                                OrphanFolderInfo(
                                    path = subDir.absolutePath,
                                    packageName = pkgCandidate,
                                    sizeBytes = calculateFolderSize(subDir),
                                    locationType = locType
                                )
                            )
                        }
                    }
                }
            }
        }

        orphans
    }

    private fun calculateFolderSize(folder: File): Long {
        var length = 0L
        val files = folder.listFiles() ?: return 0L
        for (file in files) {
            length += if (file.isFile) {
                file.length()
            } else {
                calculateFolderSize(file)
            }
        }
        return length
    }
}
