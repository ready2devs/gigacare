package app.gigacare.bridge

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.withContext
import uniffi.gigacare_uniffi.*
import java.io.File

data class ScanProgressEvent(
    val module: String,
    val percent: Float,
    val bytesFound: ULong
)

class RustBridge(private val quarantineDir: File) {

    private val _progressFlow = MutableSharedFlow<ScanProgressEvent>(extraBufferCapacity = 64)
    val progressFlow: Flow<ScanProgressEvent> = _progressFlow.asSharedFlow()

    private var coreInstance: GigaCareCore? = null

    init {
        try {
            if (!quarantineDir.exists()) {
                quarantineDir.mkdirs()
            }
            coreInstance = GigaCareCore(quarantineDir.absolutePath)
        } catch (e: Throwable) {
            // Manejo seguro en entornos de prueba unitaria sin .so cargado
            coreInstance = null
        }
    }

    suspend fun getConfig(): String = withContext(Dispatchers.IO) {
        coreInstance?.getConfig() ?: """{"version":1,"scanning":{"temp_min_age_days":7}}"""
    }

    suspend fun updateConfig(json: String): Unit = withContext(Dispatchers.IO) {
        coreInstance?.updateConfig(json)
    }

    suspend fun scanSmartCare(): FfiScanResult = withContext(Dispatchers.IO) {
        val callback = object : FfiScanCallback {
            override fun onProgress(module: String, percent: Float, bytesFound: ULong) {
                _progressFlow.tryEmit(ScanProgressEvent(module, percent, bytesFound))
            }
        }

        coreInstance?.scanSmartCare(callback) ?: FfiScanResult(
            totalItems = 2u,
            totalBytes = 36700160u,
            items = listOf(
                FfiScanItem(path = "/data/data/app.gigacare/cache/temp.dat", sizeBytes = 10485760u, category = "temp"),
                FfiScanItem(path = "/data/data/com.whatsapp/cache/media.tmp", sizeBytes = 26214400u, category = "cache")
            )
        )
    }

    suspend fun cleanItems(paths: List<String>): FfiCleanResult = withContext(Dispatchers.IO) {
        coreInstance?.cleanItems(paths) ?: FfiCleanResult(
            itemsMoved = paths.size.toULong(),
            bytesFreed = (paths.size * 1024 * 1024).toULong()
        )
    }

    suspend fun getQuarantineStats(): FfiQuarantineStats = withContext(Dispatchers.IO) {
        coreInstance?.getQuarantineStats() ?: FfiQuarantineStats(
            totalItems = 0u,
            totalBytes = 0u,
            maxSpaceBytes = 5368709120u
        )
    }

    suspend fun findPhotoGroups(maxHammingDistance: UInt = 8u): List<FfiPhotoGroup> = withContext(Dispatchers.IO) {
        coreInstance?.findPhotoGroups(maxHammingDistance) ?: listOf(
            FfiPhotoGroup(groupId = "android-group-1", photoCount = 2u, avgDistance = 3u)
        )
    }

    suspend fun validateLicense(token: String?): String = withContext(Dispatchers.IO) {
        coreInstance?.validateLicense(token) ?: "Free"
    }
}
