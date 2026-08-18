import { commonAppConfiguration, mergeAppConfiguration, type AppRuntime } from "@monolyth/features/runtime";

import { createWebMonolythClient } from "./web-monolyth-client";

/** Web's entire contribution to shared UI: a REST client, capabilities and declarative extensions. */
export const webRuntime: AppRuntime = {
	configuration: mergeAppConfiguration(commonAppConfiguration, {
		settings: [{ groups: [], icon: "ai", id: "ai", label: "AI", when: { capability: "ai" } }],
	}),
	services: {
		capabilities: { enabled: ["account", "ai", "cloud-storage", "media-import"] },
		client: createWebMonolythClient(),
		commands: {
			execute: async (command) => {
				throw new Error(`Unsupported Web command: ${command}`);
			},
		},
	},
};
