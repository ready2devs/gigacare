package app.gigacare.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog

@Composable
fun StoragePermissionDialog(
    show: Boolean,
    onGrantAllFiles: () -> Unit,
    onGrantSaf: () -> Unit,
    onDismiss: () -> Unit
) {
    if (!show) return

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
            modifier = Modifier.fillMaxWidth().padding(8.dp)
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text(
                    text = "Acceso al Almacenamiento",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF00E5FF)
                )

                Text(
                    text = "GigaCare necesita acceso a tus archivos para escanear y limpiar de manera segura cachés de mensajería, temporales y fotos duplicadas. Todo el análisis es 100% local en tu dispositivo.",
                    fontSize = 14.sp,
                    color = Color(0xFF94A3B8)
                )

                Button(
                    onClick = onGrantAllFiles,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF00E5FF),
                        contentColor = Color(0xFF0B0F19)
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Conceder Acceso Completo (Recomendado)", fontWeight = FontWeight.SemiBold)
                }

                OutlinedButton(
                    onClick = onGrantSaf,
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = Color(0xFFA78BFA)
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Seleccionar Carpetas Manualmente (SAF)")
                }

                TextButton(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Ahora no", color = Color(0xFF64748B))
                }
            }
        }
    }
}
