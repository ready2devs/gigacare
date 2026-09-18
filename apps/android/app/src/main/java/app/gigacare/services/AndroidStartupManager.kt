package app.gigacare.services

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class BootAppInfo(
    val packageName: String,
    val appName: String,
    val receiverName: String,
    val isSystemApp: Boolean
)

class AndroidStartupManager(private val context: Context) {

    private val packageManager: PackageManager = context.packageManager

    suspend fun listBootCompletedApps(includeSystem: Boolean = false): List<BootAppInfo> =
        withContext(Dispatchers.IO) {
            val bootIntent = Intent(Intent.ACTION_BOOT_COMPLETED)
            val flags = PackageManager.MATCH_ALL

            val resolveInfoList: List<ResolveInfo> =
                packageManager.queryBroadcastReceivers(bootIntent, flags)

            val bootApps = mutableListOf<BootAppInfo>()

            for (resolveInfo in resolveInfoList) {
                val activityInfo = resolveInfo.activityInfo ?: continue
                val appInfo = activityInfo.applicationInfo

                val isSystem = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                if (!includeSystem && isSystem) {
                    continue
                }

                val appName = packageManager.getApplicationLabel(appInfo).toString()
                val pkgName = activityInfo.packageName
                val receiver = activityInfo.name

                bootApps.add(
                    BootAppInfo(
                        packageName = pkgName,
                        appName = appName,
                        receiverName = receiver,
                        isSystemApp = isSystem
                    )
                )
            }

            bootApps.distinctBy { it.packageName }
        }
}
