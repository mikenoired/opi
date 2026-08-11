import { expect, test } from "bun:test";

import { needsPlayableAudioTranscode } from "./upload-media";

test("identifies Apple Lossless as requiring a browser-compatible audio transcode", () => {
	expect(needsPlayableAudioTranscode("ALAC")).toBe(true);
	expect(needsPlayableAudioTranscode("aac")).toBe(false);
});
