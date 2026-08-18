import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// WebdriverIO's Electron service passes this to Electron as `--app`. It must
// be the application directory (with package.json), not the compiled main
// file. Passing `out/main/index.js` makes macOS Electron try to treat the
// module itself as an app and can fail with EPERM while loading it.
const appEntryPoint =
	process.env.E2E_DESKTOP_APP_DIR ?? fileURLToPath(new URL("../../apps/desktop/", import.meta.url));
const userDataDir = process.env.E2E_ELECTRON_PROFILE_DIR ?? "/tmp/synapse-e2e-electron-profile";
const cacheDir = fileURLToPath(new URL("../../.cache/wdio", import.meta.url));
const specs = fileURLToPath(new URL("./desktop/**/*.e2e.ts", import.meta.url));
const require = createRequire(import.meta.url);
const electronBinary = require("electron") as string;

export const config = {
	autoXvfb: true,
	cacheDir,
	capabilities: [
		{
			"browserName": "electron",
			// Electron 43.3 embeds Chromium 150. `@wdio/electron-service` 10.2
			// ships an older electron-to-chromium map, so provide the version until
			// that transitive dependency is refreshed.
			"browserVersion": "150",
			"wdio:electronServiceOptions": {
				// Keep the test instance separate from a running local `electron-vite dev`
				// process; Electron otherwise exits when it cannot acquire the profile lock.
				appArgs: [`--app=${appEntryPoint}`, "--no-sandbox", `--user-data-dir=${userDataDir}`],
				appBinaryPath: electronBinary,
			},
		},
	],
	framework: "mocha",
	logLevel: "warn",
	maxInstances: 1,
	mochaOpts: { timeout: 60_000, ui: "bdd" },
	reporters: ["spec"],
	runner: "local",
	services: ["electron"],
	specs: [specs],
	waitforTimeout: 10_000,
};
