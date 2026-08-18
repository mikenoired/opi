import { join, resolve } from "node:path";

import { Glob } from "bun";

const rules = [
	{ description: "Electron module import", pattern: /from\s+["']electron["']/ },
	{ description: "Electron IPC API", pattern: /\b(?:ipcMain|ipcRenderer|contextBridge)\b/ },
	{ description: "Electron preload global", pattern: /window\.(?:electron|monolythDesktop)\b/ },
	{ description: "Node platform check", pattern: /process\.platform\b/ },
	{ description: "platform identity branch", pattern: /\b(?:isDesktop|isElectron|isWeb)\b/ },
	{ description: "application-relative platform import", pattern: /from\s+["']@\// },
];

const violations: string[] = [];
const workspaceRoot = resolve(import.meta.dir, "..");
for await (const path of new Glob("packages/features/src/**/*.{ts,tsx}").scan(workspaceRoot)) {
	const source = await Bun.file(join(workspaceRoot, path)).text();
	for (const rule of rules) {
		if (rule.pattern.test(source)) violations.push(`${path}: ${rule.description}`);
	}
}

if (violations.length) {
	throw new Error(`Shared UI boundary violations:\n${violations.join("\n")}`);
}
