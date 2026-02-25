#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
FLUTTER_BIN="${FLUTTER_BIN:-flutter}"
RUN_CHECKS="${RUN_CHECKS:-1}"

usage() {
  cat <<USAGE
Usage: $0 <api_base_url> [appbundle|apk|both]

Examples:
  $0 https://api.example.com appbundle
  RUN_CHECKS=0 $0 https://api.example.com both
USAGE
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

API_BASE_URL="$1"
TARGET="${2:-appbundle}"

if [[ "$API_BASE_URL" != https://* ]]; then
  echo "Error: API base URL must start with https://"
  exit 1
fi

if [[ "$API_BASE_URL" == *localhost* || "$API_BASE_URL" == *127.0.0.1* || "$API_BASE_URL" == *10.0.2.2* ]]; then
  echo "Error: API base URL cannot point to localhost/emulator for release builds."
  exit 1
fi

case "$TARGET" in
  appbundle|apk|both) ;;
  *)
    echo "Error: target must be one of: appbundle, apk, both"
    exit 1
    ;;
esac

KEY_PROPERTIES="$ANDROID_DIR/key.properties"
if [[ ! -f "$KEY_PROPERTIES" ]]; then
  echo "Error: $KEY_PROPERTIES not found."
  echo "Copy $ANDROID_DIR/key.properties.example to key.properties and fill values."
  exit 1
fi

GOOGLE_SERVICES_JSON="$ANDROID_DIR/app/google-services.json"
if [[ ! -f "$GOOGLE_SERVICES_JSON" ]]; then
  echo "Error: $GOOGLE_SERVICES_JSON not found."
  echo "Push notifications require Firebase Android config."
  exit 1
fi

STORE_FILE_RAW="$(grep -E '^storeFile=' "$KEY_PROPERTIES" | head -n1 | cut -d'=' -f2- | xargs)"
if [[ -z "$STORE_FILE_RAW" ]]; then
  echo "Error: storeFile is missing in key.properties"
  exit 1
fi

if [[ "$STORE_FILE_RAW" = /* ]]; then
  STORE_FILE="$STORE_FILE_RAW"
else
  STORE_FILE="$ANDROID_DIR/$STORE_FILE_RAW"
fi

if [[ ! -f "$STORE_FILE" ]]; then
  echo "Error: Keystore file not found at: $STORE_FILE"
  exit 1
fi

cd "$ROOT_DIR"

"$FLUTTER_BIN" pub get

if [[ "$RUN_CHECKS" == "1" ]]; then
  "$FLUTTER_BIN" analyze
  "$FLUTTER_BIN" test
fi

if [[ "$TARGET" == "appbundle" || "$TARGET" == "both" ]]; then
  "$FLUTTER_BIN" build appbundle --release --dart-define="API_BASE_URL=$API_BASE_URL"
fi

if [[ "$TARGET" == "apk" || "$TARGET" == "both" ]]; then
  "$FLUTTER_BIN" build apk --release --dart-define="API_BASE_URL=$API_BASE_URL"
fi

echo "Release build complete."
