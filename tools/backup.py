"""Publish a complete SQLite backup atomically, without replacing any file."""
import os
from contextlib import closing
import pathlib
import sqlite3
import sys
import tempfile

def backup(source: pathlib.Path, target: pathlib.Path) -> None:
    if not source.is_file():
        raise ValueError("Source database does not exist.")
    if target.exists():
        raise FileExistsError("Refusing to overwrite an existing backup.")
    # A private staging file on the same filesystem allows atomic publication.
    descriptor, name = tempfile.mkstemp(prefix=".minibank-backup-", dir=target.parent)
    os.close(descriptor)
    temporary = pathlib.Path(name)
    try:
        with closing(sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)) as src:
            with closing(sqlite3.connect(temporary)) as dst:
                src.backup(dst)
        with temporary.open("rb") as completed:
            os.fsync(completed.fileno())
        # link refuses overwrite even if a concurrent process creates target.
        os.link(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: python3 tools/backup.py SOURCE.db NEW-BACKUP.db", file=sys.stderr)
        return 8
    source, target = map(pathlib.Path, sys.argv[1:])
    try:
        backup(source, target)
    except (OSError, sqlite3.Error, ValueError) as error:
        print(f"BACKUP ERROR: {error}", file=sys.stderr)
        return 8
    print(f"Consistent backup created: {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
