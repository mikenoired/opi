import { parseMediaJson } from "@synapse/shared/schemas";
import { z } from "zod";

import { aiConfig, computeCostUsd } from "../ai/config";
import { devLog } from "../ai/logger";
import { TAGGING_PROMPT } from "../ai/prompts";
import type { ChatMessage, LlmProvider } from "../ai/provider";
import { createLlmProvider } from "../ai/provider";
import type { Context } from "../context";
import { extractContentText } from "../lib/content-search";
import { fetchImageForVision, prepareDataUrlForVision } from "../lib/image-vision";
import AiUsageRepository from "../repositories/ai-usage.repository";
import ContentRepository from "../repositories/content.repository";

const MAX_CONTENT_CHARS = 4000;
const MAX_TAGS_TOTAL = 6;
const TAG_NAME_MIN = 1;
const TAG_NAME_MAX = 50;

const tagSuggestionResponseSchema = z.object({
	existing_tag_ids: z.array(z.string()).max(MAX_TAGS_TOTAL).default([]),
	new_tag_names: z.array(z.string()).max(MAX_TAGS_TOTAL).default([]),
});

export interface SuggestTagsDraftInput {
	mode: "draft";
	type: string;
	title?: string | null;
	content?: string;
	image?: string;
}

export interface SuggestTagsExistingInput {
	mode: "existing";
	contentId: string;
}

export type SuggestTagsInput = SuggestTagsDraftInput | SuggestTagsExistingInput;

export interface SuggestedTag {
	id: string;
	name: string;
}

export interface SuggestTagsResult {
	success: boolean;
	existing: SuggestedTag[];
	newTags: string[];
	error?: string;
}

type ErrorType = "network" | "timeout" | "parse_error" | "provider_error" | "auth" | "config" | null;

function truncate(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

// Strip C0 control chars and DEL but keep tab/newline, then collapse whitespace.
function sanitizeTagName(raw: string): string | null {
	let cleaned = "";
	for (const ch of raw) {
		const code = ch.charCodeAt(0);
		const isControl = (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f;
		if (!isControl) cleaned += ch;
	}
	cleaned = cleaned.replace(/\s+/g, " ").trim();
	if (cleaned.length < TAG_NAME_MIN || cleaned.length > TAG_NAME_MAX) return null;
	return cleaned;
}

function classifyError(err: unknown): ErrorType {
	if (!(err instanceof Error)) return "provider_error";
	const name = err.name;
	const msg = err.message.toLowerCase();
	if (name === "AbortError" || msg.includes("abort")) return "timeout";
	if (msg.includes("not configured") || msg.includes("unknown ai_provider")) return "config";
	if (
		msg.includes("failed (401") ||
		msg.includes("(403") ||
		msg.includes("api key") ||
		msg.includes("unauthor")
	) {
		return "auth";
	}
	if (msg.includes("no message content") || msg.includes("json") || msg.includes("expected"))
		return "parse_error";
	if (
		msg.includes("fetch") ||
		msg.includes("network") ||
		msg.includes("econn") ||
		msg.includes("failed to fetch")
	) {
		return "network";
	}
	return "provider_error";
}

function prettyError(type: ErrorType): string {
	switch (type) {
		case "timeout":
			return "The AI service took too long to respond. Please try again.";
		case "auth":
		case "config":
			return "AI tagging is not configured.";
		default:
			return "Couldn't generate tags right now. Please try again.";
	}
}

function failure(error: string): SuggestTagsResult {
	return { success: false, existing: [], newTags: [], error };
}

// Validate & de-duplicate model output against the user's real tag set.
function dedupeTagSuggestions(
	parsed: z.infer<typeof tagSuggestionResponseSchema>,
	tagTitleById: Map<string, string>,
	existingTitlesLower: Set<string>
): { existing: SuggestedTag[]; newTags: string[] } {
	const seen = new Set<string>();
	const existing: SuggestedTag[] = [];
	for (const id of parsed.existing_tag_ids) {
		const name = tagTitleById.get(id);
		if (!name) continue;
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		existing.push({ id, name });
	}

	const newTags: string[] = [];
	for (const raw of parsed.new_tag_names) {
		if (existing.length + newTags.length >= MAX_TAGS_TOTAL) break;
		const name = sanitizeTagName(raw);
		if (!name) continue;
		const key = name.toLowerCase();
		if (seen.has(key) || existingTitlesLower.has(key)) continue;
		seen.add(key);
		newTags.push(name);
	}

	return { existing, newTags };
}

export default class AiTaggingService {
	private ctx: Context;
	private contentRepo: ContentRepository;
	private usageRepo: AiUsageRepository;
	private readonly model = aiConfig.defaultModel;
	private readonly visionModel = aiConfig.visionModel;

	constructor(ctx: Context) {
		this.ctx = ctx;
		this.contentRepo = new ContentRepository(ctx);
		this.usageRepo = new AiUsageRepository(ctx);
	}

	async suggestTags(input: SuggestTagsInput): Promise<SuggestTagsResult> {
		const startedAt = Date.now();

		let text = "";
		let title: string | null = null;
		let contentId: string | null = null;
		let imageObject: string | null = null;
		let imageDataUrl: string | null = null;

		try {
			if (input.mode === "existing") {
				const row = await this.contentRepo.getById(input.contentId);
				contentId = row.id;
				title = row.title ?? null;
				const media = parseMediaJson(row.content);
				if (row.type === "media" && media?.media?.type === "image" && media.media.object) {
					imageObject = media.media.object;
				} else {
					text = extractContentText(row.content);
				}
			} else {
				title = input.title ?? null;
				if (input.image) {
					imageDataUrl = await prepareDataUrlForVision(input.image);
				} else {
					text = extractContentText(input.content ?? "");
				}
			}
		} catch (err) {
			return failure(err instanceof Error ? err.message : "Failed to read content");
		}

		if (imageObject) {
			imageDataUrl = await fetchImageForVision(imageObject);
		}
		if (imageDataUrl) {
			return this.suggestImageTags({ title, imageUrl: imageDataUrl, contentId, startedAt });
		}

		const trimmed = truncate(text, MAX_CONTENT_CHARS).trim();
		if (!trimmed) {
			devLog("no text extracted; skipping");
			return failure("Content has no text to analyze");
		}

		let provider: LlmProvider;
		try {
			provider = createLlmProvider();
		} catch (err) {
			const message = err instanceof Error ? err.message : "AI not configured";
			await this.recordUsage(
				aiConfig.provider,
				this.model,
				false,
				0,
				0,
				contentId,
				"config",
				message,
				startedAt
			);
			return failure(prettyError("config"));
		}

		const userTags = await this.contentRepo.getTagsForAi(60);
		const tagTitleById = new Map(userTags.map((t) => [t.id, t.title]));
		const existingTitlesLower = new Set(userTags.map((t) => t.title.toLowerCase()));

		const messages = [
			{ role: "system" as const, content: TAGGING_PROMPT.system },
			{
				role: "user" as const,
				content: TAGGING_PROMPT.buildUserMessage({
					title,
					text: trimmed,
					tags: userTags.map((t) => ({ id: t.id, name: t.title })),
				}),
			},
		];

		let parsed: z.infer<typeof tagSuggestionResponseSchema>;
		let usage: { promptTokens: number; completionTokens: number };
		let actualModel: string = this.model;
		try {
			const res = await provider.jsonCompletion(
				{
					model: this.model,
					messages,
					temperature: 0.2,
					maxTokens: 512,
					responseJson: true,
					disableThinking: true,
				},
				(raw) => tagSuggestionResponseSchema.parse(JSON.parse(raw))
			);
			parsed = res.data;
			usage = res.usage;
			actualModel = res.model;
		} catch (err) {
			const errorType = classifyError(err);
			const message = err instanceof Error ? err.message : "LLM call failed";
			await this.recordUsage(
				provider.name,
				this.model,
				false,
				0,
				0,
				contentId,
				errorType,
				message,
				startedAt
			);
			devLog("failed", { errorType, message });
			return failure(prettyError(errorType));
		}

		const { existing, newTags } = dedupeTagSuggestions(parsed, tagTitleById, existingTitlesLower);

		await this.recordUsage(
			provider.name,
			actualModel,
			true,
			usage.promptTokens,
			usage.completionTokens,
			contentId,
			null,
			null,
			startedAt
		);
		devLog("ok", {
			model: actualModel,
			tokensIn: usage.promptTokens,
			tokensOut: usage.completionTokens,
			costUsd: computeCostUsd(actualModel, usage.promptTokens, usage.completionTokens).toFixed(8),
			tags: existing.length + newTags.length,
			ms: Date.now() - startedAt,
		});

		return { success: true, existing, newTags };
	}

	private async suggestImageTags(params: {
		title: string | null;
		imageUrl: string;
		contentId: string | null;
		startedAt: number;
	}): Promise<SuggestTagsResult> {
		const { title, imageUrl, contentId, startedAt } = params;

		let provider: LlmProvider;
		try {
			provider = createLlmProvider();
		} catch (err) {
			const message = err instanceof Error ? err.message : "AI not configured";
			await this.recordUsage(
				aiConfig.provider,
				this.visionModel,
				false,
				0,
				0,
				contentId,
				"config",
				message,
				startedAt
			);
			return failure(prettyError("config"));
		}

		const userTags = await this.contentRepo.getTagsForAi(60);
		const tagTitleById = new Map(userTags.map((t) => [t.id, t.title]));
		const existingTitlesLower = new Set(userTags.map((t) => t.title.toLowerCase()));

		const messages: ChatMessage[] = [
			{ role: "system", content: TAGGING_PROMPT.system },
			{
				role: "user",
				content: [
					{
						type: "text",
						text: TAGGING_PROMPT.buildImageUserMessage({
							title,
							tags: userTags.map((t) => ({ id: t.id, name: t.title })),
						}),
					},
					{ type: "image_url", imageUrl: { url: imageUrl } },
				],
			},
		];

		let parsed: z.infer<typeof tagSuggestionResponseSchema>;
		let usage: { promptTokens: number; completionTokens: number };
		let actualModel: string = this.visionModel;
		try {
			const res = await provider.jsonCompletion(
				{
					model: this.visionModel,
					messages,
					temperature: 0.2,
					maxTokens: 512,
					responseJson: true,
					disableThinking: true,
				},
				(raw) => tagSuggestionResponseSchema.parse(JSON.parse(raw))
			);
			parsed = res.data;
			usage = res.usage;
			actualModel = res.model;
		} catch (err) {
			const errorType = classifyError(err);
			const message = err instanceof Error ? err.message : "LLM call failed";
			await this.recordUsage(
				provider.name,
				this.visionModel,
				false,
				0,
				0,
				contentId,
				errorType,
				message,
				startedAt
			);
			devLog("image tagging failed", { errorType, message });
			return failure(prettyError(errorType));
		}

		const { existing, newTags } = dedupeTagSuggestions(parsed, tagTitleById, existingTitlesLower);

		await this.recordUsage(
			provider.name,
			actualModel,
			true,
			usage.promptTokens,
			usage.completionTokens,
			contentId,
			null,
			null,
			startedAt
		);
		devLog("image tagging ok", {
			model: actualModel,
			tokensIn: usage.promptTokens,
			tokensOut: usage.completionTokens,
			costUsd: computeCostUsd(actualModel, usage.promptTokens, usage.completionTokens).toFixed(8),
			tags: existing.length + newTags.length,
			ms: Date.now() - startedAt,
		});

		return { success: true, existing, newTags };
	}

	private async recordUsage(
		providerName: string,
		model: string,
		success: boolean,
		inputTokens: number,
		outputTokens: number,
		contentId: string | null,
		errorType: ErrorType,
		errorMessage: string | null,
		startedAt: number
	): Promise<void> {
		const inputCost = computeCostUsd(model, inputTokens, 0);
		const outputCost = computeCostUsd(model, 0, outputTokens);
		try {
			await this.usageRepo.record({
				provider: providerName,
				model,
				inputTokens,
				outputTokens,
				inputCostUsd: inputCost,
				outputCostUsd: outputCost,
				totalCostUsd: inputCost + outputCost,
				success,
				errorType,
				errorMessage: errorMessage ? errorMessage.slice(0, 500) : null,
				latencyMs: Date.now() - startedAt,
				contentId,
			});
		} catch (err) {
			devLog("usage record failed", err instanceof Error ? err.message : err);
		}
	}
}
