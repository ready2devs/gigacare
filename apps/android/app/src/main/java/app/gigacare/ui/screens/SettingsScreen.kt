package app.gigacare.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.gigacare.ui.theme.ElectricCyan
import app.gigacare.ui.theme.ObsidianBackground
import app.gigacare.ui.theme.ObsidianSurface

@Composable
fun SettingsScreen(
    currentTier: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    var minTempAge by remember { mutableStateOf(7) }
    var retentionDays by remember { mutableStateOf(7) }
    var byokKey by remember { mutableStateOf("") }
    var isValidatingKey by remember { mutableStateOf(false) }
    var keyValidationMessage by remember { mutableStateOf<String?>(null) }
    var shizukuEnabled by remember { mutableStateOf(false) }
    var rootEnabled by remember { mutableStateOf(false) }
    var selectedLanguage by remember { mutableStateOf("es") }

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
                text = "Configuración",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFFF8FAFC)
            )
            Surface(
                shape = RoundedCornerShape(6.dp),
                color = if (currentTier == "Pro") Color(0x3300E5FF) else Color(0x3394A3B8)
            ) {
                Text(
                    text = "Nivel: $currentTier",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = if (currentTier == "Pro") ElectricCyan else Color(0xFF94A3B8),
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                )
            }
        }

        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // 1. Umbrales de Limpieza
            item {
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = ObsidianSurface),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Umbrales de Limpieza", fontWeight = FontWeight.Bold, color = ElectricCyan, fontSize = 14.sp)

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Column {
                                Text("Antigüedad mínima de temporales", fontSize = 12.sp, color = Color(0xFFF8FAFC))
                                Text("$minTempAge días", fontSize = 11.sp, color = Color(0xFF94A3B8))
                            }
                            Slider(
                                value = minTempAge.toFloat(),
                                onValueChange = { minTempAge = it.toInt() },
                                valueRange = 1f..30f,
                                modifier = Modifier.width(140.dp)
                            )
                        }

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Column {
                                Text("Retención en cuarentena", fontSize = 12.sp, color = Color(0xFFF8FAFC))
                                Text("$retentionDays días", fontSize = 11.sp, color = Color(0xFF94A3B8))
                            }
                            Slider(
                                value = retentionDays.toFloat(),
                                onValueChange = { retentionDays = it.toInt() },
                                valueRange = 1f..60f,
                                modifier = Modifier.width(140.dp)
                            )
                        }
                    }
                }
            }

            // 2. BYOK (Google AI Studio)
            item {
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = ObsidianSurface),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Curador de Fotos IA (BYOK)", fontWeight = FontWeight.Bold, color = ElectricCyan, fontSize = 14.sp)
                            Text("Free / BYOK", fontSize = 10.sp, color = Color(0xFFA78BFA))
                        }

                        Text(
                            "Ingresa tu clave de Google AI Studio para análisis multimodal de imágenes en la nube (envía miniaturas ≤512px).",
                            fontSize = 11.sp,
                            color = Color(0xFF94A3B8)
                        )

                        OutlinedTextField(
                            value = byokKey,
                            onValueChange = {
                                byokKey = it
                                keyValidationMessage = null
                            },
                            placeholder = { Text("AIzaSy...", fontSize = 11.sp, color = Color(0xFF64748B)) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )

                        Button(
                            onClick = {
                                isValidatingKey = true
                                // Simulación de validación
                                keyValidationMessage = if (byokKey.startsWith("AIzaSy") && byokKey.length > 15) {
                                    "Clave válida. Proveedor Google AI Studio activo."
                                } else {
                                    "Clave inválida o formato incorrecto."
                                }
                                isValidatingKey = false
                            },
                            enabled = byokKey.isNotEmpty(),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFF1E293B),
                                contentColor = ElectricCyan
                            ),
                            modifier = Modifier.align(Alignment.End)
                        ) {
                            Text("Validar Clave", fontSize = 12.sp)
                        }

                        keyValidationMessage?.let { msg ->
                            Text(
                                text = msg,
                                fontSize = 11.sp,
                                color = if (msg.contains("válida")) Color(0xFF10B981) else Color(0xFFEF4444)
                            )
                        }
                    }
                }
            }

            // 3. Privilegios Avanzados Android (Opt-in)
            item {
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = ObsidianSurface),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Acceso y Permisos Especiales", fontWeight = FontWeight.Bold, color = ElectricCyan, fontSize = 14.sp)

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Integración con Shizuku", fontSize = 12.sp, color = Color(0xFFF8FAFC))
                                Text("Limpia cachés de apps sin root vía API privilegiada.", fontSize = 10.sp, color = Color(0xFF94A3B8))
                            }
                            Switch(checked = shizukuEnabled, onCheckedChange = { shizukuEnabled = it })
                        }

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Modo Root (Superusuario)", fontSize = 12.sp, color = Color(0xFFF8FAFC))
                                Text("Estrictamente opt-in. Limpieza profunda en /data/data/.", fontSize = 10.sp, color = Color(0xFF94A3B8))
                            }
                            Switch(checked = rootEnabled, onCheckedChange = { rootEnabled = it })
                        }
                    }
                }
            }

            // 4. Funciones Pro (RF-1303: Indicadores claros y sin pop-ups intrusivos)
            item {
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = ObsidianSurface),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Escaneos Programados", fontWeight = FontWeight.Bold, color = Color(0xFFF8FAFC), fontSize = 14.sp)
                            Surface(shape = RoundedCornerShape(4.dp), color = Color(0x33F59E0B)) {
                                Text("Exclusivo Pro", fontSize = 10.sp, color = Color(0xFFF59E0B), modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                            }
                        }
                        Text(
                            "Automatiza el mantenimiento nocturno y la purga periódica de residuales.",
                            fontSize = 11.sp,
                            color = Color(0xFF94A3B8)
                        )
                    }
                }
            }
        }
    }
}
