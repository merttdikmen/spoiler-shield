#!/usr/bin/env bash
# Repackage the extension into store/spoiler-shield-<version>.zip with manifest.json at the ZIP root.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"   # store/tools -> store -> repo root
VER="$(python3 -c "import json;print(json.load(open('$ROOT/manifest.json'))['version'])")"
OUT="$ROOT/store/spoiler-shield-$VER.zip"
cd "$ROOT"
rm -f "$OUT"
zip -r -X "$OUT" manifest.json content icons popup >/dev/null
echo "wrote $OUT ($(unzip -l "$OUT" | tail -1 | awk '{print $2}') files)"
