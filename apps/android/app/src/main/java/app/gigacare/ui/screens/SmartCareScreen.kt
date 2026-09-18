package app.gigacare.ui.screens

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.gigacare.ui.components.ModuleCard
import app.gigacare.ui.theme.ElectricCyan
import app.gigacare.ui.theme.ObsidianBackground
import app.gigacare.ui.theme.ObsidianSurface

data class ModuleState(
    val id: String,
    val title: String,
    val subtitle: String,
    val bytesFound: Long = 0L,
    val percent: Float = 0f
)

@Composable
fun SmartCareScreen(
    onNavigateToModule: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var isScanning by remember { mutableStateOf(false) }
    var totalBytesFound by remember { mutableStateOf(0L) }

    var modules by remember {
        mutableStateOf(
            listOf(
                ModuleState("system_temp", "Archivos Temporales", "Cachés del sistema y archivos huérfanos"),
                ModuleState("messaging_cache", "Caché de Mensajería", "WhatsApp, Telegram y medios temporales"),
                ModuleState("photo_duplicates", "Curador de Fotos", "Ráfagas similares y fotos de baja calidad"),
                ModuleState("uninstall_residuals", "Residuales de Apps", "Carpetas vacías y datos de apps eliminadas"),
                ModuleState("startup_items", "Optimización de Inicio", "Apps con arranque automático en segundo plano")
            )
        )
    }

    val pulseTransition = rememberInfiniteTransition(label = "pulse")
    val pulseScale by pulseTransition.animateFloat(
        initialValue = 1f,
        targetValue = if (isScanning) 1.08f else 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(800, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse_scale"
    )

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(ObsidianBackground)
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Encabezado
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "GigaCare Smart Care",
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFFF8FAFC)
                )
                Text(
                    text = "Optimización integral del dispositivo",
                    fontSize = 13.sp,
                    color = Color(0xFF94A3B8)
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Botón Central Asimétrico y Prominente
        Box(
            modifier = Modifier
                .size(160.dp)
                .scale(pulseScale)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            Color(0x6600E5FF),
                            Color(0x337C3AED),
                            ObsidianSurface
                        )
                    )
                )
                .border(2.dp, ElectricCyan, CircleShape)
                .padding(8.dp),
            contentAlignment = Alignment.Center
        ) {
            Button(
                onClick = {
                    isScanning = !isScanning
                    if (isScanning) {
                        totalBytesFound = 345000000L // Simulado
                        modules = modules.map { it.copy(percent = 100f, bytesFound = 69000000L) }
                    } else {
                        modules = modules.map { it.copy(percent = 0f) }
                    }
                },
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.Transparent,
                    contentColor = Color(0xFFF8FAFC)
                ),
                modifier = Modifier.fillMaxSize()
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = if (isScanning) "Detener" else "Escanear",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = ElectricCyan
                    )
                    Text(
                        text = if (isScanning) "Analizando..." else "Smart Care",
                        fontSize = 12.sp,
                        color = Color(0xFF94A3B8)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // Tarjetas de Módulos
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth().weight(1f)
        ) {
            items(modules.size) { index ->
                val mod = modules[index]
                ModuleCard(
                    title = mod.title,
                    subtitle = mod.subtitle,
                    bytesFound = mod.bytesFound,
                    percent = mod.percent,
                    isScanning = isScanning,
                    onClick = { onNavigateToModule(mod.id) }
                )
            }
        }
    }
}
