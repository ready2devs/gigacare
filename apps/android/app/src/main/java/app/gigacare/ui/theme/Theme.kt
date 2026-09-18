package app.gigacare.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary = ElectricCyan,
    onPrimary = ObsidianBackground,
    primaryContainer = ElectricCyanGlow,
    onPrimaryContainer = ElectricCyan,
    secondary = RadiantViolet,
    onSecondary = SlateLight,
    secondaryContainer = RadiantVioletGlow,
    onSecondaryContainer = RadiantViolet,
    background = ObsidianBackground,
    onBackground = SlateLight,
    surface = ObsidianSurface,
    onSurface = SlateLight,
    surfaceVariant = ObsidianSurfaceElevated,
    onSurfaceVariant = SlateMuted,
    error = ErrorRed,
    onError = SlateLight
)

private val LightColorScheme = lightColorScheme(
    primary = ElectricCyan,
    onPrimary = ObsidianBackground,
    secondary = RadiantViolet,
    background = SlateLight,
    surface = SlateLight,
    onBackground = ObsidianBackground,
    onSurface = ObsidianBackground
)

@Composable
fun GigaCareTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    // Dynamic color disponible a partir de Android 12 (API 31+)
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            window.statusBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = GigaCareTypography,
        content = content
    )
}
