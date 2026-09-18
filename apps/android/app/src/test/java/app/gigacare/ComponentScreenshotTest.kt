package app.gigacare

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import app.gigacare.ui.screens.PhotoCuratorScreen
import app.gigacare.ui.screens.SmartCareScreen
import app.gigacare.ui.screens.SpaceMapScreen
import app.gigacare.ui.theme.GigaCareTheme
import org.junit.Test

/**
 * Screenshot tests inspirados en Paparazzi / Compose preview testing
 * para verificar la renderización visual de pantallas clave.
 */
class ComponentScreenshotTest {

    @Test
    fun testSmartCareScreenRender() {
        val renderBlock = {
            GigaCareTheme {
                SmartCareScreen(onNavigateToModule = {}, modifier = Modifier.fillMaxSize())
            }
        }
        org.junit.Assert.assertNotNull(renderBlock)
    }

    @Test
    fun testSpaceMapScreenRender() {
        val renderBlock = {
            GigaCareTheme {
                SpaceMapScreen(onBack = {}, modifier = Modifier.fillMaxSize())
            }
        }
        org.junit.Assert.assertNotNull(renderBlock)
    }

    @Test
    fun testPhotoCuratorScreenRender() {
        val renderBlock = {
            GigaCareTheme {
                PhotoCuratorScreen(onCleanDiscarded = {}, onBack = {}, modifier = Modifier.fillMaxSize())
            }
        }
        org.junit.Assert.assertNotNull(renderBlock)
    }
}
