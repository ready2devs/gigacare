package app.gigacare.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import app.gigacare.ui.theme.ElectricCyan
import app.gigacare.ui.theme.ObsidianBackground
import app.gigacare.ui.theme.ObsidianSurface

@Composable
fun ConfirmCleanDialog(
    show: Boolean,
    itemCount: Int,
    totalBytes: Long,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    if (!show) return

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = ObsidianSurface),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, ElectricCyan.copy(alpha = 0.4f), RoundedCornerShape(16.dp))
                .padding(4.dp)
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text(
                    text = "Confirmar Limpieza a Cuarentena",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = ElectricCyan
                )

                Text(
                    text = "Estás a punto de aislar los elementos seleccionados en la cuarentena reversible del dispositivo:",
                    fontSize = 13.sp,
                    color = Color(0xFFF8FAFC)
                )

                // Tarjeta de resumen
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0x1A00E5FF), RoundedCornerShape(8.dp))
                        .border(1.dp, Color(0x3300E5FF), RoundedCornerShape(8.dp))
                        .padding(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "$itemCount archivos",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFF8FAFC)
                            )
                            Text(
                                text = "Seleccionados para aislamiento",
                                fontSize = 11.sp,
                                color = Color(0xFF94A3B8)
                            )
                        }

                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                text = formatBytes(totalBytes),
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = ElectricCyan
                            )
                            Text(
                                text = "Espacio a recuperar",
                                fontSize = 11.sp,
                                color = Color(0xFF94A3B8)
                            )
                        }
                    }
                }

                // Aviso de seguridad y retención (RF-803)
                Text(
                    text = "Los archivos se moverán a la cuarentena local segura (retención por 7 días). Podrás restaurarlos a su ubicación original en cualquier momento antes de la purga permanente.",
                    fontSize = 11.sp,
                    color = Color(0xFFF59E0B)
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF94A3B8))
                    ) {
                        Text("Cancelar")
                    }

                    Button(
                        onClick = onConfirm,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = ElectricCyan,
                            contentColor = ObsidianBackground
                        )
                    ) {
                        Text("Confirmar", fontWeight = FontWeight.Bold)
                    }
                }
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
