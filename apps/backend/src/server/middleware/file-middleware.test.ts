import { describe, expect, test } from "bun:test";

import { validateFile } from "./file-middleware";

function riff(formType: string): Buffer {
	const value = Buffer.alloc(12);
	value.write("RIFF");
	value.writeUInt32LE(4, 4);
	value.write(formType, 8);
	return value;
}

describe("audio file validation", () => {
	test("accepts WAV and distinguishes its RIFF form from AVI", async () => {
		const result = await validateFile(riff("WAVE"), "track.wav", "audio/wav", "user-123");
		expect(result.isValid).toBe(true);
		expect(result.detectedMimeType).toBe("audio/wav");
	});

	test("rejects an AVI container masquerading as WAV", async () => {
		const result = await validateFile(riff("AVI "), "track.wav", "audio/wav", "user-123");
		expect(result.isValid).toBe(false);
		expect(result.errors).toContain("MIME type does not match file content: audio/wav");
	});
});
