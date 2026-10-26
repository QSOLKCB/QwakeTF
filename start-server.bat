@echo off
cd /d "%~dp0"
echo Open http://localhost:8000 in your browser (close this window to stop)
start "" http://localhost:8000
python -m http.server 8000 || py -m http.server 8000
pause
