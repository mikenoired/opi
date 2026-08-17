const backendPort = 3100;
const webPort = 5180;
const baseUrl = `http://127.0.0.1:${webPort}`;
const fixturesDir = `${process.cwd()}/.cache/e2e-fixtures`;

await Bun.$`mkdir -p ${fixturesDir}`;
await Bun.write(`${fixturesDir}/sample.csv`, "E2E CSV,searchable document\nvalue,42\n");
const wav = new Uint8Array(44 + 8000);
const view = new DataView(wav.buffer);
for (const [offset, value] of [
	[0, 0x46464952],
	[8, 0x45564157],
	[12, 0x20746d66],
	[16, 16],
	[20, 0x00010001],
	[24, 8000],
	[28, 8000],
	[32, 0x00080001],
	[36, 0x61746164],
	[40, 8000],
] as const)
	view.setUint32(offset, value, true);
await Bun.write(`${fixturesDir}/sample.wav`, wav);

const backend = Bun.spawn(["bun", "--env-file=apps/backend/.env", "apps/backend/src/index.ts"], {
	cwd: process.cwd(),
	env: {
		...process.env,
		API_RATE_LIMIT_MUTATION: "1000",
		API_RATE_LIMIT_QUERY: "1000",
		CORS_ORIGIN: baseUrl,
		JWT_REFRESH_SECRET: "e2e-refresh-secret",
		JWT_SECRET: "e2e-access-secret",
		NODE_ENV: "test",
		PORT: String(backendPort),
	},
	stderr: "inherit",
	stdout: "inherit",
});

const web = Bun.spawn(["bun", "node_modules/.bin/vite", "--host", "127.0.0.1", "--port", String(webPort)], {
	cwd: `${process.cwd()}/apps/web`,
	env: {
		...process.env,
		BACKEND_URL: `http://127.0.0.1:${backendPort}`,
		VITE_E2E: "1",
		WEB_PORT: String(webPort),
	},
	stderr: "inherit",
	stdout: "inherit",
});

async function waitFor(url: string) {
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		try {
			if ((await fetch(url)).ok) return;
		} catch {
			// The process is still starting.
		}
		await Bun.sleep(200);
	}
	throw new Error(`Timed out waiting for ${url}`);
}

try {
	await waitFor(`http://127.0.0.1:${backendPort}/api/health`);
	await waitFor(`${baseUrl}/api/health`);
	const test = Bun.spawn(["bun", "x", "wdio", "tests/e2e/wdio.web.conf.ts"], {
		cwd: process.cwd(),
		env: { ...process.env, E2E_FIXTURES_DIR: fixturesDir, E2E_WEB_URL: baseUrl },
		stderr: "inherit",
		stdout: "inherit",
	});
	process.exitCode = await test.exited;
} finally {
	// Bun's HTTP server does not always exit on the wrapper's default signal.
	// These are child processes owned exclusively by this runner.
	backend.kill(9);
	web.kill(9);
	await Promise.all([backend.exited, web.exited]);
}
