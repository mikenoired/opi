# Synapse

_Private media/data manager w/ AI autosorting & context asking_

## Локальный запуск

### 1. Установите зависимости

Понадобятся [Bun 1.3.14+](https://bun.sh/) и Docker с Compose.

```bash
bun install
```

Для загрузки аудио и видео также нужен `ffmpeg`:

```bash
brew install ffmpeg
```

### 2. Настройте окружение

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env.local
```

Заполните обязательные секреты только в `apps/backend/.env`:

```env
JWT_SECRET=<случайная строка>
JWT_REFRESH_SECRET=<другая случайная строка>
```

Сгенерировать значения можно командой `openssl rand -base64 32` — отдельно для каждого секрета. Web `.env.local` содержит только публичный адрес API и не должен содержать секреты, пароли БД или ключи AI.

### 3. Запустите инфраструктуру

```bash
docker compose up -d
docker compose ps
```

Будут запущены PostgreSQL, Redis и MinIO. В `docker compose ps` сервисы должны быть в состоянии `Up` или `healthy`.

### 4. Создайте таблицы

```bash
bun --filter @synapse/backend db:push
bun --filter @synapse/backend db:install-tag-merge
bun --filter @synapse/backend search:backfill
```

### 5. Создайте bucket в MinIO

Откройте [http://localhost:9001](http://localhost:9001), войдите с логином и паролем `minioadmin`, затем создайте bucket `synapse`.

### 6. Запустите приложение в режиме разработки

```bash
bun --filter @synapse/backend dev
# в отдельном терминале
bun --filter @synapse/web dev
# в третьем терминале (Desktop)
bun --filter @synapse/desktop dev
```

Приложения запускаются отдельными процессами:

- Vite-клиент: [http://localhost:5173](http://localhost:5173)
- Bun + Hono API: [http://localhost:3000](http://localhost:3000)
- Electron Desktop: отдельное нативное окно

Vite автоматически проксирует `/api` на Backend. Если Web и Backend должны работать с разных origin, задайте:

```env
VITE_API_URL=http://localhost:3000/api
CORS_ORIGIN=http://localhost:5173
```

API-документация Scalar доступна на [http://localhost:3000/api/docs](http://localhost:3000/api/docs), а спецификация OpenAPI — на [http://localhost:3000/api/openapi.json](http://localhost:3000/api/openapi.json).

### Проверка Synapse Sync в Desktop

1. Зарегистрируйте пользователя в Web.
2. Для локального теста включите платный план у существующих пользователей: `bun --filter @synapse/backend db:set-god-mode`.
3. В Desktop создайте заметку, в разделе **Synapse Sync** укажите `http://localhost:3000/api`, войдите тем же аккаунтом и нажмите **Синхронизировать очередь**.
4. Убедитесь в Web, что материал появился. В Desktop кнопка **Удалить с сервера** сохраняет локальную копию и удаляет только удалённую.

Токен Desktop хранится только в памяти main-процесса и сбрасывается при закрытии приложения; это сделано для безопасного локального тестирования до добавления системного защищённого хранилища.

## Production-сборка и запуск

Соберите Web-клиент с адресом Backend API:

```bash
VITE_API_URL=https://api.example.com/api bun --filter @synapse/web build
```

Для полной проверки перед сборкой:

```bash
bun run check
VITE_API_URL=https://api.example.com/api bun --filter @synapse/web build
```

Запустите Backend отдельно:

```bash
NODE_ENV=production bun --filter @synapse/backend start
```

Backend API будет доступен на [http://localhost:3000/api](http://localhost:3000/api); `apps/web/dist` нужно раздавать отдельным статическим хостингом. `VITE_API_URL` встраивается Vite во время **сборки**.

## Остановка

```bash
docker compose down
```

Команда сохраняет данные в Docker volumes. Для следующего запуска достаточно выполнить шаги 3 и 6.
