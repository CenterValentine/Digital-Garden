#!/bin/bash
#
# Build + install the Digital Garden shell onto a physical iPhone.
#
# Free Apple "Personal Team" signatures expire after 7 days, so this runs
# again roughly weekly. Everything it does was learned the hard way during
# the first device build (2026-08-17); the notes below are why each flag is
# here, not decoration.
#
# Usage:
#   ./scripts/install-device.sh                 # production URL (default)
#   WEB_URL=http://192.168.1.42:3015/mobile ./scripts/install-device.sh
#   DEVICE_ID=<udid> ./scripts/install-device.sh
#
# Prereqs (one-time, already done on this Mac):
#   - Apple ID added in Xcode → Settings → Accounts (creates the Personal Team)
#   - iOS device platform installed: xcodebuild -downloadPlatform iOS
#   - Developer Mode enabled on the phone (Settings → Privacy & Security)
#   - No app-install restriction active (Screen Time / MDM / productivity apps
#     surface as "prohibited by ManagedConfiguration")

set -euo pipefail

DEVICE_ID="${DEVICE_ID:-00008101-001960303413001E}"   # David's iPhone (2)
TEAM_ID="${TEAM_ID:-NL5KNKV4FU}"                      # David Valentine (Personal Team)
WEB_URL="${WEB_URL:-https://davidvalentine.org/mobile}"

IOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../ios" && pwd)"
APP_PATH="${IOS_DIR}/build/Build/Products/Release-iphoneos/DigitalGarden.app"

echo "==> Building Release for device ${DEVICE_ID}"
echo "    web target: ${WEB_URL}"

# Why xcodebuild and not `expo run:ios --device`: Xcode 26 keeps signing
# certificates in Apple's cloud, where `security find-identity` can't see
# them. Expo's CLI pre-checks the local keychain, finds zero identities, and
# refuses to build — even though signing itself works fine.
#
# -allowProvisioningUpdates lets Xcode mint/refresh the provisioning profile
# and register the device with the team automatically (required weekly, since
# free-team profiles are short-lived).
cd "$IOS_DIR"
xcodebuild \
  -workspace DigitalGarden.xcworkspace \
  -scheme DigitalGarden \
  -configuration Release \
  -destination "platform=iOS,id=${DEVICE_ID}" \
  -derivedDataPath ./build \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="${TEAM_ID}" \
  CODE_SIGN_STYLE=Automatic \
  build

[[ -d "$APP_PATH" ]] || { echo "error: build produced no app at ${APP_PATH}" >&2; exit 1; }

# Installing needs the screen unlocked *at that moment* — iOS mounts a
# personalized Developer Disk Image first and gates that behind the lock
# screen. Retry rather than fail so the phone can be unlocked at leisure.
echo "==> Installing (unlock the phone and keep it awake)"
for attempt in $(seq 1 30); do
  if OUT=$(xcrun devicectl device install app --device "${DEVICE_ID}" "$APP_PATH" 2>&1); then
    echo "==> Installed. Trust the cert if prompted:"
    echo "    Settings → General → VPN & Device Management → Developer App → Trust"
    exit 0
  fi
  if ! grep -q "DeviceLocked" <<<"$OUT"; then
    echo "$OUT" | tail -8 >&2
    exit 1
  fi
  [[ $attempt -eq 1 ]] && echo "    waiting for the phone to be unlocked..."
  sleep 10
done

echo "error: device stayed locked for 5 minutes" >&2
exit 1
