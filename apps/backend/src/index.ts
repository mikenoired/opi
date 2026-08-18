import { Hono } from "hono";

import { api } from "./server/api/app";
import { createContext } from "./server/context";
import { log } from "./server/lib/logger";
import { PostgresSyncHintTransport, SyncNotifierLifecycle } from "./server/services/sync-notifier.service";

const app = new Hono().route("/api", api);

export const server = Bun.serve({
	port: Number(process.env.PORT ?? 3000),
	fetch: app.fetch,
});

const notifierLifecycle = new SyncNotifierLifecycle(new PostgresSyncHintTransport(await createContext({})));
await notifierLifecycle.start();
process.once("SIGTERM", () => void notifierLifecycle.stop());
process.once("SIGINT", () => void notifierLifecycle.stop());

log("info", "server.started", { port: server.port, environment: process.env.NODE_ENV || "development" });
