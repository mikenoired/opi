import type { Content } from "@synapse/shared/schemas";

import type { Context } from "../../context";
import type { UploadContentType } from "./upload-types";

export interface PersistUploadedContentInput {
	content: string;
	tags: string[];
	title?: string;
	type: UploadContentType;
	userId: string;
}

export interface StorageDelta {
	size: number;
	updateFileCount?: boolean;
}

export interface UploadHandlerDeps {
	ctx: Context;
	persistContent: (input: PersistUploadedContentInput) => Promise<Content>;
	trackStorage: (userId: string, deltas: StorageDelta[]) => Promise<void>;
}
