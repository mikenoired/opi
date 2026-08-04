import { extractTextFromStructuredContent, type Content } from "@synapse/shared/schemas";

interface MediaDimensions {
	height: number;
	width: number;
}

interface ImageMediaContentParams {
	objectName: string;
	publicUrl: string;
	imageDimensions?: MediaDimensions;
	thumbnailBase64: string;
}

interface VideoMediaContentParams {
	objectName: string;
	publicUrl: string;
	thumbnailUrl: string;
	thumbnailBase64: string;
	videoDimensions?: MediaDimensions;
}

interface AudioContentMetadata {
	common?: {
		album?: string;
		artist?: string;
		disk?: { no?: number | null };
		genre?: string[];
		lyrics?: string[];
		title?: string;
		track?: { no?: number | null };
		year?: number;
	};
	format?: {
		bitrate?: number;
		duration?: number;
		numberOfChannels?: number;
		sampleRate?: number;
	};
}

interface AudioContentParams {
	audioObjectName: string;
	audioUrl: string;
	bufferLength: number;
	coverDims?: MediaDimensions;
	coverObject?: string;
	coverThumbnailBase64?: string;
	coverUrl?: string;
	fileType: string;
	makeTrack: boolean;
	metadata: AudioContentMetadata | null;
	title?: string | null;
}

export function buildImageMediaContent({
	objectName,
	publicUrl,
	imageDimensions,
	thumbnailBase64,
}: ImageMediaContentParams) {
	return {
		media: {
			height: imageDimensions?.height,
			object: objectName,
			thumbnailBase64,
			type: "image" as const,
			url: publicUrl,
			width: imageDimensions?.width,
		},
	};
}

export function buildVideoMediaContent({
	objectName,
	publicUrl,
	thumbnailBase64,
	thumbnailUrl,
	videoDimensions,
}: VideoMediaContentParams) {
	return {
		media: {
			height: videoDimensions?.height,
			object: objectName,
			thumbnailBase64,
			thumbnailUrl,
			type: "video" as const,
			url: publicUrl,
			width: videoDimensions?.width,
		},
	};
}

export function buildAudioContent({
	audioObjectName,
	audioUrl,
	bufferLength,
	coverDims,
	coverObject,
	coverThumbnailBase64,
	coverUrl,
	fileType,
	makeTrack,
	metadata,
	title,
}: AudioContentParams) {
	return {
		audio: {
			bitrateKbps: metadata?.format?.bitrate ? Math.round(metadata.format.bitrate / 1000) : undefined,
			channels: metadata?.format?.numberOfChannels || undefined,
			durationSec: metadata?.format?.duration ? Math.round(metadata.format.duration) : undefined,
			mimeType: fileType,
			object: audioObjectName,
			sampleRateHz: metadata?.format?.sampleRate || undefined,
			sizeBytes: bufferLength,
			url: audioUrl,
		},
		cover: coverUrl
			? {
					height: coverDims?.height,
					object: coverObject,
					thumbnailBase64: coverThumbnailBase64,
					url: coverUrl,
					width: coverDims?.width,
				}
			: undefined,
		track: {
			album: metadata?.common?.album || undefined,
			artist: metadata?.common?.artist || undefined,
			diskNumber: metadata?.common?.disk?.no || undefined,
			genre: metadata?.common?.genre || undefined,
			isTrack:
				makeTrack ||
				Boolean(
					metadata?.common?.artist ||
					metadata?.common?.album ||
					metadata?.common?.title ||
					metadata?.common?.genre?.length
				),
			lyrics: metadata?.common?.lyrics?.join("\n") || undefined,
			title: metadata?.common?.title || title || undefined,
			trackNumber: metadata?.common?.track?.no || undefined,
			year: metadata?.common?.year || undefined,
		},
	};
}

const contentListPreviewChars = 1_200;

export function buildContentListPreview(
	type: Content["type"],
	content: string,
	title?: string | null
): string {
	if (type === "media" || type === "audio" || type === "todo") return content;
	if (type === "link") return buildLinkPreviewContent(content, title);
	if (type === "note") return extractTextPreview(content);
	return truncateText(content.replace(/<[^>]*>/g, " "));
}

function buildLinkPreviewContent(content: string, title?: string | null): string {
	const parsed = safeParseJson<Record<string, unknown>>(content);
	const url = typeof parsed?.url === "string" ? parsed.url : extractJsonStringField(content, "url");
	if (!url) return truncateText(title || content);

	const linkTitle =
		typeof parsed?.title === "string"
			? parsed.title
			: extractJsonStringField(content, "title") || title || url;
	const description =
		typeof parsed?.description === "string"
			? parsed.description
			: extractJsonStringField(content, "description") || "";
	const rawText = truncateText(
		typeof parsed?.rawText === "string" ? parsed.rawText : extractTextPreview(content)
	);
	const metadata = parsed?.metadata && typeof parsed.metadata === "object" ? parsed.metadata : {};
	const image =
		"image" in metadata && typeof metadata.image === "string"
			? metadata.image
			: extractJsonStringField(content, "image");

	return JSON.stringify({
		url,
		title: linkTitle,
		description,
		content: {
			type: "doc",
			content: rawText ? [{ type: "paragraph", content: rawText }] : [],
		},
		rawText,
		metadata: {
			image: image || undefined,
			extractedAt:
				"extractedAt" in metadata && typeof metadata.extractedAt === "string" ? metadata.extractedAt : "",
			contentBlocks: 1,
		},
		parsing: {
			method: "preview",
			userAgent: "",
			success: true,
		},
	});
}

function extractTextPreview(content: string): string {
	const parsed = safeParseJson<unknown>(content);
	if (parsed) {
		const text = extractTextFromStructuredContent(parsed);
		if (text) return truncateText(text);
	}

	const textMatches = [...content.matchAll(/"(?:text|content)"\s*:\s*"((?:\\.|[^"\\])*)"/g)]
		.map((match) => parseJsonStringLiteral(match[1] || ""))
		.filter(Boolean);

	return truncateText(textMatches.length ? textMatches.join(" ") : content);
}

function truncateText(content: string): string {
	const normalized = content.replace(/\s+/g, " ").trim();
	if (normalized.length <= contentListPreviewChars) return normalized;
	return `${normalized.slice(0, contentListPreviewChars).trimEnd()}...`;
}

function safeParseJson<T>(content: string): T | null {
	try {
		return JSON.parse(content) as T;
	} catch {
		return null;
	}
}

function extractJsonStringField(content: string, field: string): string | undefined {
	const match = content.match(new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`));
	return match ? parseJsonStringLiteral(match[1] || "") : undefined;
}

function parseJsonStringLiteral(value: string): string {
	try {
		return JSON.parse(`"${value}"`) as string;
	} catch {
		return value;
	}
}
