package app.gigacare

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import app.gigacare.ui.screens.*
import app.gigacare.ui.theme.GigaCareTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            GigaCareTheme {
                var currentScreen by remember { mutableStateOf("smartcare") }

                when (currentScreen) {
                    "smartcare" -> SmartCareScreen(
                        onNavigateToModule = { moduleId -> currentScreen = moduleId },
                        modifier = Modifier.fillMaxSize()
                    )
                    "photo_duplicates" -> PhotoCuratorScreen(
                        onCleanDiscarded = { currentScreen = "quarantine" },
                        onBack = { currentScreen = "smartcare" },
                        modifier = Modifier.fillMaxSize()
                    )
                    "quarantine" -> QuarantineScreen(
                        onRestore = { currentScreen = "smartcare" },
                        onBack = { currentScreen = "smartcare" },
                        modifier = Modifier.fillMaxSize()
                    )
                    "space_map" -> SpaceMapScreen(
                        onBack = { currentScreen = "smartcare" },
                        modifier = Modifier.fillMaxSize()
                    )
                    "settings" -> SettingsScreen(
                        currentTier = "Free",
                        onBack = { currentScreen = "smartcare" },
                        modifier = Modifier.fillMaxSize()
                    )
                    else -> ModuleScreen(
                        title = "Limpieza de Módulo",
                        description = "Archivos y cachés detectados en $currentScreen",
                        items = listOf(
                            ItemEntry("1", "/storage/emulated/0/Android/data/temp1.dat", 10485760L, "temp"),
                            ItemEntry("2", "/storage/emulated/0/Android/data/temp2.dat", 20971520L, "cache")
                        ),
                        onCleanSelected = { currentScreen = "smartcare" },
                        onBack = { currentScreen = "smartcare" },
                        modifier = Modifier.fillMaxSize()
                    )
                }
            }
        }
    }
}
