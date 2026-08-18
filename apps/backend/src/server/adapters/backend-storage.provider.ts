import type { StorageProvider } from "@monolyth/core";

import { deleteFile, getFileMetadata, getPublicUrl, uploadFile } from "../../storage/minio";

/** Backend object-storage adapter. File validation and naming remain Backend policy. */
export class BackendStorageProvider implements StorageProvider {
	async deleteObject(objectName: string): Promise<void> {
		await deleteFile(objectName);
	}

	async getObjectMetadata(objectName: string) {
		return await getFileMetadata(objectName);
	}

	getObjectUrl(objectName: string): string {
		return getPublicUrl(objectName);
	}

	async putObject(
		data: Uint8Array,
		input: { contentType: string; fileName: string; folder: string; userId: string }
	): Promise<{ objectName: string; size: number }> {
		const result = await uploadFile(
			Buffer.from(data),
			input.fileName,
			input.contentType,
			input.userId,
			input.folder
		);
		if (!result.success || !result.objectName || result.fileSize === undefined) {
			throw new Error(result.validation.errors.join("; ") || "Object upload failed");
		}
		return { objectName: result.objectName, size: result.fileSize };
	}
}
