import { Buffer } from "node:buffer";

import type { Content } from "@monolyth/shared/schemas";

export interface UploadedFileInfo {
	objectName: string;
	url: string;
	fileName: string;
	type: string;
	size: number;
	content?: Content;
	thumbnailBase64?: string;
	thumbnail?: string;
	cover?: string;
}

export interface UploadOutcome {
	files: UploadedFileInfo[];
	contents: Content[];
	errors: string[];
}

export interface ProcessOutcome {
	result?: UploadedFileInfo;
	errors?: string[];
}

export interface UploadRequestFile {
	name: string;
	type: string;
	size: number;
	content: string;
}

export interface UploadRequest {
	files: UploadRequestFile[];
	title?: string | null;
	tags?: string[] | null;
	makeTrack?: boolean;
}

export interface FilePayload {
	name: string;
	type: string;
	size: number;
	buffer: Buffer;
}

export interface UploadBaseParams {
	userId: string;
	title?: string | null;
	tags: string[];
}

export interface AudioUploadParams extends UploadBaseParams {
	makeTrack: boolean;
}

export type UploadContentType = "media" | "audio";
