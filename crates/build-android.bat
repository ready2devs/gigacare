@echo off
echo ============================================================
echo Compilando librerias compartidas gigacare_uniffi para Android
echo Requiere Android NDK r25+ instalado y configurado en ANDROID_NDK_HOME
echo ============================================================

if "%ANDROID_NDK_HOME%"=="" (
    echo [ERROR] ANDROID_NDK_HOME no esta configurado.
    echo Por favor configure ANDROID_NDK_HOME apuntando a su NDK r25+
    exit /b 1
)

set TOOLCHAIN=%ANDROID_NDK_HOME%\toolchains\llvm\prebuilt\windows-x86_64\bin
set PATH=%TOOLCHAIN%;%PATH%

echo Compilando aarch64-linux-android...
set CC_aarch64_linux_android=%TOOLCHAIN%\aarch64-linux-android29-clang.cmd
set AR_aarch64_linux_android=%TOOLCHAIN%\llvm-ar.exe
cargo build -p gigacare-uniffi --target aarch64-linux-android --release

echo Compilando armv7-linux-androideabi...
set CC_armv7_linux_androideabi=%TOOLCHAIN%\armv7a-linux-androideabi29-clang.cmd
set AR_armv7_linux_androideabi=%TOOLCHAIN%\llvm-ar.exe
cargo build -p gigacare-uniffi --target armv7-linux-androideabi --release

echo Compilando x86_64-linux-android...
set CC_x86_64_linux_android=%TOOLCHAIN%\x86_64-linux-android29-clang.cmd
set AR_x86_64_linux_android=%TOOLCHAIN%\llvm-ar.exe
cargo build -p gigacare-uniffi --target x86_64-linux-android --release

echo Copiando archivos .so a jniLibs...
mkdir ..\apps\android\app\src\main\jniLibs\arm64-v8a 2>nul
mkdir ..\apps\android\app\src\main\jniLibs\armeabi-v7a 2>nul
mkdir ..\apps\android\app\src\main\jniLibs\x86_64 2>nul

copy target\aarch64-linux-android\release\libgigacare_uniffi.so ..\apps\android\app\src\main\jniLibs\arm64-v8a\
copy target\armv7-linux-androideabi\release\libgigacare_uniffi.so ..\apps\android\app\src\main\jniLibs\armeabi-v7a\
copy target\x86_64-linux-android\release\libgigacare_uniffi.so ..\apps\android\app\src\main\jniLibs\x86_64\

echo Compilacion Android completada con exito.
