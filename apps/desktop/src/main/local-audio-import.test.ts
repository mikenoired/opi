import { expect, test } from "bun:test";

import {
	detectArtworkMimeType,
	needsPlayableAudioTranscode,
	readLocalAudioMetadata,
} from "./local-audio-import";

function silentWav(): Uint8Array {
	const value = new Uint8Array(44);
	const view = new DataView(value.buffer);
	value.set(new TextEncoder().encode("RIFF"));
	view.setUint32(4, 36, true);
	value.set(new TextEncoder().encode("WAVEfmt "), 8);
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, 8000, true);
	view.setUint32(28, 16000, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	value.set(new TextEncoder().encode("data"), 36);
	view.setUint32(40, 0, true);
	return value;
}

test("extracts portable format metadata for local audio", async () => {
	const result = await readLocalAudioMetadata(silentWav(), "silence.wav", "audio/wav");
	expect(result.metadata).toMatchObject({ format: { numberOfChannels: 1, sampleRate: 8000 } });
	expect(result.artwork).toBeUndefined();
});

test("uses artwork bytes when the embedded MIME label is wrong", () => {
	expect(detectArtworkMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "image/png")).toBe("image/jpeg");
});

test("marks Apple Lossless as requiring browser-compatible transcoding", () => {
	expect(needsPlayableAudioTranscode("ALAC")).toBe(true);
	expect(needsPlayableAudioTranscode("AAC")).toBe(false);
});
