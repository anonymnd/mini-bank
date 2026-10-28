#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
make --no-print-directory --silent all
mkdir -p data
if [ "$#" -eq 0 ]; then
    ./build/minibank --db data/demo.db init
    exec ./build/minibank --db data/demo.db menu
fi
exec ./build/minibank "$@"
