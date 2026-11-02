#!/bin/sh
# Génère les archives : Chrome/Edge (service worker) et Firefox (scripts d'arrière-plan + identifiant gecko)
set -e
cd "$(dirname "$0")"
OUT=../public/extension; rm -f $OUT/iwt-extension.zip $OUT/iwt-extension-firefox.zip
zip -qr $OUT/iwt-extension.zip . -x README.md build.sh manifest.firefox.json 'store/*'
T=$(mktemp -d); cp -r . "$T/"; cp manifest.firefox.json "$T/manifest.json"
(cd "$T" && zip -qr "$OLDPWD/$OUT/iwt-extension-firefox.zip" . -x README.md build.sh manifest.firefox.json 'store/*')
rm -rf "$T"; ls -l $OUT
