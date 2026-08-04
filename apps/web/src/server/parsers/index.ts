import { parseCSV } from "./csv";
import { parseDOCX } from "./docx";
import { parseEPUB } from "./epub";
import { parsePDF } from "./pdf";
import type { ParsedDocument, ParserOptions } from "./types";
import { parseXLSX } from "./xlsx";

export type { SupportedFileType } from "@synapse/shared/file-types";

export interface FileInfo {
	name: string;
	type: string;
	size: number;
	buffer: Buffer;
}

export async function parseFile(file: FileInfo, options: ParserOptions = {}): Promise<ParsedDocument> {
	const fileType = getFileType(file.name, file.type);

	switch (fileType) {
		case "pdf":
			return await parsePDF(file.buffer, options);
		case "docx":
			return await parseDOCX(file.buffer, options);
		case "epub":
			return await parseEPUB(file.buffer, options);
		case "xlsx":
			return await parseXLSX(file.buffer, options);
		case "csv":
			return await parseCSV(file.buffer, options);
		default:
			throw new Error(`Unsupported file type: ${fileType}`);
	}
}

import { getFileType } from "@synapse/shared/file-types";
