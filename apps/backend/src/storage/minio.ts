import { Buffer } from "node:buffer";

import * as Minio from "minio";

import type { FileValidationConfig, ValidationResult } from "../server/middleware/file-middleware";
import { sanitizeFileName, validateFile } from "../server/middleware/file-middleware";

const {
	MINIO_ENDPOINT,
	MINIO_ACCESS_KEY,
	MINIO_SECRET_KEY,
	MINIO_BUCKET_NAME = "monolyth",
	MINIO_USE_SSL = "false",
} = process.env;

if (!MINIO_ENDPOINT || !MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) {
	throw new Error("MinIO configuration is missing required environment variables");
}

const [host, portStr] = MINIO_ENDPOINT.split(":");

const minioClient = new Minio.Client({
	endPoint: host,
	port: portStr ? Number.parseInt(portStr, 10) : undefined,
	useSSL: MINIO_USE_SSL === "true",
	accessKey: MINIO_ACCESS_KEY,
	secretKey: MINIO_SECRET_KEY,
});

const bucketName = MINIO_BUCKET_NAME;

export async function uploadFile(
	file: Buffer,
	fileName: string,
	contentType: string,
	userId: string,
	folder: string = "images",
	validationConfig?: Partial<FileValidationConfig>
): Promise<{ success: boolean; objectName?: string; validation: ValidationResult; fileSize?: number }> {
	const validation = await validateFile(file, fileName, contentType, userId, validationConfig);

	if (!validation.isValid) {
		return {
			success: false,
			validation,
		};
	}

	try {
		const sanitizedFileName = sanitizeFileName(fileName);
		const objectName = `${folder}/${userId}/${Date.now()}-${sanitizedFileName}`;

		await minioClient.putObject(bucketName, objectName, file, file.length, {
			"Content-Type": contentType,
			"x-amz-meta-user-id": userId,
		});

		return {
			success: true,
			objectName,
			validation,
			fileSize: file.length,
		};
	} catch (error) {
		return {
			success: false,
			validation: {
				...validation,
				errors: [
					...validation.errors,
					`Upload error: ${error instanceof Error ? error.message : "Unknown error"}`,
				],
			},
		};
	}
}

export function getPublicUrl(objectName: string): string {
	// В реальном приложении здесь может быть более сложная логика,
	// например, генерация presigned URL или использование CDN.
	// Сейчас мы просто формируем прямой URL к нашему локальному API-роуту.
	return `/api/files/${objectName}`;
}

export async function getFileBuffer(objectName: string) {
	try {
		const chunks: Uint8Array[] = [];
		const stream = await minioClient.getObject(bucketName, objectName);

		return new Promise<Buffer>((resolve, reject) => {
			stream.on("data", (chunk: Uint8Array) => chunks.push(chunk));
			stream.on("end", () => resolve(Buffer.concat(chunks)));
			stream.on("error", (err) => reject(err));
		});
	} catch {
		return null;
	}
}

export async function getFileMetadata(objectName: string) {
	try {
		const stat = await minioClient.statObject(bucketName, objectName);
		return {
			size: stat.size,
			contentType: stat.metaData?.["content-type"],
			userId: stat.metaData?.["x-amz-meta-user-id"],
			lastModified: stat.lastModified,
		};
	} catch {
		return null;
	}
}

export async function deleteFile(objectName: string): Promise<void> {
	await minioClient.removeObject(bucketName, objectName);
}

export async function deleteUserFiles(userId: string): Promise<void> {
	const prefixes = ["images", "audio", "audio-covers", "media", "media-thumbs", "note-images", "documents"];
	const objectNames: string[] = [];

	for (const prefix of prefixes) {
		const objects = minioClient.listObjectsV2(bucketName, `${prefix}/${userId}/`, true);
		for await (const object of objects) {
			if (object.name) objectNames.push(object.name);
		}
	}

	if (objectNames.length > 0) await minioClient.removeObjects(bucketName, objectNames);
}

export async function getPresignedUrl(objectName: string, expirySeconds: number = 3600): Promise<string> {
	const extension = objectName.toLowerCase().split(".").pop();
	const responseContentType =
		extension === "mp3"
			? "audio/mpeg"
			: extension === "m4a"
				? "audio/mp4"
				: extension === "jpg" || extension === "jpeg"
					? "image/jpeg"
					: undefined;
	return await minioClient.presignedGetObject(
		bucketName,
		objectName,
		expirySeconds,
		responseContentType ? { "response-content-type": responseContentType } : undefined
	);
}

export { bucketName, minioClient };
