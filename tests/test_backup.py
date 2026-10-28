"""Exercise backup publication, including failures at the filesystem boundary."""
from pathlib import Path
import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from tools.backup import backup


class BackupPublicationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source.db"
        self.target = self.root / "backup.db"
        with sqlite3.connect(self.source) as db:
            db.execute("CREATE TABLE evidence(value TEXT)")
            db.execute("INSERT INTO evidence VALUES ('complete')")

    def assert_no_staging_files(self):
        self.assertEqual(list(self.root.glob(".minibank-backup-*")), [])

    def test_final_name_is_absent_until_backup_is_complete(self):
        publish = os.link

        def inspect_then_publish(staging, target):
            self.assertFalse(target.exists())
            with sqlite3.connect(staging) as db:
                self.assertEqual(db.execute("SELECT value FROM evidence").fetchall(), [("complete",)])
                self.assertEqual(db.execute("PRAGMA integrity_check").fetchone(), ("ok",))
            publish(staging, target)

        with patch("tools.backup.os.link", side_effect=inspect_then_publish):
            backup(self.source, self.target)
        self.assertTrue(self.target.is_file())
        self.assert_no_staging_files()

    def test_corrupt_source_leaves_no_published_backup(self):
        self.source.write_bytes(b"this is not a SQLite database")
        with self.assertRaises(sqlite3.DatabaseError):
            backup(self.source, self.target)
        self.assertFalse(self.target.exists())
        self.assert_no_staging_files()

    def test_concurrent_destination_is_preserved(self):
        def competing_publication(staging, target):
            target.write_bytes(b"another operator's backup")
            raise FileExistsError("destination appeared concurrently")

        with patch("tools.backup.os.link", side_effect=competing_publication):
            with self.assertRaises(FileExistsError):
                backup(self.source, self.target)
        self.assertEqual(self.target.read_bytes(), b"another operator's backup")
        self.assert_no_staging_files()

    def test_publication_failure_cleans_staging_and_keeps_source(self):
        with patch("tools.backup.os.link", side_effect=PermissionError("publication denied")):
            with self.assertRaises(PermissionError):
                backup(self.source, self.target)
        self.assertFalse(self.target.exists())
        with sqlite3.connect(self.source) as db:
            self.assertEqual(db.execute("SELECT value FROM evidence").fetchone(), ("complete",))
        self.assert_no_staging_files()
