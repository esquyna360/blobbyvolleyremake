#!/usr/bin/env bash
# Capacitor 8 exige JDK 21; o 17 do resto da máquina quebra o compileJava.
set -euo pipefail
export JAVA_HOME="${JAVA_HOME_BLOBBY:-/opt/homebrew/opt/openjdk@21}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
cd "$(dirname "$0")/../android"
./gradlew "${1:-assembleRelease}"
echo "APK: $(cd .. && pwd)/android/app/build/outputs/apk/release/app-release.apk"
