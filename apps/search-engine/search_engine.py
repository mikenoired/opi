#!/usr/bin/env python3
import argparse
import json
import math
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlite_index import delete_document, search_index, sync_index, tokenize, upsert_document


ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent.parent
DATA_DIR = ROOT / "data"
RUNS_DIR = ROOT / "runs"
CORPUS_PATH = DATA_DIR / "corpus.jsonl"
QUERIES_PATH = DATA_DIR / "queries.jsonl"
JUDGMENTS_PATH = DATA_DIR / "judgments.jsonl"
BASELINE_PATH = RUNS_DIR / "substring-baseline.jsonl"
BM25_PATH = RUNS_DIR / "bm25.jsonl"
POSTGRES_FTS_PATH = RUNS_DIR / "postgres-fts.jsonl"
HYBRID_PATH = RUNS_DIR / "hybrid-rrf.jsonl"
SQLITE_INDEX_PATH = DATA_DIR / "search-index.sqlite3"
SQLITE_BM25_PATH = RUNS_DIR / "sqlite-bm25.jsonl"

SEED_QUERIES = [
    "алгоритмы и блок-схемы",
    "что такое сигнал и данные",
    "история документального кино",
    "история российской фотографии",
    "экономика СССР во время НЭПа",
    "реализм как литературное направление",
    "рациональный метод Рене Декарта",
    "особенности средневековой философии",
    "конспект по культурологии",
    "как подбирать сотрудников в стартап",
    "почему нет формулы для уравнения пятой степени",
    "как давать негативную обратную связь",
    "почему бетон используют в брутализме",
    "сайты для быстрого исследования",
    "обучение Python SQL и LLM",
    "как работает event loop в JavaScript",
    "разница null и undefined",
    "цветовое пространство OKLCH в CSS",
    "полезные настройки Obsidian",
    "что посмотреть вечером",
    "проект Monolyth",
    "проект Gramax",
    "проект dev-vault",
    "планы по работе",
    "концепция проекта",
    "научная деятельность",
    "коммуникация и социальные навыки",
    "исследование искусственного интеллекта",
    "гайд по большим языковым моделям",
    "инструменты для поиска научных источников",
]

EXPORT_SQL = r"""
select json_build_object(
  'id', c.id,
  'user_id', c.user_id,
  'title', c.title,
  'tags', coalesce(array_agg(distinct t.title) filter (where t.title is not null), '{}'),
  'content', c.content,
  'created_at', c.created_at
)
from content c
join users u on u.id = c.user_id
left join content_tags ct on ct.content_id = c.id
left join tags t on t.id = ct.tag_id
where u.email = :'email'
group by c.id
order by c.created_at desc, c.id desc;
"""

POSTGRES_FTS_SQL = r"""
with documents as (
  select
    c.id,
    c.title,
    c.created_at,
    setweight(to_tsvector('russian', coalesce(c.title, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(tag_titles.value, '')), 'B') ||
    setweight(to_tsvector('russian', c.content), 'D') as search_vector
  from content c
  join users u on u.id = c.user_id
  left join lateral (
    select string_agg(t.title, ' ') as value
    from content_tags ct
    join tags t on t.id = ct.tag_id
    where ct.content_id = c.id
  ) tag_titles on true
  where u.email = :'email'
), query as (
  select replace(
    plainto_tsquery('russian', :'query')::text,
    ' & ',
    ' | '
  )::tsquery as value
)
select json_build_object(
  'id', documents.id,
  'title', documents.title,
  'score', ts_rank_cd(documents.search_vector, query.value)
)
from documents, query
where documents.search_vector @@ query.value
order by ts_rank_cd(documents.search_vector, query.value) desc, documents.created_at desc
limit :result_limit;
"""


def read_jsonl(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        raise SystemExit("Файл не найден: {}".format(path))
    with path.open(encoding="utf-8") as source:
        return [json.loads(line) for line in source if line.strip()]


def write_jsonl(path: Path, rows: Iterable[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as target:
        for row in rows:
            target.write(json.dumps(row, ensure_ascii=False) + "\n")


def extract_text(raw: str) -> str:
    try:
        value = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return raw

    parts: List[str] = []

    def walk(node: Any) -> None:
        if isinstance(node, list):
            for item in node:
                walk(item)
            return
        if not isinstance(node, dict):
            return
        if isinstance(node.get("text"), str):
            parts.append(node["text"])
        if isinstance(node.get("rawText"), str):
            parts.append(node["rawText"])
        if "content" in node:
            walk(node["content"])

    walk(value)
    return "\n".join(parts) or raw


def export_corpus(email: str, output: Path) -> None:
    command = [
        "docker",
        "compose",
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        "postgres",
        "-d",
        "monolyth",
        "-At",
        "--set=email={}".format(email),
    ]
    result = subprocess.run(
        command,
        cwd=REPO_ROOT,
        input=EXPORT_SQL,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise SystemExit(result.stderr.strip() or "Не удалось экспортировать корпус")

    rows = []
    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        rows.append(
            {
                "id": row["id"],
                "user_id": row["user_id"],
                "title": row.get("title") or "",
                "tags": row.get("tags") or [],
                "text": extract_text(row.get("content") or ""),
                "created_at": row["created_at"],
            }
        )
    write_jsonl(output, rows)
    print("Экспортировано документов: {} -> {}".format(len(rows), output))


def seed_queries(output: Path) -> None:
    rows = [
        {"id": "q{:02d}".format(index), "query": query}
        for index, query in enumerate(SEED_QUERIES, 1)
    ]
    write_jsonl(output, rows)
    print("Подготовлено запросов: {} -> {}".format(len(rows), output))


def substring_run(
    corpus: List[Dict[str, Any]], queries: List[Dict[str, Any]], limit: int
) -> List[Dict[str, Any]]:
    rows = []
    for query in queries:
        needle = query["query"].strip().casefold()
        matches = [
            document
            for document in corpus
            if needle in "{}\n{}".format(document["title"], document["text"]).casefold()
        ][:limit]
        for rank, document in enumerate(matches, 1):
            rows.append(
                {
                    "query_id": query["id"],
                    "document_id": document["id"],
                    "rank": rank,
                    "title": document["title"],
                }
            )
    return rows


def bm25_run(
    corpus: List[Dict[str, Any]], queries: List[Dict[str, Any]], limit: int
) -> List[Dict[str, Any]]:
    tokenized_documents = []
    document_frequency: Counter = Counter()
    for document in corpus:
        searchable = "{}\n{}\n{}".format(
            document["title"], " ".join(document.get("tags") or []), document["text"]
        )
        frequencies = Counter(tokenize(searchable))
        tokenized_documents.append((document, frequencies, sum(frequencies.values())))
        document_frequency.update(frequencies.keys())

    document_count = len(tokenized_documents)
    average_length = max(
        (
            sum(length for _, _, length in tokenized_documents) / document_count
            if document_count
            else 0
        ),
        1,
    )
    k1 = 1.5
    b = 0.75
    rows = []
    for query in queries:
        scored = []
        for document, frequencies, length in tokenized_documents:
            score = 0.0
            for token in set(tokenize(query["query"])):
                frequency = frequencies[token]
                if not frequency:
                    continue
                frequency_in_documents = document_frequency[token]
                inverse_document_frequency = math.log(
                    1 + (document_count - frequency_in_documents + 0.5) / (frequency_in_documents + 0.5)
                )
                normalization = frequency + k1 * (
                    1 - b + b * length / average_length
                )
                score += inverse_document_frequency * frequency * (k1 + 1) / normalization
            if score:
                scored.append((score, document["created_at"], document))
        scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
        for rank, (score, _, document) in enumerate(scored[:limit], 1):
            rows.append(
                {
                    "query_id": query["id"],
                    "document_id": document["id"],
                    "rank": rank,
                    "title": document["title"],
                    "score": round(score, 6),
                }
            )
    return rows


def pool_candidates(
    corpus: List[Dict[str, Any]], queries: List[Dict[str, Any]], limit: int
) -> List[Tuple[Dict[str, Any], Dict[str, Any]]]:
    pooled = []
    for query in queries:
        tokens = tokenize(query["query"])
        scored = []
        for document in corpus:
            title = document["title"].casefold()
            text = document["text"].casefold()
            score = sum(3 for token in tokens if token in title)
            score += sum(1 for token in tokens if token in text)
            if score:
                scored.append((score, document["created_at"], document))
        scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
        for _, _, document in scored[:limit]:
            pooled.append((query, document))
    return pooled


def build_baseline(corpus_path: Path, queries_path: Path, limit: int) -> None:
    corpus = read_jsonl(corpus_path)
    queries = read_jsonl(queries_path)
    run = substring_run(corpus, queries, limit)
    write_jsonl(BASELINE_PATH, run)

    previous = {}
    if JUDGMENTS_PATH.exists():
        previous = {
            (row["query_id"], row["document_id"]): row.get("relevance")
            for row in read_jsonl(JUDGMENTS_PATH)
        }

    judgments = []
    for query, document in pool_candidates(corpus, queries, limit):
        key = (query["id"], document["id"])
        judgments.append(
            {
                "query_id": query["id"],
                "query": query["query"],
                "document_id": document["id"],
                "title": document["title"],
                "preview": document["text"].replace("\n", " ")[:240],
                "relevance": previous.get(key),
            }
        )
    write_jsonl(JUDGMENTS_PATH, judgments)

    matched_queries = len({row["query_id"] for row in run})
    print("Baseline: {}/{} запросов имеют результаты".format(matched_queries, len(queries)))
    print("Результаты: {}".format(BASELINE_PATH))
    print("Разметка: {} строк -> {}".format(len(judgments), JUDGMENTS_PATH))


def build_bm25(corpus_path: Path, queries_path: Path, limit: int) -> None:
    corpus = read_jsonl(corpus_path)
    queries = read_jsonl(queries_path)
    run = bm25_run(corpus, queries, limit)
    write_jsonl(BM25_PATH, run)
    added = merge_run_into_judgments(run, corpus, queries)
    print("BM25: {} результатов -> {}".format(len(run), BM25_PATH))
    print("Новых кандидатов для разметки: {}".format(added))


def merge_run_into_judgments(
    run: List[Dict[str, Any]], corpus: List[Dict[str, Any]], queries: List[Dict[str, Any]]
) -> int:
    judgments = read_jsonl(JUDGMENTS_PATH)
    existing = {(row["query_id"], row["document_id"]) for row in judgments}
    documents = {row["id"]: row for row in corpus}
    query_by_id = {row["id"]: row["query"] for row in queries}
    added = 0
    for result in run:
        key = (result["query_id"], result["document_id"])
        if key in existing:
            continue
        document = documents[result["document_id"]]
        judgments.append(
            {
                "query_id": result["query_id"],
                "query": query_by_id[result["query_id"]],
                "document_id": document["id"],
                "title": document["title"],
                "preview": document["text"].replace("\n", " ")[:240],
                "relevance": None,
            }
        )
        existing.add(key)
        added += 1
    write_jsonl(JUDGMENTS_PATH, judgments)
    return added


def build_postgres_fts(email: str, corpus_path: Path, queries_path: Path, limit: int) -> None:
    corpus = read_jsonl(corpus_path)
    queries = read_jsonl(queries_path)
    run = []
    for query in queries:
        command = [
            "docker",
            "compose",
            "exec",
            "-T",
            "postgres",
            "psql",
            "-U",
            "postgres",
            "-d",
            "monolyth",
            "-At",
            "--set=email={}".format(email),
            "--set=query={}".format(query["query"]),
            "--set=result_limit={}".format(limit),
        ]
        result = subprocess.run(
            command,
            cwd=REPO_ROOT,
            input=POSTGRES_FTS_SQL,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise SystemExit(result.stderr.strip() or "PostgreSQL FTS завершился с ошибкой")
        for rank, line in enumerate((line for line in result.stdout.splitlines() if line.strip()), 1):
            document = json.loads(line)
            run.append(
                {
                    "query_id": query["id"],
                    "document_id": document["id"],
                    "rank": rank,
                    "title": document.get("title") or "",
                    "score": document["score"],
                }
            )

    write_jsonl(POSTGRES_FTS_PATH, run)
    added = merge_run_into_judgments(run, corpus, queries)
    print("PostgreSQL FTS: {} результатов -> {}".format(len(run), POSTGRES_FTS_PATH))
    print("Новых кандидатов для разметки: {}".format(added))


def rrf_run(runs: List[List[Dict[str, Any]]], limit: int, rank_constant: int = 60) -> List[Dict[str, Any]]:
    scores: Dict[Tuple[str, str], float] = defaultdict(float)
    documents: Dict[Tuple[str, str], Dict[str, Any]] = {}
    best_ranks: Dict[Tuple[str, str], int] = {}
    for run in runs:
        for row in run:
            key = (row["query_id"], row["document_id"])
            scores[key] += 1 / (rank_constant + row["rank"])
            documents[key] = row
            best_ranks[key] = min(best_ranks.get(key, row["rank"]), row["rank"])

    by_query: Dict[str, List[Tuple[Tuple[str, str], float]]] = defaultdict(list)
    for key, score in scores.items():
        by_query[key[0]].append((key, score))

    result = []
    for query_id, candidates in by_query.items():
        candidates.sort(key=lambda item: (-item[1], best_ranks[item[0]], item[0][1]))
        for rank, (key, score) in enumerate(candidates[:limit], 1):
            row = documents[key]
            result.append(
                {
                    "query_id": query_id,
                    "document_id": key[1],
                    "rank": rank,
                    "title": row["title"],
                    "score": round(score, 8),
                }
            )
    return result


def build_hybrid(bm25_path: Path, postgres_fts_path: Path, limit: int) -> None:
    run = rrf_run([read_jsonl(bm25_path), read_jsonl(postgres_fts_path)], limit)
    write_jsonl(HYBRID_PATH, run)
    print("Hybrid RRF: {} результатов -> {}".format(len(run), HYBRID_PATH))


def sync_sqlite_index(corpus_path: Path, index_path: Path) -> None:
    stats = sync_index(index_path, read_jsonl(corpus_path))
    print(
        "SQLite index: inserted={inserted} updated={updated} "
        "unchanged={unchanged} deleted={deleted} -> {path}".format(
            path=index_path, **stats
        )
    )


def search_sqlite_index(
    index_path: Path, query: str, limit: int, user_id: Optional[str], json_output: bool
) -> None:
    try:
        results = search_index(index_path, query, limit, user_id)
    except ValueError as error:
        raise SystemExit(str(error))
    if json_output:
        print(json.dumps(results, ensure_ascii=False))
        return
    for rank, result in enumerate(results, 1):
        print("{}\t{:.6f}\t{}\t{}".format(rank, result["score"], result["document_id"], result["title"]))


def build_sqlite_run(
    index_path: Path,
    queries_path: Path,
    limit: int,
    user_id: Optional[str],
) -> None:
    run = []
    try:
        for query in read_jsonl(queries_path):
            for rank, result in enumerate(
                search_index(index_path, query["query"], limit, user_id), 1
            ):
                run.append(
                    {
                        "query_id": query["id"],
                        "document_id": result["document_id"],
                        "rank": rank,
                        "title": result["title"],
                        "score": result["score"],
                    }
                )
    except ValueError as error:
        raise SystemExit(str(error))
    write_jsonl(SQLITE_BM25_PATH, run)
    print("SQLite BM25: {} результатов -> {}".format(len(run), SQLITE_BM25_PATH))


def delete_from_sqlite_index(index_path: Path, user_id: str, document_id: str) -> None:
    deleted = delete_document(index_path, user_id, document_id)
    print("deleted={}".format(str(deleted).lower()))


def upsert_into_sqlite_index(index_path: Path) -> None:
    payload = json.load(sys.stdin)
    document = {
        "id": payload["id"],
        "user_id": payload["user_id"],
        "title": payload.get("title") or "",
        "tags": payload.get("tags") or [],
        "text": extract_text(payload.get("content") or payload.get("text") or ""),
        "created_at": payload["created_at"],
    }
    print(upsert_document(index_path, document))


def dcg(grades: List[int]) -> float:
    return sum((2**grade - 1) / math.log2(rank + 1) for rank, grade in enumerate(grades, 1))


def label_judgments(
    judgments_path: Path, query_limit: int, requested_query_ids: Optional[str]
) -> None:
    judgments = read_jsonl(judgments_path)
    pending_query_ids = []
    for row in judgments:
        if row.get("relevance") in (0, 1, 2):
            continue
        if row["query_id"] not in pending_query_ids:
            pending_query_ids.append(row["query_id"])
    selected = (
        {query_id.strip() for query_id in requested_query_ids.split(",") if query_id.strip()}
        if requested_query_ids
        else set(pending_query_ids[:query_limit])
    )
    if not selected:
        print("Все документы уже размечены")
        return

    for row in judgments:
        if row["query_id"] not in selected or row.get("relevance") in (0, 1, 2):
            continue
        print("\nЗапрос: {}".format(row["query"]))
        print("Документ: {}".format(row["title"]))
        print(row["preview"])
        while True:
            answer = input("Оценка [0/1/2, s — пропустить, q — выйти]: ").strip().lower()
            if answer == "q":
                return
            if answer == "s":
                break
            if answer in ("0", "1", "2"):
                row["relevance"] = int(answer)
                write_jsonl(judgments_path, judgments)
                break


def evaluate(run_path: Path, judgments_path: Path, limit: int) -> None:
    run = read_jsonl(run_path)
    judgments = read_jsonl(judgments_path)
    rows_by_query: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in judgments:
        rows_by_query[row["query_id"]].append(row)
    complete_query_ids = {
        query_id
        for query_id, rows in rows_by_query.items()
        if all(row.get("relevance") in (0, 1, 2) for row in rows)
    }
    if not complete_query_ids:
        pending = sum(1 for row in judgments if row.get("relevance") not in (0, 1, 2))
        print("Нет полностью размеченных запросов; осталось оценок: {}".format(pending))
        print("Запустите: python3 search_engine.py label --queries 5")
        return

    judgments = [row for row in judgments if row["query_id"] in complete_query_ids]

    grades = {
        (row["query_id"], row["document_id"]): int(row["relevance"])
        for row in judgments
    }
    relevant_by_query: Dict[str, List[int]] = defaultdict(list)
    for row in judgments:
        relevant_by_query[row["query_id"]].append(int(row["relevance"]))

    run_by_query: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in run:
        run_by_query[row["query_id"]].append(row)

    mrr_values = []
    recall_values = []
    ndcg_values = []
    skipped_queries = 0
    for query_id, judged_grades in relevant_by_query.items():
        ranked = run_by_query.get(query_id, [])[:limit]
        ranked_grades = [grades.get((query_id, row["document_id"]), 0) for row in ranked]
        relevant_total = sum(1 for grade in judged_grades if grade > 0)
        if not relevant_total:
            skipped_queries += 1
            continue
        first_relevant = next((rank for rank, grade in enumerate(ranked_grades, 1) if grade > 0), None)
        mrr_values.append(1 / first_relevant if first_relevant else 0)
        recall_values.append(sum(1 for grade in ranked_grades if grade > 0) / relevant_total)
        ideal = sorted(judged_grades, reverse=True)[:limit]
        ideal_dcg = dcg(ideal)
        ndcg_values.append(dcg(ranked_grades) / ideal_dcg)

    count = len(mrr_values)
    if not count:
        print("В размеченных запросах нет релевантных документов")
        return
    print("queries={}".format(count))
    print("pending_queries={}".format(len(rows_by_query) - len(complete_query_ids)))
    print("skipped_queries={}".format(skipped_queries))
    print("MRR@{}={:.4f}".format(limit, sum(mrr_values) / count))
    print("Recall@{}={:.4f}".format(limit, sum(recall_values) / count))
    print("nDCG@{}={:.4f}".format(limit, sum(ndcg_values) / count))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Monolyth search benchmark")
    subparsers = parser.add_subparsers(dest="command", required=True)

    export_parser = subparsers.add_parser("export")
    export_parser.add_argument("--email", required=True)
    export_parser.add_argument("--output", type=Path, default=CORPUS_PATH)

    seed_parser = subparsers.add_parser("seed")
    seed_parser.add_argument("--output", type=Path, default=QUERIES_PATH)

    baseline_parser = subparsers.add_parser("baseline")
    baseline_parser.add_argument("--corpus", type=Path, default=CORPUS_PATH)
    baseline_parser.add_argument("--queries", type=Path, default=QUERIES_PATH)
    baseline_parser.add_argument("--limit", type=int, default=10)

    bm25_parser = subparsers.add_parser("bm25")
    bm25_parser.add_argument("--corpus", type=Path, default=CORPUS_PATH)
    bm25_parser.add_argument("--queries", type=Path, default=QUERIES_PATH)
    bm25_parser.add_argument("--limit", type=int, default=10)

    postgres_fts_parser = subparsers.add_parser("postgres-fts")
    postgres_fts_parser.add_argument("--email", required=True)
    postgres_fts_parser.add_argument("--corpus", type=Path, default=CORPUS_PATH)
    postgres_fts_parser.add_argument("--queries", type=Path, default=QUERIES_PATH)
    postgres_fts_parser.add_argument("--limit", type=int, default=10)

    hybrid_parser = subparsers.add_parser("hybrid")
    hybrid_parser.add_argument("--bm25", type=Path, default=BM25_PATH)
    hybrid_parser.add_argument("--postgres-fts", type=Path, default=POSTGRES_FTS_PATH)
    hybrid_parser.add_argument("--limit", type=int, default=10)

    sqlite_sync_parser = subparsers.add_parser("sqlite-sync")
    sqlite_sync_parser.add_argument("--corpus", type=Path, default=CORPUS_PATH)
    sqlite_sync_parser.add_argument("--index", type=Path, default=SQLITE_INDEX_PATH)

    sqlite_search_parser = subparsers.add_parser("sqlite-search")
    sqlite_search_parser.add_argument("query")
    sqlite_search_parser.add_argument("--index", type=Path, default=SQLITE_INDEX_PATH)
    sqlite_search_parser.add_argument("--user-id")
    sqlite_search_parser.add_argument("--limit", type=int, default=10)
    sqlite_search_parser.add_argument("--json", action="store_true")

    sqlite_run_parser = subparsers.add_parser("sqlite-run")
    sqlite_run_parser.add_argument("--index", type=Path, default=SQLITE_INDEX_PATH)
    sqlite_run_parser.add_argument("--queries", type=Path, default=QUERIES_PATH)
    sqlite_run_parser.add_argument("--user-id")
    sqlite_run_parser.add_argument("--limit", type=int, default=10)

    sqlite_delete_parser = subparsers.add_parser("sqlite-delete")
    sqlite_delete_parser.add_argument("--index", type=Path, default=SQLITE_INDEX_PATH)
    sqlite_delete_parser.add_argument("--user-id", required=True)
    sqlite_delete_parser.add_argument("--document-id", required=True)

    sqlite_upsert_parser = subparsers.add_parser("sqlite-upsert")
    sqlite_upsert_parser.add_argument("--index", type=Path, default=SQLITE_INDEX_PATH)

    label_parser = subparsers.add_parser("label")
    label_parser.add_argument("--judgments", type=Path, default=JUDGMENTS_PATH)
    label_parser.add_argument("--queries", type=int, default=5)
    label_parser.add_argument("--query-ids")

    evaluate_parser = subparsers.add_parser("evaluate")
    evaluate_parser.add_argument("--run", type=Path, default=BASELINE_PATH)
    evaluate_parser.add_argument("--judgments", type=Path, default=JUDGMENTS_PATH)
    evaluate_parser.add_argument("--limit", type=int, default=10)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.command == "export":
        export_corpus(args.email, args.output)
    elif args.command == "seed":
        seed_queries(args.output)
    elif args.command == "baseline":
        build_baseline(args.corpus, args.queries, args.limit)
    elif args.command == "bm25":
        build_bm25(args.corpus, args.queries, args.limit)
    elif args.command == "postgres-fts":
        build_postgres_fts(args.email, args.corpus, args.queries, args.limit)
    elif args.command == "hybrid":
        build_hybrid(args.bm25, args.postgres_fts, args.limit)
    elif args.command == "sqlite-sync":
        sync_sqlite_index(args.corpus, args.index)
    elif args.command == "sqlite-search":
        search_sqlite_index(args.index, args.query, args.limit, args.user_id, args.json)
    elif args.command == "sqlite-run":
        build_sqlite_run(args.index, args.queries, args.limit, args.user_id)
    elif args.command == "sqlite-delete":
        delete_from_sqlite_index(args.index, args.user_id, args.document_id)
    elif args.command == "sqlite-upsert":
        upsert_into_sqlite_index(args.index)
    elif args.command == "label":
        label_judgments(args.judgments, args.queries, args.query_ids)
    else:
        evaluate(args.run, args.judgments, args.limit)


if __name__ == "__main__":
    main()
