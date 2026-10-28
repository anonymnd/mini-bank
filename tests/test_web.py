"""HTTP contract and security tests using actual COBOL and temporary databases."""
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import Mock

from web.server import Application, handler_for

ROOT = Path(__file__).resolve().parents[1]


class WebApiTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.database = self.directory / "bank.db"
        subprocess.run([str(ROOT / "build/minibank"), "--db", str(self.database), "init"], capture_output=True, check=True)
        assets = self.directory / "assets"
        assets.mkdir()
        (assets / "index.html").write_text("<!doctype html><title>MiniBank test</title>")
        self.app = Application(self.database, assets=assets)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler_for(self.app))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_server)

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)

    def request(self, path, body=None, *, method=None, headers=None, token=True):
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=20)
        request_headers = {"X-MiniBank-Token": self.app.token} if token else {}
        if body is not None:
            request_headers["Content-Type"] = "application/json"
        request_headers.update(headers or {})
        try:
            connection.request(method or ("POST" if body is not None else "GET"), path,
                               json.dumps(body).encode() if body is not None else None, request_headers)
            response = connection.getresponse()
            payload = response.read()
            data = json.loads(payload) if "application/json" in response.getheader("Content-Type", "") else payload.decode()
            return response.status, data, dict(response.getheaders())
        finally:
            connection.close()

    def test_session_same_origin_static_routes_and_snapshot(self):
        status, data, _ = self.request("/api/session", token=False)
        self.assertEqual(status, 200)
        self.assertEqual(data["token"], self.app.token)
        status, state, _ = self.request("/api/state")
        self.assertEqual(status, 200)
        self.assertEqual(state["summary"]["total_cents"], 1750000)
        self.assertEqual(len(state["accounts"]), 3)
        status, html, headers = self.request("/payments", token=False)
        self.assertEqual(status, 200)
        self.assertIn("MiniBank test", html)
        self.assertEqual(headers["X-Frame-Options"], "DENY")
        self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])
        self.assertNotIn("Access-Control-Allow-Origin", headers)

    def test_denied_token_origin_host_and_cross_site_cannot_post(self):
        body = {"reference": "DENIED", "source": "ACC00001", "destination": "ACC00002", "amount": "1.00"}
        cases = [({}, False), ({"X-MiniBank-Token": "wrong"}, True),
                 ({"Origin": "http://malicious.example"}, True),
                 ({"Host": "malicious.example"}, True),
                 ({"Sec-Fetch-Site": "cross-site"}, True)]
        for headers, token in cases:
            with self.subTest(headers=headers):
                self.assertEqual(self.request("/api/transfers", body, headers=headers, token=token)[0], 403)
        with sqlite3.connect(self.database) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM payments").fetchone()[0], 0)
        self.assertEqual(self.request("/api/session", headers={"Origin": "null"}, token=False)[0], 403)

    def test_transfer_retry_conflict_history_and_reversal(self):
        body = {"reference": "WEB-TEST", "source": "ACC00001", "destination": "ACC00002", "amount": "125.50"}
        status, result, _ = self.request("/api/transfers", body)
        self.assertEqual(status, 200)
        self.assertIn("POSTED", result["output"])
        self.assertIn("ALREADY_POSTED", self.request("/api/transfers", body)[1]["output"])
        self.assertEqual(self.request("/api/transfers", {**body, "amount": "125.51"})[0], 422)
        self.assertEqual(self.request("/api/accounts/ACC00001")[1]["account"]["balance_cents"], 987450)
        self.assertEqual(self.request("/api/reversals", {"reference": "REV-WEB", "original": "WEB-TEST"})[0], 200)
        self.assertEqual(self.request("/api/accounts/ACC00001")[1]["account"]["balance_cents"], 1000000)
        self.assertEqual(self.request("/api/reconcile", {})[0], 200)

    def test_business_rejection_is_distinct_from_bad_request(self):
        body = {"reference": "FUNDS", "source": "ACC00001", "destination": "ACC00002", "amount": "20000.00"}
        self.assertEqual(self.request("/api/transfers", body)[0], 422)
        for changed in [{**body, "reference": "$(touch /tmp/evil)"}, {**body, "amount": 1.5}, {**body, "amount": "1e3"}, {**body, "extra": "value"}]:
            self.assertEqual(self.request("/api/transfers", changed)[0], 400)
        self.assertEqual(self.request("/api/command", {"command": "rm"})[0], 404)
        self.assertEqual(self.request("/api/transfers", ["wrong"])[0], 400)
        self.assertEqual(self.request("/api/accounts/ACC99999")[0], 404)

    def test_import_retained_under_generated_name_and_replayed_safely(self):
        content = f"{'IMPORT-001':<24}ACC00001ACC00002000000010.00\ninvalid\n"
        status, data, _ = self.request("/api/batches", {"name": "../../overwrite.db", "content": content})
        self.assertEqual(status, 422)
        saved = self.directory / "imports" / data["file_name"]
        self.assertEqual(saved.read_text(), content)
        self.assertEqual(saved.parent, self.directory / "imports")
        self.request("/api/batches", {"name": "again.dat", "content": content})
        state = self.request("/api/state")[1]
        self.assertEqual(state["summary"]["posted"], 1)
        self.assertEqual(state["runs"][0]["retried"], 1)
        self.assertNotIn("input_path", state["runs"][0])

    def test_upload_limits_content_type_and_asset_traversal(self):
        self.assertEqual(self.request("/api/batches", {"name": "huge.dat", "content": "X" * (256 * 1024 + 1)})[0], 413)
        self.assertEqual(self.request("/api/batches", {"name": "wrong.dat", "content": "é"})[0], 400)
        self.assertEqual(self.request("/api/reconcile", {}, headers={"Content-Type": "text/plain"})[0], 415)
        self.assertEqual(self.request("/%2e%2e/bank.db")[0], 403)
        self.assertEqual(self.request("/missing.js")[0], 404)

    def test_corrupt_monetary_data_and_unavailable_engine_fail_closed(self):
        with sqlite3.connect(self.database) as db:
            db.execute("UPDATE accounts SET balance_cents=1.5 WHERE id='ACC00001'")
        self.assertEqual(self.request("/api/state")[0], 503)
        self.app.executable = self.directory / "missing-executable"
        self.assertEqual(self.request("/api/reconcile", {})[0], 503)

    def test_disconnected_browser_does_not_send_second_response(self):
        handler_type = handler_for(self.app)
        for error in (BrokenPipeError(), ConnectionResetError()):
            with self.subTest(error=type(error).__name__):
                handler = handler_type.__new__(handler_type)
                handler.send_response = Mock()
                handler.send_header = Mock()
                handler.end_headers = Mock()
                handler.wfile = Mock()
                handler.wfile.write.side_effect = error
                handler.json_response(200, {"ok": True})
                handler.send_response.assert_called_once_with(200)
                self.assertTrue(handler.close_connection)
