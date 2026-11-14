#!/bin/sh
# Checks on the built macOS bundle that KeepKey Desktop depends on.
# Usage: scripts/verify-bundle.sh path/to/App.app
set -eu
app="$1"
fail=0
pass() { echo "PASS $1"; }
bad() { echo "FAIL $1"; fail=1; }
plist="$app/Contents/Info.plist"
if /usr/libexec/PlistBuddy -c "Print :NSCameraUsageDescription" "$plist" >/dev/null 2>&1; then
  pass "Info.plist NSCameraUsageDescription"
else
  bad "Info.plist NSCameraUsageDescription"
fi
if codesign -d --entitlements :- "$app" 2>/dev/null | grep -q "com.apple.security.device.camera"; then
  pass "camera entitlement"
else
  bad "camera entitlement (needs a codesigned build)"
fi
min=$(/usr/libexec/PlistBuddy -c "Print :LSMinimumSystemVersion" "$plist" 2>/dev/null || echo "?")
echo "INFO LSMinimumSystemVersion=$min"
find "$app" -type f \( -perm +111 -o -name "*.dylib" -o -name "*.node" \) | while read -r f; do
  v=$(vtool -show-build "$f" 2>/dev/null | awk '/minos/{print $2; exit}')
  [ -n "$v" ] && echo "INFO minos $v ${f#$app/}"
done
exit $fail
