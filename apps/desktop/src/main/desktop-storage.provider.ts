import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";

import type { StorageProvider } from "@monolyth/core";

/** Filesystem-backed object storage for the desktop application's user-data directory. */
export class DesktopStorageProvider implements StorageProvider {
	constructor(private readonly rootDirectory: string) {}

	async deleteObject(objectName: string): Promise<void> {
		await rm(this.getObjectPath(objectName), { force: true });
	}

	async getObjectMetadata(objectName: string): Promise<{ size: number } | null> {
		try {
			return { size: (await stat(this.getObjectPath(objectName))).size };
		} catch (error) {
			if (isMissingFileError(error)) return null;
			throw error;
		}
	}

	getObjectUrl(objectName: string): string {
		this.getObjectPath(objectName);
		return `monolyth-object://local/${encodeURIComponent(objectName)}`;
	}

	async putObject(
		data: Uint8Array,
		input: { contentType: string; fileName: string; folder: string; userId: string }
	): Promise<{ objectName: string; size: number }> {
		const objectName = createObjectName(input);
		const objectPath = this.getObjectPath(objectName);
		await mkdir(resolve(objectPath, ".."), { recursive: true });
		await writeFile(objectPath, data);
		return { objectName, size: data.byteLength };
	}

	/** A local object name is device-specific; identity is carried by the asset manifest, never this path. */
	async putSyncedAsset(
		data: Uint8Array,
		storageKey: string
	): Promise<{ objectName: string; sha256: string; size: number }> {
		const objectName = createObjectName({
			fileName: basename(storageKey),
			folder: "synced-assets",
			userId: "local",
		});
		const objectPath = this.getObjectPath(objectName);
		await mkdir(resolve(objectPath, ".."), { recursive: true });
		await writeFile(objectPath, data);
		return { objectName, sha256: createHash("sha256").update(data).digest("hex"), size: data.byteLength };
	}

	getObjectPath(objectName: string): string {
		const objectPath = resolve(this.rootDirectory, objectName);
		const pathFromRoot = relative(this.rootDirectory, objectPath);
		if (pathFromRoot.startsWith("..") || pathFromRoot === "" || pathFromRoot.includes("../")) {
			throw new Error("Invalid desktop object name");
		}
		return objectPath;
	}
}

function createObjectName(input: { fileName: string; folder: string; userId: string }): string {
	const extension = extname(basename(input.fileName));
	return `${toPathSegment(input.userId)}/${toPathSegment(input.folder)}/${randomUUID()}${extension}`;
}

function toPathSegment(value: string): string {
	const segment = value.trim();
	if (!segment || segment === "." || segment === ".." || /[\\/]/.test(segment)) {
		throw new Error("Desktop storage paths must use non-empty path segments");
	}
	return segment;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
