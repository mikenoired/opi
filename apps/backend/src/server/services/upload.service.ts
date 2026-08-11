import { Buffer } from "node:buffer";

import type { Context } from "../context";
import { content } from "../db/schema";
import ContentService from "./content.service";
import { processAudioUpload } from "./upload/audio-handler";
import { processImageUpload } from "./upload/image-handler";
import type { UploadHandlerDeps } from "./upload/upload-handler-types";
import { UploadTagService } from "./upload/upload-tag-service";
import type {
	AudioUploadParams,
	FilePayload,
	ProcessOutcome,
	UploadedFileInfo,
	UploadBaseParams,
	UploadOutcome,
	UploadRequest,
} from "./upload/upload-types";
import { processVideoUpload } from "./upload/video-handler";

export default class UploadService {
	private readonly tagService: UploadTagService;

	private readonly handlerDeps: UploadHandlerDeps;

	constructor(private readonly ctx: Context) {
		this.tagService = new UploadTagService(ctx);
		this.handlerDeps = {
			ctx,
			persistContent: this.persistContent.bind(this),
			trackStorage: this.trackStorage.bind(this),
		};
	}

	async handleUpload(payload: UploadRequest): Promise<UploadOutcome> {
		const userId = this.requireUserId();

		const files = payload.files || [];
		const titleRaw = payload.title?.trim();
		const tags = this.normalizeTags(payload.tags);
		const makeTrack = Boolean(payload.makeTrack);

		const uploadResults: UploadedFileInfo[] = [];
		const errors: string[] = [];

		for (const file of files) {
			try {
				const payloadFile = this.createFilePayload(file);
				const outcome = await this.processFile(payloadFile, {
					makeTrack,
					tags,
					title: titleRaw,
					userId,
				});

				if (!outcome) {
					errors.push(`File "${file.name}" is not an image, video, or audio`);
					continue;
				}

				if (outcome?.errors?.length) errors.push(...outcome.errors);

				if (outcome?.result) uploadResults.push(outcome.result);
			} catch (error) {
				errors.push(
					`Failed to upload "${file.name}": ${error instanceof Error ? error.message : "Unknown error"}`
				);
			}
		}

		if (uploadResults.length > 0) {
			await this.invalidateUserCaches();
		}

		return {
			files: uploadResults,
			contents: uploadResults.flatMap((file) => (file.content ? [file.content] : [])),
			errors,
		};
	}

	private async invalidateUserCaches() {
		const userId = this.requireUserId();

		await Promise.all([
			this.ctx.cache.del(`user:${userId}:tags`),
			this.ctx.cache.del(`user:${userId}:tags_with_content`),
			this.ctx.cache.del(`user:${userId}:content_types`),
		]);
	}

	private async persistContent(input: {
		content: string;
		tags: string[];
		title?: string;
		type: "media" | "audio";
		userId: string;
	}) {
		const contentId = await this.ctx.db.transaction(async (tx) => {
			const [inserted] = await tx
				.insert(content)
				.values({
					content: input.content,
					title: input.title,
					type: input.type,
					userId: input.userId,
				})
				.returning({ id: content.id });

			if (!inserted?.id) {
				throw new Error("Content creation error");
			}

			await this.tagService
				.withDb(tx as unknown as Context["db"])
				.attachTags(inserted.id, input.tags, input.type, input.title);

			return inserted.id;
		});

		const contentService = new ContentService(this.ctx);
		const createdContent = await contentService.getById(contentId);
		await contentService.syncSearchText(createdContent);
		await this.ctx.sync.publish({
			entityId: createdContent.id,
			entityType: "content",
			operation: "create",
			payload: createdContent,
			userId: input.userId,
		});
		return createdContent;
	}

	private async trackStorage(userId: string, deltas: { size: number; updateFileCount?: boolean }[]) {
		await Promise.all(
			deltas
				.filter((delta) => delta.size > 0)
				.map((delta) => this.ctx.cache.addFile(userId, delta.size, delta.updateFileCount ?? true))
		);
	}

	private normalizeTags(tags?: string[] | null): string[] {
		if (!Array.isArray(tags)) return [];
		return tags.map((t) => t.trim()).filter(Boolean);
	}

	private createFilePayload(file: UploadRequest["files"][number]): FilePayload {
		return {
			buffer: Buffer.from(file.content, "base64"),
			name: file.name,
			size: file.size,
			type: normalizeMimeType(file.name, file.type),
		};
	}

	private createHandlerDeps(): UploadHandlerDeps {
		return this.handlerDeps;
	}

	private async processFile(
		file: FilePayload,
		params: UploadBaseParams & { makeTrack: boolean }
	): Promise<ProcessOutcome | undefined> {
		const deps = this.createHandlerDeps();

		if (file.type.startsWith("image/")) return processImageUpload(deps, file, params);
		if (file.type.startsWith("video/")) return processVideoUpload(deps, file, params);
		if (file.type.startsWith("audio/")) {
			const audioParams: AudioUploadParams = {
				makeTrack: params.makeTrack,
				tags: params.tags,
				title: params.title,
				userId: params.userId,
			};

			return processAudioUpload(deps, file, audioParams);
		}

		return undefined;
	}

	private requireUserId(): string {
		if (!this.ctx.user?.id) throw new Error("Unauthorized");
		return this.ctx.user.id;
	}
}

function normalizeMimeType(fileName: string, mimeType: string): string {
	if (mimeType === "audio/mp3") return "audio/mpeg";
	if (mimeType === "audio/m4a" || mimeType === "audio/x-m4a") return "audio/mp4";
	if (mimeType === "audio/x-wav") return "audio/wav";
	if (mimeType === "audio/x-flac") return "audio/flac";
	if (mimeType && mimeType !== "application/octet-stream") return mimeType;
	const extension = fileName.toLowerCase().split(".").pop() ?? "";
	return (
		{
			aac: "audio/aac",
			flac: "audio/flac",
			m4a: "audio/mp4",
			mp3: "audio/mpeg",
			ogg: "audio/ogg",
			opus: "audio/opus",
			wav: "audio/wav",
		}[extension] ?? mimeType
	);
}
