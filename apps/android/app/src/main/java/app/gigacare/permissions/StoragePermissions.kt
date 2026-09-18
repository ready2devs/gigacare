package app.gigacare.permissions

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.Settings
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.edit

sealed class StorageAccessLevel {
    object FullAllFiles : StorageAccessLevel()
    data class SafScoped(val grantedUris: List<String>) : StorageAccessLevel()
    object None : StorageAccessLevel()
}

class StoragePermissionsManager(private val context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    companion object {
        private const val PREFS_NAME = "gigacare_storage_perms"
        private const val KEY_GRANTED_URIS = "granted_saf_uris"
        private const val KEY_ALL_FILES_ASKED = "all_files_asked"
    }

    fun getStorageAccessLevel(): StorageAccessLevel {
        if (hasAllFilesAccess()) {
            return StorageAccessLevel.FullAllFiles
        }

        val uris = getSavedSafUris()
        return if (uris.isNotEmpty()) {
            StorageAccessLevel.SafScoped(uris)
        } else {
            StorageAccessLevel.None
        }
    }

    fun hasAllFilesAccess(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            true
        }
    }

    fun requestAllFilesAccess(activity: Activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            prefs.edit { putBoolean(KEY_ALL_FILES_ASKED, true) }
            val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                data = Uri.parse("package:${activity.packageName}")
            }
            activity.startActivity(intent)
        }
    }

    fun createOpenDocumentTreeIntent(initialFolder: String? = null): Intent {
        return Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                    Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && initialFolder != null) {
                val uri = Uri.parse("content://com.android.externalstorage.documents/document/primary%3A$initialFolder")
                putExtra(DocumentsContract.EXTRA_INITIAL_URI, uri)
            }
        }
    }

    fun onSafResult(uri: Uri?) {
        if (uri == null) return

        try {
            val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            context.contentResolver.takePersistableUriPermission(uri, flags)

            val currentUris = getSavedSafUris().toMutableSet()
            currentUris.add(uri.toString())
            saveSafUris(currentUris)
        } catch (e: SecurityException) {
            // Manejo de error si los permisos ya no son persistibles
        }
    }

    fun getSavedSafUris(): List<String> {
        val set = prefs.getStringSet(KEY_GRANTED_URIS, emptySet()) ?: emptySet()
        return set.toList()
    }

    private fun saveSafUris(uris: Set<String>) {
        prefs.edit {
            putStringSet(KEY_GRANTED_URIS, uris)
        }
    }

    fun clearPermissions() {
        prefs.edit {
            remove(KEY_GRANTED_URIS)
            remove(KEY_ALL_FILES_ASKED)
        }
    }
}
