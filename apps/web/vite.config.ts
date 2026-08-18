import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const source = new URL("./src/", import.meta.url).pathname;

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": source,
		},
	},
	build: {
		outDir: "dist",
		sourcemap: true,
	},
	server: {
		port: Number(process.env.WEB_PORT ?? 5173),
		strictPort: true,
		proxy: {
			"/api": {
				target: process.env.BACKEND_URL || "http://localhost:3000",
				changeOrigin: true,
			},
		},
	},
});
