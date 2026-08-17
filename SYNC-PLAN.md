Нужно переработать текущую архитектуру синхронизации Synapse между Desktop и Web.

ВАЖНО: это НЕ задача просто «добавить WebSocket». Работай с уже существующим кодом и сначала полностью разберись, как сейчас устроена синхронизация, какие сущности синхронизируются, где находится source of truth, как работают локальные изменения, server mutations, загрузка данных и media.

Текущий пользовательский сценарий, который нужно исправить:

- Пользователь удаляет item на Desktop.
- Desktop синхронизирует изменение с сервером.
- На Web изменение становится видно только после reload страницы.
- Нужно сделать так, чтобы подключённые Web/Desktop-клиенты получали изменения практически мгновенно.

Но при этом нам нужна не точечная реализация для DELETE item, а нормальная extensible sync architecture.

## Главная цель

Построить единый Sync Engine / Sync Protocol, который разделяет:

1. mutations — клиент сообщает серверу о намерении изменить данные;
2. persistence — сервер сохраняет изменение и является source of truth;
3. change log / revision — каждое принятое изменение получает упорядоченный cursor/revision;
4. realtime transport — подключённые клиенты получают новые изменения без polling/reload;
5. catch-up sync — после reconnect клиент может получить все изменения, которые он пропустил;
6. local state — изменения применяются к локальному store/database;
7. outbox — локальные изменения Desktop/Web не теряются до подтверждения сервера;
8. conflict handling — параллельные изменения разных клиентов обрабатываются предсказуемо.

Realtime должен быть транспортом доставки изменений, а НЕ самим sync protocol.

Не хочу архитектуру, в которой Supabase Realtime/WebSocket начинает содержать бизнес-логику синхронизации.

## Ключевое архитектурное требование

Архитектура должна быть extensible.

В будущем мы можем добавить новые типы синхронизируемых данных:

- items
- tags
- collections
- relations
- notes
- media metadata
- etc.

Добавление новой сущности НЕ должно требовать переписывать центральный Sync Engine, WebSocket manager, reconnect logic, cursor logic, outbox infrastructure и десятки компонентов.

Не должно быть архитектуры вида:

```ts
if (type === "item") ...
if (type === "tag") ...
if (type === "collection") ...
```

по всему проекту.

Нужна система, где центральная sync-инфраструктура работает с универсальным форматом change/mutation, а конкретная сущность предоставляет свою domain-specific логику.

Примерно концептуально:

```text
Sync Engine
├── connection
├── cursor/revision
├── realtime transport
├── catch-up
├── mutation queue
├── retry
├── acknowledgement
├── ordering
└── conflict protocol

        ↓

Entity adapters / handlers

├── Item
├── Tag
├── Collection
└── ...
```

Это только направление, не требование буквально повторить такую структуру. Сначала проанализируй существующий код и выбери наиболее чистую архитектуру для текущего проекта.

## Revision / Cursor

Нужно ввести надёжный механизм определения позиции клиента в истории изменений.

Например:

```text
revision 100
revision 101
revision 102
revision 103
```

Клиент хранит последний успешно применённый revision.

Если WebSocket работает:

```text
client cursor = 103

server → revision 104
server → revision 105
server → revision 106
```

Если соединение пропало:

```text
client cursor = 103
server current = 106
```

после reconnect клиент должен получить:

```text
104
105
106
```

и только после этого перейти обратно в realtime stream.

Нельзя полагаться на то, что WebSocket доставит абсолютно все события.

Нужно гарантировать корректное восстановление после:

- network disconnect;
- browser tab suspension;
- Electron sleep/wake;
- server restart;
- WebSocket reconnect;
- temporary API failure;
- application restart.

Продумай также, сколько истории change log необходимо хранить и что происходит, если клиент слишком сильно отстал и обычного incremental catch-up уже недостаточно.

## Change format

Нужен единый формат изменения, независимый от конкретной сущности.

Концептуально что-то вроде:

```ts
{
  revision,
  mutationId,
  entity,
  entityId,
  operation,
  payload,
  actor/device information,
}
```

Но не копируй это слепо — сначала изучи существующие модели и выбери подходящий контракт.

Например:

```text
item.created
item.updated
item.deleted
```

должны быть частными случаями общего механизма, а не отдельной realtime-системой.

Для больших payload/media нельзя передавать сам файл через realtime event.

Metadata sync и binary/media sync должны оставаться разными уровнями.

## Mutations / Outbox

Desktop уже работает с локальным состоянием, поэтому локальные изменения должны быть устойчивыми.

Например:

```text
User deletes item
        ↓
local state changes immediately
        ↓
mutation enters outbox
        ↓
server accepts mutation
        ↓
server creates revision
        ↓
mutation acknowledged
        ↓
outbox entry removed
```

При падении приложения или сети mutation не должна исчезнуть.

Продумай:

- idempotency;
- mutationId;
- retries;
- duplicate delivery;
- acknowledgement;
- failed mutations;
- rollback / reconciliation;
- application restart.

Повторная отправка одной mutation не должна случайно выполнить действие дважды.

## Conflict handling

Нужно определить чёткую модель конфликтов.

Например:

```text
Desktop → UPDATE item A
Web     → DELETE item A
```

или:

```text
Desktop → UPDATE title
Web     → UPDATE title
```

Не нужно преждевременно тащить CRDT/OT, если текущей модели Synapse это не требует.

Но нужно явно определить:

- кто является source of truth;
- как сервер упорядочивает mutations;
- как клиент понимает, что его локальное состояние больше не актуально;
- как обрабатываются concurrent mutations;
- когда применяется optimistic update;
- когда нужен rollback/reconciliation.

Предпочтение — максимально простой, deterministic и хорошо тестируемый механизм.

## Web и Desktop

Web и Desktop должны использовать одну концептуальную sync-инфраструктуру.

Не нужно создавать две независимые реализации:

```text
WebSyncManager
DesktopSyncManager
```

с постепенно расходящейся логикой.

Платформенные различия должны быть на уровне transport/storage/provider, если они действительно необходимы.

Например концептуально:

```text
Shared Sync Core
      │
      ├── Web transport/storage
      │
      └── Desktop transport/storage
```

UI вообще не должен знать, каким способом изменение приехало:

```text
REST
WebSocket
local DB
reconnect
optimistic update
```

Для UI существует единый state.

## Важный принцип

Не делай realtime только для Web.

Если Desktop A изменил данные:

```text
Desktop A
    ↓
Server
    ↓
Desktop B
Web C
Mobile D
```

все подключённые реплики должны получать одно и то же canonical change stream.

Таким образом архитектура должна быть рассчитана не на:

```text
Desktop ↔ Web
```

а на:

```text
             Server
           /   |   \
     Desktop Web Mobile
```

## Media

У нас уже была проблема с media при синхронизации.

Не смешивай binary transfer с metadata synchronization.

Например:

```text
item.created
```

может мгновенно приехать через sync protocol.

А media:

```text
media.status = pending
        ↓
download/upload
        ↓
media.status = available
```

должна обрабатываться отдельным media pipeline.

Но при этом metadata о состоянии media тоже должна синхронизироваться через общий sync mechanism.

## Что нужно сделать перед написанием кода

Сначала проведи аудит текущей реализации.

Разберись:

- как сейчас Desktop получает изменения;
- как Web получает изменения;
- какие endpoints участвуют;
- где хранится локальное состояние;
- где выполняются mutations;
- как устроена текущая server-side sync logic;
- как синхронизируются удаление/создание/обновление;
- как устроена media sync;
- какие существующие abstraction'ы можно переиспользовать;
- где сейчас есть coupling;
- какие части архитектуры нужно заменить;
- какие части достаточно адаптировать.

Не начинай сразу с реализации WebSocket.

Сначала сформулируй предлагаемую архитектуру и объясни, почему она лучше текущей.

Если текущая архитектура содержит фундаментальные проблемы — исправляй их, а не строй realtime поверх плохого фундамента.

## Тестирование — обязательная часть задачи

Нужны не только unit-тесты отдельных функций.

Нужны тесты самого sync protocol.

Минимально покрыть:

### Basic

- create;
- update;
- delete;
- multiple clients;
- realtime propagation.

### Ordering

- изменения приходят строго в правильном порядке;
- cursor корректно увеличивается;
- duplicate events безопасны;
- повторная mutation безопасна.

### Reconnect

Сценарий:

```text
connect
→ receive revision 100
→ disconnect
→ server produces 101, 102, 103
→ reconnect
→ catch up 101..103
→ return to realtime
```

Должен быть автоматизированным тестом.

### Failure scenarios

Проверить:

- network failure;
- WebSocket disconnect;
- API timeout;
- server restart;
- client restart;
- duplicated event;
- duplicated mutation;
- out-of-order delivery;
- failed mutation;
- partial sync;
- interrupted media download.

### Multi-client

Минимум:

```text
Desktop A
Desktop B
Web
```

и проверка, что mutation одного клиента корректно появляется у остальных.

### Conflict scenarios

Проверить несколько concurrent mutations и убедиться, что результат deterministic.

### Extensibility

Это особенно важно.

Добавь тест/пример новой сущности, условно:

```text
TestEntity
```

которая подключается к sync infrastructure без изменения центрального Sync Engine.

Если для добавления TestEntity приходится менять core sync protocol — это сигнал, что abstraction плохая.

## Интеграционные / E2E тесты

Помимо unit/integration tests, нужны E2E сценарии, которые проверяют реальное поведение приложения:

```text
Desktop action
    ↓
server
    ↓
Web UI updates without reload
```

И обратное:

```text
Web action
    ↓
server
    ↓
Desktop UI/local state updates
```

Также:

```text
Desktop disconnects
    ↓
changes happen on server
    ↓
Desktop reconnects
    ↓
state becomes correct
```

Тесты должны проверять именно пользовательский результат, а не только вызов какого-нибудь `syncService.handleEvent()`.

## Критерии готовности

Задача считается выполненной, когда:

1. Изменение на Desktop практически мгновенно появляется на Web без reload.
2. Изменение на Web практически мгновенно появляется на Desktop.
3. Несколько подключённых клиентов получают одинаковый canonical state.
4. WebSocket disconnect/reconnect не приводит к потере изменений.
5. Пропущенные изменения восстанавливаются через cursor/revision.
6. Duplicate events/mutations безопасны.
7. Есть deterministic conflict handling.
8. Desktop сохраняет pending mutations до подтверждения сервера.
9. Media synchronization не смешана с realtime metadata transport.
10. Добавление новой syncable entity не требует переписывать центральную sync infrastructure.
11. UI не содержит собственной sync-логики.
12. Web и Desktop используют общую концепцию sync protocol.
13. Есть unit + integration + E2E тесты.
14. Существующие sync-тесты не просто переписаны под новую реализацию, а расширены проверками failure/reconnect/conflict scenarios.
15. После изменений проходят typecheck, lint и все релевантные тесты.

## Качество кода

Приоритет:

```text
correctness
> reliability
> extensibility
> simplicity
> performance
```

Не нужно строить enterprise distributed system ради enterprise distributed system.

Если какая-то сложная технология не нужна Synapse — не используй её.

Особенно не нужно без необходимости внедрять CRDT, Kafka, event sourcing или отдельный message broker.

Но и не допускай простого решения:

```text
setInterval(() => refetch(), 1000)
```

или:

```text
window.location.reload()
```

Realtime должен быть настоящим event-driven механизмом.

## Важное требование по работе с существующим кодом

Не переписывай всё с нуля только ради красивой архитектуры.

Сначала найди существующие abstractions, которые уже хорошо решают часть задачи, и переиспользуй их.

Но если текущая sync implementation концептуально мешает нормальному protocol — смело рефактори её.

Главная цель — получить чистую долгоживущую архитектуру, а не минимальный diff.

После реализации дай итоговый отчёт:

1. что было в старой архитектуре;
2. какие проблемы были обнаружены;
3. какую архитектуру выбрали;
4. как работает mutation → persistence → revision → realtime → client state;
5. как работает reconnect/catch-up;
6. как устроены outbox и idempotency;
7. как решаются конфликты;
8. как добавляется новая syncable entity;
9. какие тесты добавлены;
10. какие команды проверки были запущены и их результат.

Если во время реализации обнаружишь, что текущая архитектура требует более фундаментального изменения — не обходи проблему костылем. Остановись, объясни проблему и предложи корректный вариант архитектуры.
