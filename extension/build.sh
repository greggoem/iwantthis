#!/bin/sh
# Génère les archives : Chrome/Edge (service worker) et Firefox (scripts d'arrière-plan + identifiant gecko).
# Fichiers à envoyer aux boutiques : iwt-extension-<version>-chrome-edge.zip et iwt-extension-<version>-firefox.zip
set -e
cd "$(dirname "$0")"
V=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json | head -1)
OUT=../public/extension; rm -f $OUT/iwt-extension*.zip
zip -qr "$OUT/iwt-extension-$V-chrome-edge.zip" . -x README.md build.sh manifest.firefox.json 'store/*'
T=$(mktemp -d); cp -r . "$T/"; cp manifest.firefox.json "$T/manifest.json"
(cd "$T" && zip -qr "$OLDPWD/$OUT/iwt-extension-$V-firefox.zip" . -x README.md build.sh manifest.firefox.json 'store/*')
rm -rf "$T"
# noms fixes utilisés par « Mon profil »
cp "$OUT/iwt-extension-$V-chrome-edge.zip" $OUT/iwt-extension.zip
cp "$OUT/iwt-extension-$V-firefox.zip" $OUT/iwt-extension-firefox.zip
ls -l $OUT
