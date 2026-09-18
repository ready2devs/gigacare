package app.gigacare.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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

data class PhotoAnalysis(
    val sharpness: Float,
    val eyesOpen: Float,
    val composition: Float,
    val totalScore: Float,
    val isKeep: Boolean,
    val providerUsed: String
)

data class PhotoItem(
    val path: String,
    val resolution: String,
    val sizeBytes: Long,
    val analysis: PhotoAnalysis
)

data class PhotoGroupItem(
    val id: String,
    val photos: List<PhotoItem>
)

@Composable
fun PhotoCuratorScreen(
    onCleanDiscarded: (List<String>) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    var keepCount by remember { mutableStateOf(1) }

    var groups by remember {
        mutableStateOf(
            listOf(
                PhotoGroupItem(
                    id = "grupo_01",
                    photos = listOf(
                        PhotoItem(
                            path = "/storage/emulated/0/DCIM/Camera/IMG_2024_01.jpg",
                            resolution = "4032x3024",
                            sizeBytes = 4194304,
                            analysis = PhotoAnalysis(0.92f, 0.95f, 0.88f, 0.92f, true, "google_ai_studio")
                        ),
                        PhotoItem(
                            path = "/storage/emulated/0/DCIM/Camera/IMG_2024_02.jpg",
                            resolution = "4032x3024",
                            sizeBytes = 4154304,
                            analysis = PhotoAnalysis(0.60f, 0.20f, 0.80f, 0.55f, false, "google_ai_studio")
                        )
                    )
                )
            )
        )
    }

    val discardedPaths = remember(groups) {
        groups.flatMap { g -> g.photos.filter { !it.analysis.isKeep }.map { it.path } }
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
                text = "Curador de Fotos IA",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFFF8FAFC)
            )
            Text(
                text = "Conservar: ${keepCount}",
                fontSize = 12.sp,
                color = ElectricCyan
            )
        }

        Text(
            text = "Detección perceptual por pHash y puntuación multimodal con fallback local.",
            fontSize = 12.sp,
            color = Color(0xFF94A3B8),
            modifier = Modifier.padding(bottom = 12.dp)
        )

        // Lista de Grupos
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            items(groups.size) { gIdx ->
                val group = groups[gIdx]
                val isFallback = group.photos.any { it.analysis.providerUsed == "local_fallback" }

                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = ObsidianSurface),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Grupo #${gIdx + 1} (${group.photos.size} fotos similares)",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFF8FAFC)
                            )
                            Surface(
                                shape = RoundedCornerShape(4.dp),
                                color = if (isFallback) Color(0x33F59E0B) else Color(0x337C3AED)
                            ) {
                                Text(
                                    text = if (isFallback) "Análisis local (aproximado)" else "IA Multimodal",
                                    fontSize = 10.sp,
                                    color = if (isFallback) Color(0xFFF59E0B) else Color(0xFFA78BFA),
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }

                        // Comparativa Lado a Lado
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            group.photos.forEach { photo ->
                                val isKeep = photo.analysis.isKeep
                                Column(
                                    modifier = Modifier
                                        .weight(1f)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(Color(0xFF0B0F19))
                                        .border(
                                            1.dp,
                                            if (isKeep) ElectricCyan else Color(0xFFEF4444).copy(alpha = 0.5f),
                                            RoundedCornerShape(8.dp)
                                        )
                                        .padding(8.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(80.dp)
                                            .background(Color(0xFF1E293B), RoundedCornerShape(6.dp)),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(photo.resolution, fontSize = 10.sp, color = Color(0xFF94A3B8))
                                    }

                                    Text(
                                        text = if (isKeep) "✓ Conservar" else "✗ Descartar",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (isKeep) ElectricCyan else Color(0xFFEF4444)
                                    )

                                    Text("Nitidez: ${(photo.analysis.sharpness * 100).toInt()}%", fontSize = 10.sp, color = Color(0xFF94A3B8))
                                    Text("Ojos: ${(photo.analysis.eyesOpen * 100).toInt()}%", fontSize = 10.sp, color = Color(0xFF94A3B8))
                                    Text("Total: ${(photo.analysis.totalScore * 100).toInt()}%", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFFF8FAFC))
                                }
                            }
                        }
                    }
                }
            }
        }

        if (discardedPaths.isNotEmpty()) {
            Button(
                onClick = { onCleanDiscarded(discardedPaths) },
                colors = ButtonDefaults.buttonColors(
                    containerColor = ElectricCyan,
                    contentColor = ObsidianBackground
                ),
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp)
            ) {
                Text("Enviar Descartadas a Cuarentena (${discardedPaths.size})", fontWeight = FontWeight.Bold)
            }
        }
    }
}
