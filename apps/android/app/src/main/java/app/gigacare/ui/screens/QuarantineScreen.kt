package app.gigacare.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.gigacare.ui.theme.ElectricCyan
import app.gigacare.ui.theme.ObsidianBackground
import app.gigacare.ui.theme.ObsidianSurface

data class AndroidQuarantineEntry(
    val id: String,
    val originalPath: String,
    val sizeBytes: Long,
    val sourceModule: String,
    val quarantinedAt: String
)

@Composable
fun QuarantineScreen(
    onRestore: (List<String>) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    var searchQuery by remember { mutableStateOf("") }
    var selectedModule by remember { mutableStateOf("all") }
    var selectedIds by remember { mutableStateOf(setOf<String>()) }

    val entries = remember {
        listOf(
            AndroidQuarantineEntry(
                id = "q-01",
                originalPath = "/storage/emulated/0/Android/data/com.old.game/cache.dat",
                sizeBytes = 45L * 1024 * 1024,
                sourceModule = "uninstall_residuals",
                quarantinedAt = "2026-09-15"
            ),
            AndroidQuarantineEntry(
                id = "q-02",
                originalPath = "/storage/emulated/0/WhatsApp/Media/.temp_thumb.bin",
                sizeBytes = 12L * 1024 * 1024,
                sourceModule = "messaging_cache",
                quarantinedAt = "2026-09-17"
            )
        )
    }

    val totalBytes = remember(entries) { entries.sumOf { it.sizeBytes } }
    val maxBytes = 5L * 1024 * 1024 * 1024 // 5 GB

    val filtered = remember(entries, searchQuery, selectedModule) {
        entries.filter { entry ->
            val matchMod = selectedModule == "all" || entry.sourceModule == selectedModule
            val matchQuery = searchQuery.isEmpty() || entry.originalPath.contains(searchQuery, ignoreCase = true)
            matchMod && matchQuery
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(ObsidianBackground)
            .padding(16.dp)
    ) {
        // Barra Superior
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButton(onClick = onBack) {
                Text("< Atrás", color = ElectricCyan)
            }
            Text(
                text = "Cuarentena Reversible",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFFF8FAFC)
            )
            Spacer(modifier = Modifier.width(48.dp))
        }

        // Indicador de Espacio
        Card(
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = ObsidianSurface),
            modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp)
        ) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Espacio Ocupado:", fontSize = 12.sp, color = Color(0xFF94A3B8))
                    Text(
                        "${formatBytes(totalBytes)} / ${formatBytes(maxBytes)}",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = ElectricCyan
                    )
                }
                LinearProgressIndicator(
                    progress = { (totalBytes.toFloat() / maxBytes.toFloat()).coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                    color = ElectricCyan,
                    trackColor = Color(0xFF1E293B)
                )
            }
        }

        // Búsqueda
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            placeholder = { Text("Buscar en cuarentena...", fontSize = 12.sp, color = Color(0xFF64748B)) },
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
            singleLine = true
        )

        // Lista Cronológica
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(filtered.size) { idx ->
                val entry = filtered[idx]
                val isChecked = selectedIds.contains(entry.id)

                Card(
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = ObsidianSurface),
                    modifier = Modifier.fillMaxWidth().clickable {
                        selectedIds = if (isChecked) selectedIds - entry.id else selectedIds + entry.id
                    }
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(
                            checked = isChecked,
                            onCheckedChange = { chk ->
                                selectedIds = if (chk) selectedIds + entry.id else selectedIds - entry.id
                            }
                        )
                        Column(modifier = Modifier.weight(1f).padding(horizontal = 8.dp)) {
                            Text(
                                text = entry.originalPath,
                                fontSize = 12.sp,
                                color = Color(0xFFF8FAFC),
                                maxLines = 1
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(entry.sourceModule, fontSize = 10.sp, color = Color(0xFFA78BFA))
                                Text("Ingreso: ${entry.quarantinedAt}", fontSize = 10.sp, color = Color(0xFF64748B))
                            }
                        }
                        Text(
                            text = formatBytes(entry.sizeBytes),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF38BDF8)
                        )
                    }
                }
            }
        }

        // Botón Restaurar
        Button(
            onClick = { onRestore(selectedIds.toList()) },
            enabled = selectedIds.isNotEmpty(),
            colors = ButtonDefaults.buttonColors(
                containerColor = ElectricCyan,
                contentColor = ObsidianBackground
            ),
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp)
        ) {
            Text("Restaurar Seleccionados (${selectedIds.size})", fontWeight = FontWeight.Bold)
        }
    }
}

private fun formatBytes(bytes: Long): String {
    if (bytes <= 0) return "0 B"
    val kb = 1024.0
    val mb = kb * 1024.0
    val gb = mb * 1024.0
    return when {
        bytes >= gb -> String.format("%.2f GB", bytes / gb)
        bytes >= mb -> String.format("%.2f MB", bytes / mb)
        bytes >= kb -> String.format("%.2f KB", bytes / kb)
        else -> "$bytes B"
    }
}
