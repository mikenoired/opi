export const config = {
	autoXvfb: true,
	baseUrl: process.env.E2E_WEB_URL ?? "http://127.0.0.1:5173",
	cacheDir: ".cache/wdio",
	capabilities: [
		{
			"browserName": "chrome",
			"goog:chromeOptions": {
				args: ["--headless=new", "--window-size=1440,1000"],
			},
		},
	],
	framework: "mocha",
	logLevel: "warn",
	maxInstances: 1,
	mochaOpts: { timeout: 300_000, ui: "bdd" },
	reporters: ["spec"],
	runner: "local",
	specs: process.env.E2E_SPEC ? [`./${process.env.E2E_SPEC}`] : ["./web/**/*.e2e.ts"],
	waitforTimeout: 10_000,
};
