import { Hono } from "hono";

import { api } from "./server/api/app";
import { log } from "./server/lib/logger";

const app = new Hono().route("/api", api);

export const server = Bun.serve({
	port: Number(process.env.PORT ?? 3000),
	fetch: app.fetch,
});

log("info", "server.started", { port: server.port, environment: process.env.NODE_ENV || "development" });
