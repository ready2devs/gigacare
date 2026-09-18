package app.gigacare.bridge

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class RustBridgeTest {

    @Test
    fun testGetConfigReturnsDefaultJson() = runBlocking {
        val tempDir = File(System.getProperty("java.io.tmpdir"), "gigacare_test_quarantine")
        val bridge = RustBridge(tempDir)

        val configJson = bridge.getConfig()
        assertNotNull(configJson)
        assertTrue(configJson.contains("version"))
    }
}
