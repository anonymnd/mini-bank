"""Isolated server for browser tests. Never opens or resets the demo database."""
from http.server import ThreadingHTTPServer
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from web.server import Application, handler_for  # noqa: E402


def main():
    with tempfile.TemporaryDirectory(prefix="minibank-browser-") as directory:
        database = Path(directory) / "bank.db"
        subprocess.run([str(ROOT / "build/minibank"), "--db", str(database), "init"], check=True)
        server = ThreadingHTTPServer(("127.0.0.1", 8766), handler_for(Application(database)))
        print("Isolated browser test server: http://127.0.0.1:8766", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()


if __name__ == "__main__":
    main()
