package app.gigacare.permissions

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class StoragePermissionsTest {

    @Test
    fun testStorageAccessLevels() {
        val full = StorageAccessLevel.FullAllFiles
        val saf = StorageAccessLevel.SafScoped(listOf("content://uri/1", "content://uri/2"))
        val none = StorageAccessLevel.None

        assertNotNull(full)
        assertEquals(2, (saf as StorageAccessLevel.SafScoped).grantedUris.size)
        assertNotNull(none)
    }
}
