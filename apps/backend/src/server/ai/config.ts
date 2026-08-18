// AI provider configuration and model pricing (USD per 1M tokens).
// Pricing source: https://docs.z.ai/guides/overview/pricing
// Switching provider = add a case in provider.ts + pricing entries here.

export interface ModelPricing {
	inputPerM: number;
	outputPerM: number;
}

export interface AiConfig {
	provider: string;
	defaultModel: string;
	visionModel: string;
	zai: {
		apiKey: string;
		baseUrl: string;
	};
}

export const aiConfig: AiConfig = {
	provider: process.env.AI_PROVIDER || "zai",
	defaultModel: process.env.AI_DEFAULT_MODEL || "glm-4.5-air",
	// Multimodal (vision) model for image auto-tagging. Use a "-v" variant;
	// text-only GLM models reject image content with HTTP 400.
	visionModel: process.env.AI_VISION_MODEL || "glm-4.6v",
	zai: {
		apiKey: process.env.ZAI_API_KEY || "",
		baseUrl: process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4",
	},
};

export const PRICING: Record<string, ModelPricing> = {
	"glm-4.5-air": { inputPerM: 0.2, outputPerM: 1.1 },
	"glm-4.5-airx": { inputPerM: 1.1, outputPerM: 4.5 },
	"glm-4.5": { inputPerM: 0.6, outputPerM: 2.2 },
	"glm-4.6": { inputPerM: 0.6, outputPerM: 2.2 },
	"glm-4.6v": { inputPerM: 0.3, outputPerM: 0.9 },
	"glm-4.6v-flash": { inputPerM: 0, outputPerM: 0 },
	"glm-4.7": { inputPerM: 0.6, outputPerM: 2.2 },
	"glm-4.7-flashx": { inputPerM: 0.07, outputPerM: 0.4 },
	"glm-5": { inputPerM: 1, outputPerM: 3.2 },
	"glm-5-turbo": { inputPerM: 1.2, outputPerM: 4 },
	"glm-5.1": { inputPerM: 1.4, outputPerM: 4.4 },
	"glm-5.2": { inputPerM: 1.4, outputPerM: 4.4 },
	"glm-4.5-flash": { inputPerM: 0, outputPerM: 0 },
	"glm-4.7-flash": { inputPerM: 0, outputPerM: 0 },
};

export function getModelPricing(model: string): ModelPricing {
	return PRICING[model] ?? { inputPerM: 0, outputPerM: 0 };
}

export function computeCostUsd(model: string, inputTokens: number, outputTokens: number): number {
	const p = getModelPricing(model);
	return (inputTokens / 1_000_000) * p.inputPerM + (outputTokens / 1_000_000) * p.outputPerM;
}
