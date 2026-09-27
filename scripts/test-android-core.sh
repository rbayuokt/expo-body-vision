#!/bin/sh
# Runs the Kotlin core tests on the JVM, no emulator or Expo prebuild. Optional arg: a --tests filter,
# e.g. `sh scripts/test-android-core.sh 'CoreTest.eventQueue*'`.
set -e
cd "$(dirname "$0")/../android/core-tests"
export BODY_VISION_FIXTURES="$(cd ../../fixtures && pwd)"
if [ -n "$1" ]; then
  ./gradlew test -q --console=plain --tests "$1"
else
  ./gradlew test -q --console=plain
fi
echo "Kotlin core tests passed"
