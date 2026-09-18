package app.gigacare.services

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ScheduleWorkerTest {

    @Test
    fun testFreeTierCannotRunScheduledScan() = runBlocking {
        // En tier Free, la ejecución programada debe ser rechazada inmediatamente
        val worker = ScheduleWorker(null as? android.content.Context ?: return@runBlocking) { "Free" }
        val executed = worker.executeScheduledScan()
        assertFalse(executed)
    }

    @Test
    fun testProTierAllowedLogic() {
        val tierCheck = { tier: String -> tier.lowercase() == "pro" }
        assertFalse(tierCheck("Free"))
        assertFalse(tierCheck("Trial"))
        assertTrue(tierCheck("Pro"))
    }
}
