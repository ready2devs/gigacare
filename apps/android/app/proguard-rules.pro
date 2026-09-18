# Reglas ProGuard para UniFFI y JNA
-keep class uniffi.** { *; }
-keep class com.sun.jna.** { *; }
-keepclassmembers class * extends com.sun.jna.Structure {
    public <fields>;
}
