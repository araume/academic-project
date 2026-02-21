#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
KEY_PROPERTIES="$ANDROID_DIR/key.properties"
DEFAULT_KEYSTORE="$ANDROID_DIR/upload-keystore.jks"

KEYSTORE_PATH="$DEFAULT_KEYSTORE"
KEY_ALIAS="upload"
DNAME="CN=Thesis Mobile, OU=Engineering, O=Thesis, L=City, ST=State, C=US"
VALIDITY_DAYS=10000
KEY_SIZE=4096
FORCE=0
GENERATE=1

usage() {
  cat <<USAGE
Usage: $0 [options]

Options:
  --keystore <path>   Keystore path (default: android/upload-keystore.jks)
  --alias <name>      Key alias (default: upload)
  --dname <value>     X.500 distinguished name
  --validity <days>   Certificate validity days (default: 10000)
  --keysize <bits>    RSA key size (default: 4096)
  --no-generate       Skip keytool generation; only write key.properties
  --force             Overwrite existing key.properties and keystore
  -h, --help          Show this help

Environment overrides:
  STORE_PASSWORD      Keystore + key.properties store password
  KEY_PASSWORD        Keystore + key.properties key password (defaults to STORE_PASSWORD)

Examples:
  $0
  $0 --keystore /secure/release.jks --alias release
  STORE_PASSWORD='***' KEY_PASSWORD='***' $0 --no-generate
USAGE
}

require_value() {
  local flag="$1"
  local value="${2:-}"
  if [[ -z "$value" ]]; then
    echo "Error: missing value for $flag"
    exit 1
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keystore)
      require_value "$1" "${2:-}"
      KEYSTORE_PATH="$2"
      shift 2
      ;;
    --alias)
      require_value "$1" "${2:-}"
      KEY_ALIAS="$2"
      shift 2
      ;;
    --dname)
      require_value "$1" "${2:-}"
      DNAME="$2"
      shift 2
      ;;
    --validity)
      require_value "$1" "${2:-}"
      VALIDITY_DAYS="$2"
      shift 2
      ;;
    --keysize)
      require_value "$1" "${2:-}"
      KEY_SIZE="$2"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --no-generate)
      GENERATE=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ "$KEYSTORE_PATH" != /* ]]; then
  KEYSTORE_PATH="$ANDROID_DIR/$KEYSTORE_PATH"
fi

STORE_PASSWORD="${STORE_PASSWORD:-}"
KEY_PASSWORD="${KEY_PASSWORD:-}"
if [[ -n "$STORE_PASSWORD" && -z "$KEY_PASSWORD" ]]; then
  KEY_PASSWORD="$STORE_PASSWORD"
fi

if [[ "$GENERATE" == "1" ]]; then
  if ! command -v keytool >/dev/null 2>&1; then
    echo "Error: keytool not found. Install a JDK and ensure keytool is on PATH."
    exit 1
  fi
fi

if [[ -f "$KEY_PROPERTIES" && "$FORCE" != "1" ]]; then
  echo "Error: $KEY_PROPERTIES already exists. Use --force to overwrite."
  exit 1
fi

if [[ -f "$KEYSTORE_PATH" && "$FORCE" != "1" && "$GENERATE" == "1" ]]; then
  echo "Error: keystore already exists at $KEYSTORE_PATH. Use --force to overwrite."
  exit 1
fi

mkdir -p "$(dirname "$KEYSTORE_PATH")"

if [[ "$GENERATE" == "1" ]]; then
  if [[ -n "$STORE_PASSWORD" ]]; then
    echo "Generating keystore via keytool (non-interactive password mode)..."
  else
    echo "Generating keystore via keytool (you will be prompted for passwords)..."
  fi
  KEYTOOL_CMD=(
    keytool
    -genkeypair
    -v
    -keystore "$KEYSTORE_PATH"
    -alias "$KEY_ALIAS"
    -keyalg RSA
    -keysize "$KEY_SIZE"
    -validity "$VALIDITY_DAYS"
    -dname "$DNAME"
  )
  if [[ -n "$STORE_PASSWORD" ]]; then
    KEYTOOL_CMD+=(-storepass "$STORE_PASSWORD")
  fi
  if [[ -n "$KEY_PASSWORD" ]]; then
    KEYTOOL_CMD+=(-keypass "$KEY_PASSWORD")
  fi
  "${KEYTOOL_CMD[@]}"
fi

if [[ ! -f "$KEYSTORE_PATH" ]]; then
  echo "Error: keystore not found at $KEYSTORE_PATH"
  exit 1
fi

if [[ -z "$STORE_PASSWORD" ]]; then
  read -rsp "Enter store password for key.properties: " STORE_PASSWORD
  echo
fi

if [[ -z "$KEY_PASSWORD" ]]; then
  read -rsp "Enter key password for key.properties (press enter to reuse store password): " KEY_PASSWORD
  echo
fi

if [[ -z "$KEY_PASSWORD" ]]; then
  KEY_PASSWORD="$STORE_PASSWORD"
fi

STORE_FILE_VALUE="$KEYSTORE_PATH"
if [[ "$KEYSTORE_PATH" == "$ANDROID_DIR/"* ]]; then
  STORE_FILE_VALUE="${KEYSTORE_PATH#"$ANDROID_DIR/"}"
fi

cat > "$KEY_PROPERTIES" <<EOF
storeFile=$STORE_FILE_VALUE
storePassword=$STORE_PASSWORD
keyAlias=$KEY_ALIAS
keyPassword=$KEY_PASSWORD
EOF

chmod 600 "$KEY_PROPERTIES" "$KEYSTORE_PATH"

echo "Signing setup complete."
echo " - Keystore: $KEYSTORE_PATH"
echo " - key.properties: $KEY_PROPERTIES"
echo "Run ./scripts/build_release.sh https://<prod-api> appbundle"
