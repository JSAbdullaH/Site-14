#!/usr/bin/env bash
# Archives the iPhone app (with the Apple Watch app inside) and uploads it to TestFlight.
#
#   cp scripts/testflight.env.example scripts/testflight.env   # fill it in once
#   scripts/testflight.sh
#
# Needs Xcode 26 or later (App Store Connect refuses older SDKs) with the watchOS platform installed.
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f scripts/testflight.env ] && source scripts/testflight.env

: "${TEAM_ID:?Set TEAM_ID (Apple Developer → Membership details → Team ID)}"
: "${ASC_KEY_ID:?Set ASC_KEY_ID (App Store Connect → Users and Access → Integrations → Keys)}"
: "${ASC_ISSUER_ID:?Set ASC_ISSUER_ID (shown above the keys list)}"
: "${ASC_KEY_PATH:?Set ASC_KEY_PATH to the downloaded AuthKey_XXXX.p8}"
BUNDLE_ID="${BUNDLE_ID:-sa.site14.tracker}"
API_URL="${API_URL:-}"
# Every upload needs a higher build number than the last one. The time does that.
BUILD_NUMBER="${BUILD_NUMBER:-$(date -u +%Y%m%d%H%M)}"

xcode_major=$(xcodebuild -version | awk 'NR==1 { split($2, v, "."); print v[1] }')
if [ "$xcode_major" -lt 26 ]; then
  echo "Xcode $(xcodebuild -version | head -1 | cut -d' ' -f2) is too old: App Store Connect accepts Xcode 26 or later." >&2
  exit 1
fi

AUTH=(-allowProvisioningUpdates
  -authenticationKeyPath "$ASC_KEY_PATH"
  -authenticationKeyID "$ASC_KEY_ID"
  -authenticationKeyIssuerID "$ASC_ISSUER_ID")

SETTINGS=(DEVELOPMENT_TEAM="$TEAM_ID" SITE14_IOS_BUNDLE_ID="$BUNDLE_ID" CURRENT_PROJECT_VERSION="$BUILD_NUMBER")
[ -n "$API_URL" ] && SETTINGS+=(SITE14_API_URL="$API_URL")

OUT=build/testflight
ARCHIVE="$OUT/SITE14-$BUILD_NUMBER.xcarchive"
rm -rf "$OUT/export"
mkdir -p "$OUT"

echo "▸ Archiving build $BUILD_NUMBER of $BUNDLE_ID"
xcodebuild archive \
  -project SITE14.xcodeproj -scheme SITE14 -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  "${AUTH[@]}" "${SETTINGS[@]}"

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>uploadSymbols</key><true/>
  <key>testFlightInternalTestingOnly</key><false/>
</dict>
</plist>
PLIST

echo "▸ Uploading to App Store Connect"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" -exportOptionsPlist "$OUT/ExportOptions.plist" -exportPath "$OUT/export" \
  "${AUTH[@]}"

echo "✓ Uploaded build $BUILD_NUMBER. It appears in App Store Connect → TestFlight after processing (about 5–30 min)."
