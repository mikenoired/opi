import { expect, test } from "bun:test";

import { getAudioFallbackTitle, needsPlayableAudioTranscode } from "./upload-media";

test("identifies Apple Lossless as requiring a browser-compatible audio transcode", () => {
	expect(needsPlayableAudioTranscode("ALAC")).toBe(true);
	expect(needsPlayableAudioTranscode("aac")).toBe(false);
});

test("uses the source filename when audio metadata has no title", () => {
	expect(getAudioFallbackTitle("Recorded memo.m4a")).toBe("Recorded memo");
	expect(getAudioFallbackTitle(".m4a")).toBe("Audio");
});
