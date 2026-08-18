import { Buffer } from "node:buffer";

import sharp from "sharp";

import { getFileBuffer } from "../../storage/minio";

// Downscale so a single tagging request stays cheap regardless of source size.
const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 80;

const dataUrlPattern = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/;

async function encodeImageForVision(buffer: Buffer): Promise<string> {
	const resized = await sharp(buffer, { animated: false })
		.rotate()
		.resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
		.jpeg({ quality: JPEG_QUALITY })
		.toBuffer();
	return `data:image/jpeg;base64,${resized.toString("base64")}`;
}

// Fetch an object from MinIO and return a base64 JPEG data URL suitable for a
// vision model. Returns null if the object can't be read or decoded.
export async function fetchImageForVision(objectName: string): Promise<string | null> {
	const buffer = await getFileBuffer(objectName);
	if (!buffer) return null;
	try {
		return await encodeImageForVision(buffer);
	} catch {
		return null;
	}
}

// Normalize an incoming client data URL (re-encode/downscale server-side so the
// payload to the model is bounded). Returns null for malformed input.
export async function prepareDataUrlForVision(dataUrl: string): Promise<string | null> {
	const match = dataUrlPattern.exec(dataUrl);
	if (!match) return null;
	try {
		return await encodeImageForVision(Buffer.from(match[1], "base64"));
	} catch {
		return null;
	}
}
