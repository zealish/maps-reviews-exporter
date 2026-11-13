#!/usr/bin/env bash
# Local simulation of the packaging step in .github/workflows/release.yml
set -euo pipefail
cd "$(dirname "$0")/.."

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

VERSION=$(node -p "require('./manifest.json').version")
NAME="google-maps-reviews-exporter"
mkdir -p "$STAGE/$NAME"
cp manifest.json popup.html popup.js background.js xlsx.full.min.js "$STAGE/$NAME/"
cp -r icons "$STAGE/$NAME/icons"

OUT="$STAGE/$NAME-v$VERSION.zip"
(cd "$STAGE" && zip -rq "$OUT" "$NAME")
echo "Built: $OUT"
unzip -l "$OUT"
