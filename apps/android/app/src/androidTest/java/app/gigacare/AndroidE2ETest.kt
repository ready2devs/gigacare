package app.gigacare

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AndroidE2ETest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun testAppLaunchAndThemeDisplayed() {
        // (a) Abrir app → verificar presencia de elementos principales y estilo
        composeTestRule.onNodeWithText("GigaCare Smart Care").assertIsDisplayed()
        composeTestRule.onNodeWithText("Escanear").assertIsDisplayed()
        composeTestRule.onNodeWithText("Archivos Temporales").assertIsDisplayed()
        composeTestRule.onNodeWithText("Caché de Mensajería").assertIsDisplayed()
    }

    @Test
    fun testSmartCareScanAndNavigation() {
        // (b) Smart Care → interacción con botón de escaneo y módulos
        composeTestRule.onNodeWithText("Escanear").performClick()
        composeTestRule.onNodeWithText("Detener").assertIsDisplayed()

        // Detener escaneo
        composeTestRule.onNodeWithText("Detener").performClick()
        composeTestRule.onNodeWithText("Escanear").assertIsDisplayed()

        // Navegación hacia un módulo
        composeTestRule.onNodeWithText("Archivos Temporales").performClick()
        composeTestRule.onNodeWithText("Limpieza de Módulo").assertIsDisplayed()
        composeTestRule.onNodeWithText("< Atrás").performClick()
        composeTestRule.onNodeWithText("GigaCare Smart Care").assertIsDisplayed()
    }
}
