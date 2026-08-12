const cwd = process.cwd();
const environment = { ...process.env, ELECTRON_RUN_AS_NODE: "" };
const stagedAppDir = "/tmp/synapse-e2e-desktop";
const profileDir = "/tmp/synapse-e2e-electron-profile";

const build = Bun.spawn(["bun", "--filter", "@synapse/desktop", "build"], {
	cwd,
	env: environment,
	stderr: "inherit",
	stdout: "inherit",
});

if ((await build.exited) !== 0) process.exit(1);

// ChromeDriver is launched by macOS without this workspace's Documents-folder
// entitlement. Keep just the compiled Electron app in /tmp, where the driver
// can read its package manifest and no development instance is touched.
await Bun.$`rm -rf ${stagedAppDir} ${profileDir}`;
await Bun.$`mkdir -p ${stagedAppDir}`;
await Bun.$`cp -R ${cwd}/apps/desktop/out ${stagedAppDir}/out`;
await Bun.write(`${stagedAppDir}/package.json`, JSON.stringify({ main: "./out/main/index.js" }));

const test = Bun.spawn(["bun", "x", "wdio", "tests/e2e/wdio.desktop.conf.ts"], {
	cwd,
	// The Codex harness sets ELECTRON_RUN_AS_NODE for its own Electron tooling.
	// Pass an empty value to both WDIO and ChromeDriver so Electron starts as an
	// application rather than treating Chromium flags as Node arguments.
	env: {
		...environment,
		E2E_DESKTOP_APP_DIR: stagedAppDir,
		E2E_ELECTRON_PROFILE_DIR: profileDir,
	},
	stderr: "inherit",
	stdout: "inherit",
});

process.exitCode = await test.exited;
