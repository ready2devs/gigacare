package app.gigacare.ui.screens

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.gigacare.ui.components.PreviewTooltip
import app.gigacare.ui.theme.ElectricCyan
import app.gigacare.ui.theme.ObsidianBackground
import app.gigacare.ui.theme.ObsidianSurface

data class SpaceNode(
    val name: String,
    val path: String,
    val sizeBytes: Long,
    val isDirectory: Boolean,
    val children: List<SpaceNode> = emptyList()
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun SpaceMapScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    var currentNode by remember {
        mutableStateOf(
            SpaceNode(
                name = "Almacenamiento Interno",
                path = "/storage/emulated/0",
                sizeBytes = 64L * 1024 * 1024 * 1024,
                isDirectory = true,
                children = listOf(
                    SpaceNode("DCIM", "/storage/emulated/0/DCIM", 18L * 1024 * 1024 * 1024, true),
                    SpaceNode("Download", "/storage/emulated/0/Download", 8L * 1024 * 1024 * 1024, true),
                    SpaceNode("Android", "/storage/emulated/0/Android", 12L * 1024 * 1024 * 1024, true),
                    SpaceNode("WhatsApp", "/storage/emulated/0/WhatsApp", 6L * 1024 * 1024 * 1024, true),
                    SpaceNode("pelicula_demo.mp4", "/storage/emulated/0/pelicula_demo.mp4", 180L * 1024 * 1024, false),
                    SpaceNode("foto_raw_alta.jpg", "/storage/emulated/0/foto_raw_alta.jpg", 65L * 1024 * 1024, false)
                )
            )
        )
    }

    var history by remember { mutableStateOf(listOf<SpaceNode>()) }
    var tooltipNode by remember { mutableStateOf<SpaceNode?>(null) }

    val maxBytes = remember(currentNode) {
        currentNode.children.maxOfOrNull { it.sizeBytes } ?: 1L
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(ObsidianBackground)
            .padding(16.dp)
    ) {
        // Encabezado con ruta y navegación
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButton(
                onClick = {
                    if (history.isNotEmpty()) {
                        currentNode = history.last()
                        history = history.dropLast(1)
                    } else {
                        onBack()
                    }
                }
            ) {
                Text(if (history.isNotEmpty()) "< Volver" else "< Salir", color = ElectricCyan)
            }

            Text(
                text = currentNode.name,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFFF8FAFC)
            )

            Text(
                text = formatBytes(currentNode.sizeBytes),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color(0xFF38BDF8)
            )
        }

        Text(
            text = "Toca para explorar carpetas. Mantén presionado para previsualizar archivos grandes (≥50 MB).",
            fontSize = 11.sp,
            color = Color(0xFF94A3B8),
            modifier = Modifier.padding(vertical = 8.dp)
        )

        // Grid interactivo de burbujas proporcionales
        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 110.dp),
            modifier = Modifier.weight(1f).fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(currentNode.children.size) { index ->
                val child = currentNode.children[index]
                val ratio = (child.sizeBytes.toFloat() / maxBytes.toFloat()).coerceIn(0.6f, 1f)
                val bubbleSize = (100 * ratio).dp

                Box(
                    modifier = Modifier
                        .size(bubbleSize)
                        .clip(CircleShape)
                        .background(
                            Brush.radialGradient(
                                colors = listOf(
                                    Color(0x5500E5FF),
                                    Color(0x337C3AED),
                                    ObsidianSurface
                                )
                            )
                        )
                        .border(1.5.dp, ElectricCyan.copy(alpha = 0.6f), CircleShape)
                        .combinedClickable(
                            onClick = {
                                if (child.isDirectory) {
                                    history = history + currentNode
                                    currentNode = child.copy(
                                        children = listOf(
                                            SpaceNode("Subcarpeta 1", "${child.path}/sub1", child.sizeBytes / 2, true),
                                            SpaceNode("video_clip.mp4", "${child.path}/clip.mp4", 90L * 1024 * 1024, false)
                                        )
                                    )
                                }
                            },
                            onLongClick = {
                                if (child.sizeBytes >= 50L * 1024 * 1024) {
                                    tooltipNode = child
                                }
                            }
                        )
                        .padding(8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = child.name,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFFF8FAFC),
                            textAlign = TextAlign.Center,
                            maxLines = 2
                        )
                        Text(
                            text = formatBytes(child.sizeBytes),
                            fontSize = 10.sp,
                            color = Color(0xFF38BDF8)
                        )
                    }
                }
            }
        }

        // Tooltip flotante al hacer long press
        tooltipNode?.let { node ->
            PreviewTooltip(
                name = node.name,
                path = node.path,
                sizeBytes = node.sizeBytes,
                isDirectory = node.isDirectory,
                onDismiss = { tooltipNode = null }
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
