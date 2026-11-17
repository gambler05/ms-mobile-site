#!/bin/sh
# Lanceur Studio IA pour macOS et Linux (double-clic, ou : ./"Studio IA.command")
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js n'est pas installé. Installez la version LTS depuis https://nodejs.org puis relancez."
  read -r _
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Première installation : quelques minutes, une seule fois..."
  npm install || { echo "Erreur pendant l'installation."; read -r _; exit 1; }
fi
[ -f .env ] || cp .env.example .env
if [ ! -f web/dist/index.html ] || [ ! -f server/dist/app.js ]; then
  npm run build || { echo "Erreur pendant la compilation."; read -r _; exit 1; }
fi
nohup npx electron . >/dev/null 2>&1 &
