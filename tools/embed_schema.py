"""Generate a C string from the one authoritative schema source."""
import json
import pathlib
import sys

source, target = map(pathlib.Path, sys.argv[1:])
target.write_text(
    'static const char schema_sql[] =\n'
    + '\n'.join(json.dumps(line + '\n') for line in source.read_text().splitlines())
    + ';\n'
)
