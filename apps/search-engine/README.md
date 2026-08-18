# Monolyth Search Engine

Локальный стенд для сравнения поисковых алгоритмов на данных Monolyth.

```bash
cd apps/search-engine
python3 search_engine.py export --email unkstd@mail.ru
python3 search_engine.py seed
python3 search_engine.py baseline
```

После baseline откройте `data/judgments.jsonl` и замените `null` в поле
`relevance` на:

- `0` — документ не подходит;
- `1` — частично подходит;
- `2` — точный результат.

Либо используйте интерактивную разметку первых пяти запросов:

```bash
python3 search_engine.py label --queries 5
```

Команда сохраняет каждую оценку и при повторном запуске продолжает с места
остановки.

Затем запустите:

```bash
python3 search_engine.py evaluate
```

После первой разметки можно построить BM25 и сравнить его с текущим поиском:

```bash
python3 search_engine.py bm25
python3 search_engine.py label --query-ids q02,q03,q04,q05
python3 search_engine.py evaluate --run runs/bm25.jsonl
```

PostgreSQL FTS использует русскую морфологию и OR между нормализованными
термами запроса:

```bash
python3 search_engine.py postgres-fts --email unkstd@mail.ru
python3 search_engine.py evaluate --run runs/postgres-fts.jsonl
```

Гибрид BM25 и PostgreSQL FTS через Reciprocal Rank Fusion:

```bash
python3 search_engine.py hybrid
python3 search_engine.py evaluate --run runs/hybrid-rrf.jsonl
```

Постоянный SQLite-индекс:

```bash
python3 search_engine.py export --email unkstd@mail.ru
python3 search_engine.py sqlite-sync
python3 search_engine.py sqlite-search "история фотографии"
python3 search_engine.py sqlite-run
python3 search_engine.py evaluate --run runs/sqlite-bm25.jsonl
```

`sqlite-sync` идемпотентно добавляет и обновляет изменённые документы и удаляет
из индекса документы, которых больше нет в экспортированном корпусе.

Сгенерированные корпус, разметка и результаты находятся в `data/` и `runs/`
и не попадают в Git.
