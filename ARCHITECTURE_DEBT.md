# Architecture debt

- **Описание проблемы:** Desktop уже импортирует медиа, аудио и документы в локальное object storage, однако durable sync переносит только JSON Content-payload и не умеет передавать сами бинарные объекты. Такие материалы намеренно остаются `local-only` и не попадают в outbox.
  **Причина:** Object lifecycle требует resumable content-addressed transfer, quota accounting и cleanup guarantees beyond the original JSON prototype.
  **Предлагаемое решение:** Добавить object-manifest operation в тот же durable sync protocol, затем атомарно публиковать объект и ссылочный Content-mutation после подтверждённой загрузки.
  **Приоритет:** High.
