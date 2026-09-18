package app.gigacare.services

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidStartupManagerTest {

    @Test
    fun testBootCompletedAppsFiltering() {
        val apps = listOf(
            BootAppInfo("com.example.auto", "AutoApp", "com.example.auto.BootReceiver", false),
            BootAppInfo("com.example.auto", "AutoApp", "com.example.auto.SecondReceiver", false),
            BootAppInfo("com.example.other", "OtherApp", "com.example.other.Receiver", false),
            BootAppInfo("android", "System", "com.android.server.BootReceiver", true)
        )

        val nonSystem = apps.filter { !it.isSystemApp }.distinctBy { it.packageName }
        assertEquals(2, nonSystem.size)
        assertTrue(nonSystem.any { it.packageName == "com.example.auto" })
        assertTrue(nonSystem.any { it.packageName == "com.example.other" })
    }
}
