import json
import tempfile
import unittest
from pathlib import Path

from search_engine import bm25_run, dcg, extract_text, rrf_run, substring_run
from sqlite_index import delete_document, search_index, sync_index, upsert_document


class SearchEngineTest(unittest.TestCase):
    def test_extracts_text_and_preserves_baseline_order(self):
        raw = json.dumps(
            {
                "type": "doc",
                "content": [
                    {"type": "heading", "content": [{"type": "text", "text": "Поиск"}]},
                    {"type": "paragraph", "content": [{"type": "text", "text": "в Monolyth"}]},
                ],
            }
        )
        self.assertEqual(extract_text(raw), "Поиск\nв Monolyth")

        corpus = [
            {"id": "new", "title": "Поиск", "text": "Monolyth", "created_at": "2"},
            {"id": "old", "title": "Поиск", "text": "Monolyth", "created_at": "1"},
        ]
        run = substring_run(corpus, [{"id": "q01", "query": "поиск"}], 10)
        self.assertEqual([row["document_id"] for row in run], ["new", "old"])
        bm25 = bm25_run(corpus, [{"id": "q01", "query": "Monolyth"}], 10)
        self.assertEqual([row["document_id"] for row in bm25], ["new", "old"])
        hybrid = rrf_run(
            [
                [{"query_id": "q01", "document_id": "new", "rank": 1, "title": "New"}],
                [{"query_id": "q01", "document_id": "new", "rank": 2, "title": "New"}],
            ],
            10,
        )
        self.assertEqual(hybrid[0]["document_id"], "new")
        self.assertGreater(dcg([2, 1]), dcg([1, 2]))

    def test_sqlite_index_sync_update_delete_and_user_isolation(self):
        with tempfile.TemporaryDirectory() as directory:
            index_path = Path(directory) / "index.sqlite3"
            documents = [
                {
                    "user_id": "user-a",
                    "id": "a1",
                    "title": "Алгоритмы",
                    "tags": ["Учёба"],
                    "text": "Блок-схемы",
                    "created_at": "2",
                },
                {
                    "user_id": "user-b",
                    "id": "b1",
                    "title": "Алгоритмы",
                    "tags": [],
                    "text": "Чужой документ",
                    "created_at": "1",
                },
            ]
            self.assertEqual(sync_index(index_path, documents)["inserted"], 2)
            self.assertEqual(sync_index(index_path, documents)["unchanged"], 2)
            self.assertEqual(
                [row["document_id"] for row in search_index(index_path, "блок-схемы", 10, "user-a")],
                ["a1"],
            )
            self.assertEqual(search_index(index_path, "чужой", 10, "user-a"), [])

            documents[0]["text"] = "Графы"
            self.assertEqual(upsert_document(index_path, documents[0]), "updated")
            self.assertEqual(search_index(index_path, "блок-схемы", 10, "user-a"), [])
            self.assertTrue(delete_document(index_path, "user-a", "a1"))
            self.assertEqual(search_index(index_path, "графы", 10, "user-a"), [])
            self.assertEqual(
                [row["document_id"] for row in search_index(index_path, "чужой", 10, "user-b")],
                ["b1"],
            )


if __name__ == "__main__":
    unittest.main()
