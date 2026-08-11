import { Buffer } from "node:buffer";

import type { AudioContentMetadata } from "@synapse/core";
import * as mm from "music-metadata";

export interface LocalAudioArtwork {
	bytes: Uint8Array;
	fileName: string;
	mimeType: string;
}

export interface LocalAudioImportMetadata {
	artwork?: LocalAudioArtwork;
	codec?: string;
	metadata: AudioContentMetadata | null;
	title?: string;
}

/**
 * Reads the same portable projection that the server stores for a remote
 * upload. Local import must not depend on the server to make a track useful.
 */
export async function readLocalAudioMetadata(
	bytes: Uint8Array,
	fileName: string,
	mimeType: string
): Promise<LocalAudioImportMetadata> {
	try {
		const parsed = await mm.parseBuffer(Buffer.from(bytes), { mimeType, size: bytes.byteLength });
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
	} catch {
		// Metadata is an enhancement. An otherwise playable local file is never
		// rejected because a tag block is malformed or absent.
		return { metadata: null };
	}
}

/** Chromium cannot decode Apple Lossless even when it is stored in an M4A container. */
export function needsPlayableAudioTranscode(codec?: string): boolean {
	return codec?.trim().toLocaleLowerCase() === "alac";
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
): LocalAudioArtwork | undefined {
	const mimeType = detectArtworkMimeType(bytes, format);
	if (!mimeType) return undefined;
	const extension = mimeType.slice("image/".length).replace("jpeg", "jpg");
	return {
		bytes,
		fileName: `${fileName.replace(/\.[^.]+$/, "")}-cover.${extension}`,
		mimeType,
	};
}

export function detectArtworkMimeType(bytes: Uint8Array, format?: string): string | undefined {
	// APIC MIME labels are often wrong. Browser media uses the actual bytes, so
	// give signature detection precedence over a contradictory metadata label.
	if (bytes.subarray(0, 3).every((value, index) => value === [0xff, 0xd8, 0xff][index])) return "image/jpeg";
	if (
		bytes
			.subarray(0, 8)
			.every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])
	)
		return "image/png";
	if (new TextDecoder().decode(bytes.subarray(0, 6)).startsWith("GIF")) return "image/gif";
	if (new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP") return "image/webp";

	const candidate = format?.toLocaleLowerCase().trim();
	if (candidate === "image/jpeg" || candidate === "image/jpg" || candidate === "jpeg" || candidate === "jpg")
		return "image/jpeg";
	if (candidate === "image/png" || candidate === "png") return "image/png";
	if (candidate === "image/gif" || candidate === "gif") return "image/gif";
	if (candidate === "image/webp" || candidate === "webp") return "image/webp";
	return undefined;
}
