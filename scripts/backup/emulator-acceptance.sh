#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
# Official firebase-tools CLI must be installed separately. No credentials required.
FIREBASE_BIN="${FIREBASE_BIN:-firebase}"
work="$(mktemp -d /tmp/opentax-backup-emulators.XXXXXX)"
bundle="$PWD/scripts/backup/.emulator-acceptance.$$.mjs"
trap 'rm -f "$bundle"; rm -rf "$work"' EXIT
mkdir -p "$work/home" "${EMULATOR_HOME:-$work/home}/.config/configstore"
printf '%s\n' '{"emulators":{"firestore":{"host":"127.0.0.1","port":8787},"storage":{"host":"127.0.0.1","port":9299},"ui":{"enabled":false},"hub":{"host":"127.0.0.1","port":4440},"logging":{"host":"127.0.0.1","port":4540},"singleProjectMode":false}}' > "$work/firebase.json"
node_modules/.bin/esbuild scripts/backup/emulator-acceptance.ts --bundle --platform=node --packages=external --format=esm --outfile="$bundle"
(cd "$work"; env -u GOOGLE_APPLICATION_CREDENTIALS -u FIREBASE_TOKEN HOME="${EMULATOR_HOME:-$work/home}" XDG_CONFIG_HOME="${EMULATOR_HOME:-$work/home}/.config" CI=true FIREBASE_CLI_DISABLE_MOTD=1 "$FIREBASE_BIN" emulators:exec \
  --only firestore,storage --project demo-backup-acceptance --config "$work/firebase.json" \
  "env -u GOOGLE_APPLICATION_CREDENTIALS -u FIREBASE_TOKEN FIRESTORE_EMULATOR_HOST=127.0.0.1:8787 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9299 node '$bundle'")
