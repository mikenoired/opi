/* eslint-disable no-console -- command-line smoke-test report */

import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { eq } from "drizzle-orm";

process.env.JWT_SECRET ||= "smoke-test-secret";
process.env.JWT_REFRESH_SECRET ||= "smoke-test-refresh-secret";
process.env.MINIO_ENDPOINT ||= "localhost:9000";
process.env.MINIO_ACCESS_KEY ||= "minioadmin";
process.env.MINIO_SECRET_KEY ||= "minioadmin";

const { api } = await import("../apps/backend/src/server/api/app");
const { db } = await import("../apps/backend/src/server/db");
const { users } = await import("../apps/backend/src/server/db/schema");
const { deleteUserFiles } = await import("../apps/backend/src/storage/minio");

const statisticsPath = join(import.meta.dir, "..", "docs", "performance", "server-smoke.json");
const parseCount = (value: string | undefined, fallback: number, minimum = 1) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
};
const warmupRuns = parseCount(process.env.SMOKE_WARMUP_RUNS, 10, 0);
const runs = parseCount(process.env.SMOKE_RUNS, 30);
const imagePaths = [
	join(import.meta.dir, "..", "test", "assets", "test-image.jpeg"),
	join(import.meta.dir, "..", "test", "assets", "test-image.png"),
	join(import.meta.dir, "..", "test", "assets", "test-image.gif"),
];

type JsonObject = Record<string, unknown>;
type StepSample = { durations: number[]; successCount: number; errorCount: number };
type StepSamples = Record<string, StepSample>;
type SmokeRun = Record<string, unknown>;
type SmokeHistory = Record<string, SmokeRun[]>;

async function gitInfo() {
	const process = Bun.spawn(["git", "log", "-1", "--pretty=%H%x09%s"], { stdout: "pipe", stderr: "ignore" });
	const output = (await new Response(process.stdout).text()).trim();
	if ((await process.exited) !== 0 || !output) throw new Error("Could not read the latest commit");
	const [sha, ...message] = output.split("\t");
	return { sha, message: message.join("\t") };
}

async function request(method: string, path: string, token?: string, body?: JsonObject) {
	const headers = new Headers({ "content-type": "application/json", "x-forwarded-for": "127.0.0.1" });
	if (token) headers.set("x-monolyth-access-token", token);
	const response = await api.fetch(
		new Request(`http://smoke.test${path}`, {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined,
		})
	);
	const data = (await response.json().catch(() => ({}))) as JsonObject;
	if (!response.ok)
		throw new Error(`${method} ${path} failed with ${response.status}: ${JSON.stringify(data)}`);
	return data;
}

function summarize(durations: number[]) {
	const sorted = [...durations].sort((a, b) => a - b);
	const median = (values: number[]) => {
		const middle = values.length / 2;
		return values.length % 2 === 0
			? (values[middle - 1]! + values[middle]!) / 2
			: values[Math.floor(middle)]!;
	};
	const round = (value: number) => Math.round(value * 100) / 100;
	const percentile = (rank: number) =>
		sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * rank) - 1)]!;
	const requestsPerSecond = durations.map((duration) => 1000 / duration);
	const average = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
	const variance = durations.reduce((sum, duration) => sum + (duration - average) ** 2, 0) / durations.length;

	return {
		avgMs: round(average),
		medianMs: round(median(sorted)),
		p95Ms: round(percentile(0.95)),
		p99Ms: round(percentile(0.99)),
		minMs: round(sorted[0]!),
		maxMs: round(sorted[sorted.length - 1]!),
		stdDevMs: round(Math.sqrt(variance)),
		avgReqPerSec: round(requestsPerSecond.reduce((sum, value) => sum + value, 0) / requestsPerSecond.length),
		medianReqPerSec: round(median([...requestsPerSecond].sort((a, b) => a - b))),
	};
}

async function readImage() {
	const path = imagePaths[Math.floor(Math.random() * imagePaths.length)]!;
	const bytes = await Bun.file(path).bytes();
	const type = path.endsWith(".png") ? "image/png" : path.endsWith(".gif") ? "image/gif" : "image/jpeg";
	return {
		name: path.split("/").pop()!,
		type,
		size: bytes.length,
		content: Buffer.from(bytes).toString("base64"),
	};
}

async function runScenario(run: number, samples: StepSamples) {
	const email = `smoke-${Date.now()}-${run}@monolyth.local`;
	const password = "SmokeTest123";
	let token: string | undefined;
	let userId: string | undefined;

	const measure = async <T>(name: string, operation: () => Promise<T>) => {
		const sample = (samples[name] ??= { durations: [], successCount: 0, errorCount: 0 });
		const startedAt = performance.now();
		try {
			const result = await operation();
			sample.successCount += 1;
			sample.durations.push(performance.now() - startedAt);
			return result;
		} catch (error) {
			sample.errorCount += 1;
			sample.durations.push(performance.now() - startedAt);
			throw error;
		}
	};

	let scenarioError: unknown;
	try {
		await measure("api.health", async () => {
			const result = await request("GET", "/health");
			if (result.ok !== true) throw new Error("Health check did not return ok");
		});

		await measure("api.openapi", async () => {
			const result = await request("GET", "/openapi.json");
			if (result.openapi !== "3.1.0") throw new Error("OpenAPI document is unavailable");
		});

		const account = await measure("account.create", async () => {
			const result = await request("POST", "/auth/register", undefined, { email, password });
			token = result.token as string;
			if (!token || !(result.user as JsonObject)?.id)
				throw new Error("Account registration returned no user");
			return result;
		});
		userId = (account.user as JsonObject).id as string;

		const post = await measure("post.create", async () => {
			const result = await request("POST", "/content", token, {
				type: "note",
				title: `Smoke post ${run}`,
				tags: ["smoke"],
				content: JSON.stringify({
					type: "doc",
					content: [{ type: "paragraph", content: [{ type: "text", text: "smoke" }] }],
				}),
			});
			if (!result.id) throw new Error("Post creation returned no id");
			return result;
		});

		await measure("post.search", async () => {
			const result = await request(
				"GET",
				`/content?search=${encodeURIComponent(`Smoke post ${run}`)}`,
				token
			);
			const items = result.items as JsonObject[] | undefined;
			if (!items?.some((item) => item.id === post.id))
				throw new Error("Created post was not found by search");
		});

		await measure("graph.read", async () => {
			const result = await request("GET", "/graph", token);
			const nodes = result.nodes as JsonObject[] | undefined;
			if (!nodes?.some((node) => (node.metadata as JsonObject | null)?.content_id === post.id))
				throw new Error("Content node was not found in graph");
		});

		await measure("preferences.update", async () => {
			const result = await request("PATCH", "/user/preferences", token, { interfaceLanguage: "en" });
			if (result.interfaceLanguage !== "en") throw new Error("Preference update was not persisted");
		});

		await measure("post.update", async () => {
			const result = await request("PATCH", `/content/${post.id}`, token, {
				id: post.id as string,
				title: `Edited smoke post ${run}`,
			});
			if (result.title !== `Edited smoke post ${run}`) throw new Error("Post update was not persisted");
		});

		const image = await readImage();
		const imagePost = await measure("image.create", async () => {
			const result = await request("POST", "/upload", token, {
				files: [image],
				title: `Smoke image ${run}`,
				tags: [],
			});
			const content = (result.contents as JsonObject[] | undefined)?.[0];
			if (!content?.id) throw new Error(`Image upload returned no content: ${JSON.stringify(result)}`);
			return content;
		});

		await measure("post.delete", async () => {
			const result = await request("DELETE", `/content/${post.id}`, token);
			if (result.success !== true) throw new Error("Post deletion failed");
		});

		await measure("image.delete", async () => {
			const result = await request("DELETE", `/content/${imagePost.id}`, token);
			if (result.success !== true) throw new Error("Image deletion failed");
		});

		await measure("account.delete", async () => {
			const result = await request("DELETE", "/user", token);
			if (result.success !== true) throw new Error(`Account deletion failed for ${userId}`);
		});
		token = undefined;
	} catch (error) {
		scenarioError = error;
	} finally {
		if (token && userId) {
			try {
				await request("DELETE", "/user", token);
			} catch (error) {
				await deleteUserFiles(userId);
				await db.delete(users).where(eq(users.id, userId));
				scenarioError ??= error;
			}
		}
	}
	if (scenarioError) throw scenarioError;
}

const cpuStart = process.cpuUsage();
const wallStart = performance.now();
const samples: StepSamples = {};
for (let run = 0; run < warmupRuns; run += 1) {
	await runScenario(run, {});
	console.log(`warmup ${run + 1}/${warmupRuns} complete`);
}
for (let run = 0; run < runs; run += 1) {
	await runScenario(run, samples);
	console.log(`scenario ${run + 1}/${runs} complete`);
}

const steps = Object.fromEntries(
	Object.entries(samples).map(([name, sample]) => [
		name,
		{
			...summarize(sample.durations),
			successCount: sample.successCount,
			errorCount: sample.errorCount,
		},
	])
);
const cpu = process.cpuUsage(cpuStart);
const elapsedMs = performance.now() - wallStart;
const memory = process.memoryUsage();
const system = {
	cpuPercent: Math.round(((cpu.user + cpu.system) / 1000 / elapsedMs) * 100 * 100) / 100,
	rssMb: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
	heapUsedMb: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
};
let history: SmokeHistory = {};
try {
	const saved = JSON.parse(await readFile(statisticsPath, "utf8")) as Record<string, unknown>;
	history = Object.fromEntries(
		Object.entries(saved).map(([savedDate, value]) => [
			savedDate,
			Array.isArray(value) ? value : [value as SmokeRun],
		])
	);
} catch {
	// The first run creates the history file.
}

const date = new Date().toISOString().slice(0, 10);
const run = {
	runAt: new Date().toISOString(),
	commit: await gitInfo(),
	warmupRuns,
	runs,
	steps,
	system,
};
history[date] = [...(history[date] ?? []), run];
await mkdir(dirname(statisticsPath), { recursive: true });
await Bun.write(statisticsPath, `${JSON.stringify(history)}\n`);
console.log(`Saved ${statisticsPath}`);
process.exit(0);
