// Provider-agnostic LLM abstraction. Adding a new provider:
// 1. create providers/<name>.provider.ts exporting create<Name>Provider(config): LlmProvider
// 2. add its pricing to config.ts PRICING map
// 3. add a case in createLlmProvider() below
export type ChatRole = "system" | "user" | "assistant";

export type ChatContentPart =
	| { type: "text"; text: string }
	| { type: "image_url"; imageUrl: { url: string; detail?: "auto" | "low" | "high" } };

export interface ChatMessage {
	role: ChatRole;
	content: string | ChatContentPart[];
}

export interface LlmUsage {
	promptTokens: number;
	completionTokens: number;
}

export interface LlmCompletionRequest {
	model: string;
	messages: ChatMessage[];
	temperature?: number;
	maxTokens?: number;
	responseJson?: boolean;
	disableThinking?: boolean;
}

export interface LlmCompletionResult<T> {
	data: T;
	usage: LlmUsage;
	model: string;
}

export interface LlmProvider {
	readonly name: string;
	jsonCompletion<T>(req: LlmCompletionRequest, parse: (raw: string) => T): Promise<LlmCompletionResult<T>>;
}

import { aiConfig } from "./config";
import { createZaiProvider } from "./providers/zai.provider";

export function createLlmProvider(): LlmProvider {
	switch (aiConfig.provider) {
		case "zai":
			return createZaiProvider(aiConfig.zai);
		default:
			throw new Error(`Unknown AI_PROVIDER: ${aiConfig.provider}`);
	}
}
