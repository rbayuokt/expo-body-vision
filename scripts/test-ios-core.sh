#!/bin/sh
# Runs ios/Tests against ios/Core on macOS with plain xctest, no simulator. Core imports Foundation only.
set -e
cd "$(dirname "$0")/../ios"
OUT="${TMPDIR:-/tmp}/BodyVisionCoreTests.xctest"
PLAT="$(xcrun --show-sdk-platform-path)"
rm -rf "$OUT" && mkdir -p "$OUT/Contents/MacOS"
xcrun swiftc -O -parse-as-library -emit-library -module-name BodyVisionCoreTests \
  -o "$OUT/Contents/MacOS/BodyVisionCoreTests" Core/*.swift Tests/*.swift \
  -F "$PLAT/Developer/Library/Frameworks" -I "$PLAT/Developer/usr/lib" -L "$PLAT/Developer/usr/lib" \
  -framework XCTest -Xlinker -rpath -Xlinker "$PLAT/Developer/Library/Frameworks" \
  -Xlinker -rpath -Xlinker "$PLAT/Developer/usr/lib"
export BODY_VISION_FIXTURES="$(cd ../fixtures && pwd)"
if [ -n "$1" ]; then
  xcrun xctest -XCTest "BodyVisionCoreTests.$1" "$OUT"
else
  xcrun xctest "$OUT"
fi
