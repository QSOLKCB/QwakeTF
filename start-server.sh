#!/usr/bin/env sh
# Serves QwakeTF at http://localhost:8000 (needs Python 3)
cd "$(dirname "$0")"
echo "Open http://localhost:8000 in your browser (Ctrl+C to stop)"
( sleep 1; command -v xdg-open >/dev/null && xdg-open http://localhost:8000 || command -v open >/dev/null && open http://localhost:8000 ) >/dev/null 2>&1 &
python3 -m http.server 8000 || python -m http.server 8000
