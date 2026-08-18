import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

/**
 * Serves local objects with byte-range support. Chromium uses range requests
 * for media seeking, so a full-file response is not sufficient for audio.
 */
export async function createDesktopObjectResponse(
	filePath: string,
	contentType: string,
	rangeHeader: string | null
): Promise<Response> {
	const size = (await stat(filePath)).size;
	const range = parseByteRange(rangeHeader, size);
	if (rangeHeader && !range) {
		return new Response(null, { headers: { "Content-Range": `bytes */${size}` }, status: 416 });
	}
	if (size === 0) {
		return new Response(null, {
			headers: {
				"Accept-Ranges": "bytes",
				"Content-Length": "0",
				"Content-Type": contentType,
			},
			status: 200,
		});
	}
	const start = range?.start ?? 0;
	const end = range?.end ?? Math.max(0, size - 1);
	const length = Math.max(0, end - start + 1);
	const stream = Readable.toWeb(createReadStream(filePath, { end, start }));
	return new Response(stream as unknown as BodyInit, {
		headers: {
			"Accept-Ranges": "bytes",
			"Content-Length": String(length),
			"Content-Type": contentType,
			...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
		},
		status: range ? 206 : 200,
	});
}

function parseByteRange(value: string | null, size: number): { end: number; start: number } | undefined {
	if (!value) return undefined;
	const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
	if (!match || size <= 0) return undefined;
	const [, rawStart, rawEnd] = match;
	if (!rawStart && !rawEnd) return undefined;
	if (!rawStart) {
		const suffixLength = Number(rawEnd);
		if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return undefined;
		return { end: size - 1, start: Math.max(0, size - suffixLength) };
	}
	const start = Number(rawStart);
	const requestedEnd = rawEnd ? Number(rawEnd) : size - 1;
	if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size)
		return undefined;
	const end = Math.min(requestedEnd, size - 1);
	return end >= start ? { end, start } : undefined;
}
