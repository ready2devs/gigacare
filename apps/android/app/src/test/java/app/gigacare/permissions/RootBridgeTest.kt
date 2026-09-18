package app.gigacare.permissions

import org.junit.Assert.assertFalse
import org.junit.Test

class RootBridgeTest {

    @Test
    fun testRootCheckReturnsFalseOnStandardEnvironment() {
        val bridge = RootBridge()
        val isRoot = bridge.isRooted()
        // En una máquina de desarrollo o emulador estándar sin 'su', debe retornar false sin crashear
        assertFalse(isRoot)
    }
}
