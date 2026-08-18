import { Buffer } from "node:buffer";

import {
	detectArtworkMimeType,
	needsPlayableAudioTranscode,
	scrapeAudioMetadata,
	type AudioContentMetadata,
} from "@monolyth/core";
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
		const scraped = scrapeAudioMetadata(parsed, fileName);
		return {
			...scraped,
			artwork: scraped.artwork,
		};
	} catch {
		// Metadata is an enhancement. An otherwise playable local file is never
		// rejected because a tag block is malformed or absent.
		return { metadata: null };
	}
}

export { detectArtworkMimeType, needsPlayableAudioTranscode };
