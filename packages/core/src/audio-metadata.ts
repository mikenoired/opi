import type { AudioContentMetadata } from "./content";

/** Minimal, platform-neutral shape returned by an audio tag reader. */
export interface ParsedAudioMetadata {
	common: {
		album?: string;
		artist?: string;
		disk?: { no?: number | null };
		genre?: string[];
		lyrics?: unknown[];
		picture?: Array<{ data: Uint8Array; format?: string }>;
		title?: string;
		track?: { no?: number | null };
		year?: number;
	};
	format: {
		bitrate?: number;
		codec?: string;
		duration?: number;
		numberOfChannels?: number;
		sampleRate?: number;
	};
}

export interface ScrapedAudioArtwork {
	bytes: Uint8Array;
	fileName: string;
	mimeType: string;
}

export interface ScrapedAudioMetadata {
	artwork?: ScrapedAudioArtwork;
	codec?: string;
	metadata: AudioContentMetadata;
	title?: string;
}

/**
 * Converts parser-specific audio tags into the portable content projection
 * used by every importer. Keeping this here prevents desktop and server
 * uploads from disagreeing about tags or the embedded cover to persist.
 */
export function scrapeAudioMetadata(parsed: ParsedAudioMetadata, fileName: string): ScrapedAudioMetadata {
	const picture = parsed.common.picture?.find((candidate) => candidate.data.length > 0);
	return {
		artwork: picture ? toArtwork(picture.data, picture.format, fileName) : undefined,
		codec: parsed.format.codec,
		metadata: {
			common: {
				album: parsed.common.album,
				artist: parsed.common.artist,
				disk: parsed.common.disk,
				genre: parsed.common.genre,
				lyrics: normalizeLyrics(parsed.common.lyrics),
				title: parsed.common.title,
				track: parsed.common.track,
				year: parsed.common.year,
			},
			format: {
				bitrate: parsed.format.bitrate,
				duration: parsed.format.duration,
				numberOfChannels: parsed.format.numberOfChannels,
				sampleRate: parsed.format.sampleRate,
			},
		},
		title: parsed.common.title,
	};
}

/** Chromium cannot decode Apple Lossless even when it is stored in an M4A container. */
export function needsPlayableAudioTranscode(codec?: string): boolean {
	return codec?.trim().toLocaleLowerCase() === "alac";
}

export function detectArtworkMimeType(bytes: Uint8Array, format?: string): string | undefined {
	if (bytes.subarray(0, 3).every((value, index) => value === [0xff, 0xd8, 0xff][index])) return "image/jpeg";
	if (
		bytes
			.subarray(0, 8)
			.every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])
	)
		return "image/png";
	if (matchesSignature(bytes, [0x47, 0x49, 0x46])) return "image/gif";
	if (matchesSignature(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])) return "image/webp";

	const candidate = format?.toLocaleLowerCase().trim();
	if (candidate === "image/jpeg" || candidate === "image/jpg" || candidate === "jpeg" || candidate === "jpg")
		return "image/jpeg";
	if (candidate === "image/png" || candidate === "png") return "image/png";
	if (candidate === "image/gif" || candidate === "gif") return "image/gif";
	if (candidate === "image/webp" || candidate === "webp") return "image/webp";
	return undefined;
}

function normalizeLyrics(lyrics: unknown[] | undefined): string[] | undefined {
	const values = lyrics
		?.map((lyric) => {
			if (typeof lyric === "string") return lyric;
			if (typeof lyric === "object" && lyric && "text" in lyric && typeof lyric.text === "string")
				return lyric.text;
			return undefined;
		})
		.filter((lyric): lyric is string => Boolean(lyric?.trim()));
	return values?.length ? values : undefined;
}

function toArtwork(
	bytes: Uint8Array,
	format: string | undefined,
	fileName: string
): ScrapedAudioArtwork | undefined {
	const mimeType = detectArtworkMimeType(bytes, format);
	if (!mimeType) return undefined;
	const extension = mimeType.slice("image/".length).replace("jpeg", "jpg");
	return {
		bytes,
		fileName: `${fileName.replace(/\.[^.]+$/, "")}-cover.${extension}`,
		mimeType,
	};
}

function matchesSignature(bytes: Uint8Array, signature: number[]): boolean {
	return bytes.subarray(0, signature.length).every((value, index) => value === signature[index]);
}
