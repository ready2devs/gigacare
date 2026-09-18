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

data class ItemEntry(
    val id: String,
    val path: String,
    val sizeBytes: Long,
    val category: String
)

@Composable
fun ModuleScreen(
    title: String,
    description: String,
    items: List<ItemEntry>,
    onCleanSelected: (List<String>) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    var selectedIds by remember { mutableStateOf(items.map { it.id }.toSet()) }
    var filterCategory by remember { mutableStateOf("all") }

    val categories = remember(items) {
        listOf("all") + items.map { it.category }.distinct()
    }

    val filteredItems = remember(items, filterCategory) {
        if (filterCategory == "all") items else items.filter { it.category == filterCategory }
    }

    val selectedBytes = remember(items, selectedIds) {
        items.filter { selectedIds.contains(it.id) }.sumOf { it.sizeBytes }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(ObsidianBackground)
            .padding(16.dp)
    ) {
        // Top Bar
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButton(onClick = onBack) {
                Text("< Atrás", color = ElectricCyan)
            }
            Text(
                text = title,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFFF8FAFC)
            )
            Text(
                text = formatBytes(selectedBytes),
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = ElectricCyan
            )
        }

        Text(
            text = description,
            fontSize = 12.sp,
            color = Color(0xFF94A3B8),
            modifier = Modifier.padding(bottom = 12.dp)
        )

        // Filtros
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            categories.forEach { cat ->
                FilterChip(
                    selected = filterCategory == cat,
                    onClick = { filterCategory = cat },
                    label = { Text(if (cat == "all") "Todos" else cat) }
                )
            }
        }

        // Lista de Hallazgos
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(filteredItems.size) { index ->
                val item = filteredItems[index]
                val isChecked = selectedIds.contains(item.id)

                Card(
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = ObsidianSurface),
                    modifier = Modifier.fillMaxWidth().clickable {
                        selectedIds = if (isChecked) selectedIds - item.id else selectedIds + item.id
                    }
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Checkbox(
                            checked = isChecked,
                            onCheckedChange = { checked ->
                                selectedIds = if (checked) selectedIds + item.id else selectedIds - item.id
                            }
                        )

                        Column(modifier = Modifier.weight(1f).padding(horizontal = 8.dp)) {
                            Text(
                                text = item.path,
                                fontSize = 12.sp,
                                color = Color(0xFFF8FAFC),
                                maxLines = 1
                            )
                            Text(
                                text = item.category,
                                fontSize = 10.sp,
                                color = Color(0xFF94A3B8)
                            )
                        }

                        Text(
                            text = formatBytes(item.sizeBytes),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF38BDF8)
                        )
                    }
                }
            }
        }

        // Botón de Limpieza
        Button(
            onClick = { onCleanSelected(selectedIds.toList()) },
            enabled = selectedIds.isNotEmpty(),
            colors = ButtonDefaults.buttonColors(
                containerColor = ElectricCyan,
                contentColor = ObsidianBackground
            ),
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp)
        ) {
            Text(
                text = "Limpiar Seleccionados (${selectedIds.size})",
                fontWeight = FontWeight.Bold
            )
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
