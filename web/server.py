"""Loopback-only Angular host and HTTP adapter to the existing COBOL executable."""
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import argparse
import hmac
import json
import mimetypes
from pathlib import Path
import re
import secrets
import sqlite3
import subprocess
import tempfile
import threading
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = re.compile(r"[A-Z0-9_-]{1,24}", re.ASCII)
ACCOUNT = re.compile(r"[A-Z0-9]{8}", re.ASCII)
AMOUNT = re.compile(r"[0-9]{1,9}\.[0-9]{2}", re.ASCII)
MAX_UPLOAD = 256 * 1024


class ApiError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


class Application:
    def __init__(self, database, assets=None, executable=None):
        self.database = Path(database).resolve()
        self.assets = Path(assets or ROOT / "frontend/dist/minibank/browser").resolve()
        self.executable = Path(executable or ROOT / "build/minibank").resolve()
        self.token = secrets.token_urlsafe(32)
        self.workers = threading.BoundedSemaphore(4)

    def command(self, *arguments):
        if not self.workers.acquire(blocking=False):
            raise ApiError(503, "Operations are busy. Retry using the same payment reference.")
        try:
            try:
                result = subprocess.run(
                    [str(self.executable), "--db", str(self.database), *arguments],
                    capture_output=True, text=True, timeout=60, check=False,
                )
            except subprocess.TimeoutExpired:
                raise ApiError(503, "The operation timed out; its outcome may be uncertain. Inspect and retry the SAME reference or original batch.") from None
            except OSError:
                raise ApiError(503, "The COBOL executable is unavailable. Build the application and retry.") from None
        finally:
            self.workers.release()
        if result.returncode not in (0, 4):
            raise ApiError(503, "COBOL reported a technical failure. Reconcile and retry the same reference or original batch.")
        return {"ok": result.returncode == 0, "output": result.stdout.strip(), "code": result.returncode}

    def snapshot(self, account=None):
        try:
            with closing(sqlite3.connect(self.database.as_uri() + "?mode=ro", uri=True, timeout=5)) as db:
                db.row_factory = sqlite3.Row
                db.execute("BEGIN")
                if db.execute("PRAGMA user_version").fetchone()[0] != 1:
                    raise ApiError(503, "Unsupported database schema.")
                def rows(sql, params=()):
                    return [dict(row) for row in db.execute(sql, params).fetchall()]
                if account is not None:
                    accounts = rows("SELECT a.id,c.name,a.balance_cents FROM accounts a JOIN customers c ON c.id=a.customer_id WHERE a.id=?", (account,))
                    if not accounts:
                        raise ApiError(404, "Account not found.")
                    entries = rows("SELECT p.reference,p.created_at,p.reversal_of,l.signed_cents FROM ledger l JOIN payments p ON p.reference=l.payment_reference WHERE l.account_id=? ORDER BY p.created_at DESC,p.reference DESC LIMIT 200", (account,))
                    for row in [*accounts, *entries]:
                        self.validate_money(row)
                    return {"account": accounts[0], "entries": entries}
                accounts = rows("SELECT a.id,c.name,a.balance_cents FROM accounts a JOIN customers c ON c.id=a.customer_id ORDER BY a.id LIMIT 200")
                payments = rows("SELECT p.*, (SELECT reference FROM payments r WHERE r.reversal_of=p.reference AND r.status='POSTED') AS reversed_by FROM payments p ORDER BY created_at DESC,reference DESC LIMIT 100")
                runs = rows("SELECT id,status,started_at,finished_at,posted,retried,rejected,input_path FROM batch_runs ORDER BY id DESC LIMIT 100")
                rejects = rows("SELECT run_id,line_number,reason FROM batch_rejects ORDER BY run_id DESC,line_number LIMIT 100")
                for row in [*accounts, *payments]:
                    self.validate_money(row)
                summary = dict(db.execute("SELECT (SELECT count(*) FROM accounts) AS accounts,(SELECT count(*) FROM payments WHERE status='POSTED') AS posted,(SELECT count(*) FROM payments WHERE status='REJECTED') AS rejected,(SELECT coalesce(sum(balance_cents),0) FROM accounts) AS total_cents").fetchone())
                if type(summary["total_cents"]) is not int:
                    raise ApiError(503, "Invalid monetary data. Run reconciliation before continuing.")
                for run in runs:
                    run["file_name"] = Path(run.pop("input_path")).name
                return {"accounts": accounts, "payments": payments, "runs": runs, "rejects": rejects, "summary": summary}
        except sqlite3.Error:
            raise ApiError(503, "Database inquiry is unavailable. Check the local database and run reconciliation.") from None

    @staticmethod
    def validate_money(row):
        for field in ("balance_cents", "cents", "signed_cents"):
            if field in row and (type(row[field]) is not int or abs(row[field]) > 99999999999):
                raise ApiError(503, "Invalid monetary data. Run reconciliation before continuing.")

    def mutate(self, path, body):
        if not isinstance(body, dict):
            raise ApiError(400, "Expected a JSON object.")
        if path == "/api/transfers":
            self.fields(body, {"reference", "source", "destination", "amount"})
            for field, pattern in (("reference", REFERENCE), ("source", ACCOUNT), ("destination", ACCOUNT), ("amount", AMOUNT)):
                self.match(body, field, pattern)
            return self.command("transfer", body["reference"], body["source"], body["destination"], body["amount"])
        if path == "/api/reversals":
            self.fields(body, {"reference", "original"})
            for field in ("reference", "original"):
                self.match(body, field, REFERENCE)
            return self.command("reverse", body["reference"], body["original"])
        if path == "/api/reconcile":
            self.fields(body, set())
            return self.command("reconcile")
        if path == "/api/batches":
            self.fields(body, {"name", "content"})
            if not isinstance(body["name"], str) or not 1 <= len(body["name"]) <= 120:
                raise ApiError(400, "A file name of 1–120 characters is required.")
            if not isinstance(body["content"], str):
                raise ApiError(400, "File content must be text.")
            try:
                content = body["content"].encode("ascii")
            except UnicodeEncodeError:
                raise ApiError(400, "Payment files must use ASCII encoding.") from None
            if len(content) > MAX_UPLOAD:
                raise ApiError(413, "Payment files are limited to 256 KiB.")
            imports = self.database.parent / "imports"
            imports.mkdir(exist_ok=True, mode=0o700)
            with tempfile.NamedTemporaryFile(prefix="payments-", suffix=".dat", dir=imports, delete=False) as upload:
                upload.write(content)
                stored = Path(upload.name)
            # Retained unchanged for audit and safe replay, including failed jobs.
            return {**self.command("batch", str(stored)), "file_name": stored.name}
        raise ApiError(404, "Unknown operation.")

    @staticmethod
    def fields(body, expected):
        if set(body) != expected:
            raise ApiError(400, "Missing or unexpected request fields.")

    @staticmethod
    def match(body, field, pattern):
        if not isinstance(body[field], str) or not pattern.fullmatch(body[field]):
            raise ApiError(400, f"Invalid {field} format.")


def handler_for(application):
    class Handler(BaseHTTPRequestHandler):
        server_version = "MiniBank"

        def log_message(self, format, *args):
            # Do not log token/body or filesystem/database details.
            pass

        def headers_common(self):
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")

        def json_response(self, status, body):
            payload = json.dumps(body).encode("utf-8")
            self.respond(status, payload, "application/json; charset=utf-8")

        def respond(self, status, payload, content_type):
            try:
                self.send_response(status)
                self.headers_common()
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            except (BrokenPipeError, ConnectionResetError):
                # The browser has left. Do not send a second error response or
                # retry a possibly committed financial operation.
                self.close_connection = True

        def guard(self, token=False):
            port = self.server.server_address[1]
            hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
            if self.headers.get("Host") not in hosts:
                raise ApiError(403, "Local host required.")
            origin = self.headers.get("Origin")
            if origin and origin != "http://" + self.headers.get("Host", ""):
                raise ApiError(403, "Same-origin requests required.")
            if self.headers.get("Sec-Fetch-Site") == "cross-site":
                raise ApiError(403, "Cross-site requests denied.")
            if token and not hmac.compare_digest(self.headers.get("X-MiniBank-Token", "").encode("utf-8"), application.token.encode("utf-8")):
                raise ApiError(403, "Local session expired. Refresh the page.")

        def do_GET(self):
            try:
                self.guard()
                path = unquote(urlsplit(self.path).path)
                if path.startswith("/api/"):
                    if path == "/api/session":
                        return self.json_response(200, {"application": "minibank", "token": application.token})
                    self.guard(token=True)
                    if path == "/api/state":
                        return self.json_response(200, application.snapshot())
                    if path.startswith("/api/accounts/"):
                        account = path.removeprefix("/api/accounts/")
                        if not ACCOUNT.fullmatch(account):
                            raise ApiError(400, "Invalid account format.")
                        return self.json_response(200, application.snapshot(account))
                    raise ApiError(404, "Unknown endpoint.")
                target = (application.assets / path.lstrip("/")).resolve()
                if not target.is_relative_to(application.assets):
                    raise ApiError(403, "Invalid asset path.")
                if not target.is_file():
                    if "." in target.name:
                        raise ApiError(404, "Asset not found.")
                    target = application.assets / "index.html"
                if not target.is_file():
                    raise ApiError(503, "Build the Angular frontend first: npm run build in frontend/.")
                payload = target.read_bytes()
                self.respond(200, payload, mimetypes.guess_type(str(target))[0] or "application/octet-stream")
            except ApiError as error:
                self.json_response(error.status, {"message": error.message})
            except (OSError, ValueError):
                self.json_response(503, {"message": "Local service unavailable."})

        def do_POST(self):
            try:
                self.guard(token=True)
                if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                    raise ApiError(415, "Use application/json.")
                if self.headers.get("Transfer-Encoding"):
                    raise ApiError(400, "Chunked requests are not supported.")
                try:
                    length = int(self.headers.get("Content-Length", "-1"))
                except ValueError:
                    raise ApiError(400, "Invalid content length.") from None
                if not 0 <= length <= 2 * 1024 * 1024:
                    raise ApiError(413, "Request too large or missing content length.")
                self.connection.settimeout(10)
                try:
                    body = json.loads(self.rfile.read(length))
                except (json.JSONDecodeError, UnicodeDecodeError):
                    raise ApiError(400, "Invalid JSON.") from None
                result = application.mutate(urlsplit(self.path).path, body)
                self.json_response(200 if result["ok"] else 422, result)
            except ApiError as error:
                self.json_response(error.status, {"message": error.message})
            except OSError:
                self.json_response(503, {"message": "Local operation failed. Inspect the result and retry using the same references."})

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=ROOT / "data/demo.db")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    application = Application(args.db)
    if not application.database.is_file():
        parser.error("Initialize the database with MiniBank before starting the web app.")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler_for(application))
    print(f"MiniBank web app: http://localhost:{args.port} (local demo only)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
