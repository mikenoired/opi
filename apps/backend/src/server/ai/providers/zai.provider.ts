import type {
	ChatContentPart,
	LlmCompletionRequest,
	LlmCompletionResult,
	LlmProvider,
	LlmUsage,
} from "../provider";

function toApiContent(content: string | ChatContentPart[]) {
	if (typeof content === "string") return content;
	return content.map((part) => {
		if (part.type === "image_url") {
			const image_url: { url: string; detail?: string } = { url: part.imageUrl.url };
			if (part.imageUrl.detail) image_url.detail = part.imageUrl.detail;
			return { type: "image_url", image_url };
		}
		return { type: "text", text: part.text };
	});
}

interface ZaiConfig {
	apiKey: string;
	baseUrl: string;
}

interface ZaiChatResponse {
	id?: string;
	model?: string;
	choices?: Array<{ message?: { content?: string } }>;
	usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const REQUEST_TIMEOUT_MS = 45000;

export function createZaiProvider(config: ZaiConfig): LlmProvider {
	if (!config.apiKey) {
		throw new Error("ZAI_API_KEY is not configured");
	}

	const endpoint = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;

	async function callOnce(
		req: LlmCompletionRequest
	): Promise<{ content: string; usage: LlmUsage; model: string }> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		try {
			const res = await fetch(endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${config.apiKey}`,
					"Accept-Language": "en-US,en",
				},
				signal: controller.signal,
				body: JSON.stringify({
					model: req.model,
					messages: req.messages.map((m) => ({ role: m.role, content: toApiContent(m.content) })),
					temperature: req.temperature ?? 0.2,
					...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
					...(req.responseJson ? { response_format: { type: "json_object" } } : {}),
					...(req.disableThinking ? { thinking: { type: "disabled" } } : {}),
				}),
			});

			if (!res.ok) {
				const detail = await res.text().catch(() => "");
				throw new Error(`z.ai request failed (${res.status}): ${detail.slice(0, 200)}`);
			}

			const json = (await res.json()) as ZaiChatResponse;
			const content = json?.choices?.[0]?.message?.content;
			if (typeof content !== "string") {
				throw new Error("z.ai returned no message content");
			}
			return {
				content,
				usage: {
					promptTokens: Number(json?.usage?.prompt_tokens ?? 0),
					completionTokens: Number(json?.usage?.completion_tokens ?? 0),
				},
				model: json?.model ?? req.model,
			};
		} finally {
			clearTimeout(timer);
		}
	}

	return {
		name: "zai",
		async jsonCompletion<T>(
			req: LlmCompletionRequest,
			parse: (raw: string) => T
		): Promise<LlmCompletionResult<T>> {
			const first = await callOnce(req);
			try {
				return { data: parse(first.content), usage: first.usage, model: first.model };
			} catch {
				const retried = await callOnce({
					...req,
					messages: [
						...req.messages,
						{ role: "assistant", content: first.content },
						{
							role: "user",
							content:
								"Your previous response was not valid JSON. Reply with ONLY the JSON object, no other text.",
						},
					],
				});
				return { data: parse(retried.content), usage: retried.usage, model: retried.model };
			}
		},
	};
}
