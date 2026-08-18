import { defineConfig } from "electron-vite";

export default defineConfig({
	// Workspace packages export TypeScript source. They must be bundled into the
	// Electron main process: externalising them makes Electron resolve their
	// extensionless source imports at runtime, which Node ESM rejects.
	main: {
		build: {
			externalizeDeps: {
				exclude: ["@monolyth/api", "@monolyth/core", "@monolyth/shared", "@monolyth/sync", "music-metadata"],
			},
		},
	},
	preload: {
		build: {
			rollupOptions: {
				external: ["electron"],
				output: { entryFileNames: "[name].cjs", format: "cjs" },
			},
		},
	},
	renderer: {
		server: {
			port: 5174,
			strictPort: true,
		},
	},
});
