#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
make --no-print-directory --silent all
mkdir -p data
./build/minibank --db data/demo.db init
if [ "${1:-}" != "--prepare" ]; then
    exec python3 web/server.py
fi
