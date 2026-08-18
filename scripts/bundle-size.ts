/* eslint-disable no-console -- command-line bundle report */

import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const isServer = process.argv.includes("--server");
const buildDirectory = isServer
	? join(import.meta.dir, "..", "apps", "web", ".server-build")
	: join(import.meta.dir, "..", "apps", "web", "dist");

async function filesIn(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const path = join(directory, entry.name);
			return entry.isDirectory() ? filesIn(path) : [path];
		})
	);

	return files.flat();
}

function formatBytes(bytes: number) {
	return `${(bytes / 1024).toFixed(1)} KiB`;
}

try {
	const files = await filesIn(buildDirectory);
	const assets = await Promise.all(
		files
			.filter((file) => file.endsWith(".js") || file.endsWith(".css"))
			.map(async (file) => ({
				file,
				size: (await stat(file)).size,
			}))
	);
	const staticAssets = assets;
	const total = staticAssets.reduce((sum, asset) => sum + asset.size, 0);

	console.log(
		`\n${isServer ? "Server" : "Final client"} bundle size (${relative(join(buildDirectory, ".."), buildDirectory)}):`
	);
	if (!isServer) {
		console.log(
			`  JavaScript: ${formatBytes(staticAssets.filter((asset) => asset.file.endsWith(".js")).reduce((sum, asset) => sum + asset.size, 0))}`
		);
		console.log(
			`  CSS:        ${formatBytes(staticAssets.filter((asset) => asset.file.endsWith(".css")).reduce((sum, asset) => sum + asset.size, 0))}`
		);
	}
	console.log(`  Total:      ${formatBytes(total)}`);

	for (const asset of [...staticAssets].sort((a, b) => b.size - a.size).slice(0, 10)) {
		console.log(`  ${formatBytes(asset.size).padStart(10)}  ${relative(buildDirectory, asset.file)}`);
	}
} catch {
	console.error(
		isServer
			? "Server bundle was not found. Run `bun run build:server:size` first."
			: "Bundle output was not found. Run `bun --filter @monolyth/web run build` first."
	);
	process.exit(1);
}
