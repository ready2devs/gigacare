package app.gigacare.services

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class AndroidAppManagerTest {

    @Test
    fun testOrphanResidualDetectionLogic() {
        val installedPackages = setOf("com.example.app1", "com.example.app2")
        val candidateFolders = listOf("com.example.app1", "com.uninstalled.game", "com.deleted.tool")

        val orphans = candidateFolders.filter { !installedPackages.contains(it) }

        assertEquals(2, orphans.size)
        assertTrue(orphans.contains("com.uninstalled.game"))
        assertTrue(orphans.contains("com.deleted.tool"))
    }
}
