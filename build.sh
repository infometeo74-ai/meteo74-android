#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if [ -z "${METEO74_SIGNING_PASSWORD:-}" ]; then
  METEO74_SIGNING_PASSWORD=$(cat .signing/password)
  export METEO74_SIGNING_PASSWORD
fi
exec ./gradlew --no-daemon assembleRelease
