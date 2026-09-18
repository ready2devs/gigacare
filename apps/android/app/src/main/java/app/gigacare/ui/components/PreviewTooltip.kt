package app.gigacare.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import app.gigacare.ui.theme.ElectricCyan
import app.gigacare.ui.theme.ObsidianSurface

@Composable
fun PreviewTooltip(
    name: String,
    path: String,
    sizeBytes: Long,
    isDirectory: Boolean,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    val ext = name.substringAfterLast('.', "").lowercase()
    val isImage = ext in listOf("jpg", "jpeg", "png", "webp")
    val isVideo = ext in listOf("mp4", "mkv", "avi")

    Popup(
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true)
    ) {
        Card(
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = ObsidianSurface),
            modifier = modifier
                .width(260.dp)
                .border(1.dp, ElectricCyan.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
                .padding(14.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = name,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFFF8FAFC)
                )

                if (isImage || isVideo) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(100.dp)
                            .background(Color(0xFF0B0F19), RoundedCornerShape(8.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = if (isImage) "Miniatura Foto (≤512px)" else "Previsualización Video",
                            fontSize = 11.sp,
                            color = Color(0xFF94A3B8)
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = if (isDirectory) "Carpeta" else ext.uppercase(),
                        fontSize = 11.sp,
                        color = Color(0xFFA78BFA)
                    )
                    Text(
                        text = formatBytes(sizeBytes),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = ElectricCyan
                    )
                }

                Text(
                    text = path,
                    fontSize = 10.sp,
                    color = Color(0xFF64748B),
                    maxLines = 2
                )
            }
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
