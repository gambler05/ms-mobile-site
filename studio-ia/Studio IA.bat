@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Studio IA
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nest pas installe. Installez la version LTS depuis https://nodejs.org puis relancez ce fichier.
  start "" https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo Premiere installation : quelques minutes, une seule fois...
  call npm install || goto erreur
)
if not exist .env copy .env.example .env >nul
if not exist web\dist\index.html call npm run build || goto erreur
if not exist server\dist\app.js call npm run build || goto erreur
start "" "node_modules\electron\dist\electron.exe" .
exit /b 0
:erreur
echo Une erreur est survenue. Envoyez le message ci-dessus pour obtenir de laide.
pause
