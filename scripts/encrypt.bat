@echo off
:: staticrypt AES-256 — index.html verschluesseln fuer GitHub Pages
:: Voraussetzung: npx staticrypt installiert (npm i -g staticrypt)
::
:: Verwendung: encrypt.bat
:: Passwort wird interaktiv abgefragt.

set /p PASSWORD="Passwort eingeben: "

npx staticrypt index.html --password "%PASSWORD%" --output encrypted/index.html

echo.
echo Fertig. Verschluesselte Datei: encrypted/index.html
pause
