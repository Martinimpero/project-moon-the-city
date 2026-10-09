@echo off
rem Starts the Project Moon web app on this computer and opens it in your browser.
rem Needs Python (python.org). Close this window to stop it.
cd /d "%~dp0"
start "" http://localhost:8766/
python -m http.server 8766
