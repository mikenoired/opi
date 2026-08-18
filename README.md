# Monolyth

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
bun --filter @monolyth/backend db:push
bun --filter @monolyth/backend db:install-tag-merge
bun --filter @monolyth/backend search:backfill
```

### 5. Создайте bucket в MinIO

Откройте [http://localhost:9001](http://localhost:9001), войдите с логином и паролем `minioadmin`, затем создайте bucket `monolyth`.

### 6. Запустите приложение в режиме разработки

```bash
bun --filter @monolyth/backend dev
# в отдельном терминале
bun --filter @monolyth/web dev
# в третьем терминале (Desktop)
bun --filter @monolyth/desktop dev
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

### Проверка Monolyth Sync в Desktop

1. Зарегистрируйте пользователя в Web.
2. Для локального теста включите платный план у существующих пользователей: `bun --filter @monolyth/backend db:set-god-mode`.
3. В Desktop нажмите **Подключить аккаунт Monolyth**. Вход или регистрация выполняются в браузере; после успеха браузер вернёт вас в приложение.
4. Создайте заметку и нажмите **Синхронизировать очередь**.
5. Убедитесь в Web, что материал появился. В Desktop кнопка **Удалить с сервера** сохраняет локальную копию и удаляет только удалённую.

Desktop по умолчанию использует `http://localhost:5173` для Web и `http://localhost:3000/api` для API. В другой среде задайте `MONOLYTH_WEB_URL` и `MONOLYTH_API_URL` в окружении Desktop-процесса.

Токен Desktop хранится только в памяти main-процесса и сбрасывается при закрытии приложения; это сделано для безопасного локального тестирования до добавления системного защищённого хранилища.

## Production-сборка и запуск

Соберите Web-клиент с адресом Backend API:

```bash
VITE_API_URL=https://api.example.com/api bun --filter @monolyth/web build
```

Для полной проверки перед сборкой:

```bash
bun run check
VITE_API_URL=https://api.example.com/api bun --filter @monolyth/web build
```

Запустите Backend отдельно:

```bash
NODE_ENV=production bun --filter @monolyth/backend start
```

Backend API будет доступен на [http://localhost:3000/api](http://localhost:3000/api); `apps/web/dist` нужно раздавать отдельным статическим хостингом. `VITE_API_URL` встраивается Vite во время **сборки**.

Для Desktop также укажите публичные адреса `MONOLYTH_WEB_URL` и `MONOLYTH_API_URL`: они используются для входа через системный браузер и возврата по `monolyth://auth/callback`.

## Остановка

```bash
docker compose down
```

Команда сохраняет данные в Docker volumes. Для следующего запуска достаточно выполнить шаги 3 и 6.
