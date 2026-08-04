import { Buffer } from "node:buffer";
import * as crypto from "node:crypto";
import * as path from "node:path";

export interface FileValidationConfig {
	maxFileSize: number; // in bytes
	allowedExtensions: string[];
	allowedMimeTypes: string[];
	scanForMalware: boolean;
	checkMagicBytes: boolean;
	maxFilenameLength: number;
}

export interface ValidationResult {
	isValid: boolean;
	errors: string[];
	warnings: string[];
	fileHash: string;
	detectedMimeType?: string;
}

const DEFAULT_CONFIG: FileValidationConfig = {
	maxFileSize: 10 * 1024 * 1024, // 10MB
	allowedExtensions: [
		".jpg",
		".jpeg",
		".png",
		".gif",
		".webp",
		".pdf",
		".txt",
		".docx",
		".mp4",
		".mov",
		".avi",
		".mkv",
		".mp3",
		".m4a",
		".aac",
		".flac",
		".wav",
		".ogg",
		".opus",
	],
	allowedMimeTypes: [
		"image/jpeg",
		"image/png",
		"image/gif",
		"image/webp",
		"application/pdf",
		"text/plain",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"video/mp4",
		"video/quicktime",
		"video/x-msvideo",
		"video/x-matroska",
		"audio/mpeg",
		"audio/mp4",
		"audio/x-m4a",
		"audio/aac",
		"audio/flac",
		"audio/wav",
		"audio/ogg",
		"audio/opus",
	],
	scanForMalware: true,
	checkMagicBytes: true,
	maxFilenameLength: 255,
};

const MAGIC_BYTES: Record<string, Buffer[]> = {
	"image/jpeg": [Buffer.from([0xff, 0xd8, 0xff])],
	"image/png": [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
	"image/gif": [
		Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]), // GIF87a
		Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), // GIF89a
	],
	"image/webp": [Buffer.from([0x52, 0x49, 0x46, 0x46])], // RIFF
	"application/pdf": [Buffer.from([0x25, 0x50, 0x44, 0x46])], // %PDF
	"text/plain": [], // text files don't have strict magic bytes
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
		Buffer.from([0x50, 0x4b, 0x03, 0x04]), // ZIP signature (DOCX based on ZIP)
	],
	"video/mp4": [Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32])], // mp4 ftyp
	"video/quicktime": [Buffer.from([0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20])], // mov ftyp
	"video/x-msvideo": [Buffer.from([0x52, 0x49, 0x46, 0x46])], // avi RIFF
	"video/x-matroska": [Buffer.from([0x1a, 0x45, 0xdf, 0xa3])], // mkv EBML
	"audio/mpeg": [Buffer.from([0x49, 0x44, 0x33]), Buffer.from([0xff, 0xfb])], // ID3 or MP3 frame
	"audio/mp4": [Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])], // mp4 ftyp
	"audio/x-m4a": [Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])],
	"audio/aac": [Buffer.from([0xff, 0xf1]), Buffer.from([0xff, 0xf9])], // ADTS
	"audio/flac": [Buffer.from([0x66, 0x4c, 0x61, 0x43])], // fLaC
	"audio/wav": [Buffer.from([0x52, 0x49, 0x46, 0x46])], // RIFF (WAVE)
	"audio/ogg": [Buffer.from([0x4f, 0x67, 0x67, 0x53])], // OggS
	"audio/opus": [Buffer.from([0x4f, 0x67, 0x67, 0x53])], // OggS (Opus in Ogg)
};

const MALWARE_PATTERNS = [
	Buffer.from("<?php", "utf8"),
	Buffer.from("<script", "utf8"),
	Buffer.from("javascript:", "utf8"),
	Buffer.from("eval(", "utf8"),
	Buffer.from("exec(", "utf8"),
	Buffer.from("shell_exec", "utf8"),
	Buffer.from("system(", "utf8"),
	Buffer.from("%3Cscript", "utf8"), // URL encoded <script
	Buffer.from("<!DOCTYPE html", "utf8"),
	Buffer.from("<html", "utf8"),
];

export function sanitizeFileName(fileName: string): string {
	// Remove dangerous characters and sequences
	return (
		fileName
			// eslint-disable-next-line no-control-regex
			.replace(/[<>:"|*?\\/\x00-\x1F]/g, "_")
			.replace(/\u202E/g, "") // Right-to-Left Override
			.replace(/\.+$/, "") // Remove dots at the end
			.replace(/^\.+/, "") // Remove dots at the beginning
			.substring(0, 255)
	); // Limit length
}

function detectMimeTypeByMagicBytes(file: Buffer): string | undefined {
	for (const [mimeType, signatures] of Object.entries(MAGIC_BYTES)) {
		if (signatures.length === 0) continue; // Skip types without magic bytes

		for (const signature of signatures) {
			if (file.subarray(0, signature.length).equals(signature)) {
				return mimeType;
			}
		}
	}

	return undefined;
}

function scanForMalwarePatterns(file: Buffer): string[] {
	const foundPatterns: string[] = [];

	for (const pattern of MALWARE_PATTERNS) {
		if (file.includes(pattern)) {
			foundPatterns.push(`${pattern.toString("utf8").substring(0, 20)}...`);
		}
	}

	return foundPatterns;
}

function isPolyglotFile(file: Buffer): boolean {
	// Check if the file is of multiple types
	const detectedTypes: string[] = [];

	for (const [mimeType, signatures] of Object.entries(MAGIC_BYTES)) {
		if (signatures.length === 0) continue;

		for (const signature of signatures) {
			if (file.subarray(0, signature.length).equals(signature)) {
				detectedTypes.push(mimeType);
				break;
			}
		}
	}

	return detectedTypes.length > 1;
}

function hasEmbeddedExecutable(file: Buffer): boolean {
	// Check for embedded PE headers or other executable formats
	const peSignature = Buffer.from([0x4d, 0x5a]); // MZ
	const elfSignature = Buffer.from([0x7f, 0x45, 0x4c, 0x46]); // ELF

	// Search for signatures not only at the beginning of the file
	for (let i = 0; i < file.length - 4; i += 1024) {
		// Check every 1024 bytes
		const chunk = file.subarray(i, i + 4);
		if (chunk.subarray(0, 2).equals(peSignature) || chunk.equals(elfSignature)) {
			return true;
		}
	}

	return false;
}

function hasExcessiveMetadata(file: Buffer, contentType: string): boolean {
	// Simple heuristic for detecting excessive metadata
	if (contentType.startsWith("image/")) {
		// For images metadata usually makes up a small part
		const potentialMetadataSize = Math.min(file.length, 65536); // First 64KB
		const metadataRatio = potentialMetadataSize / file.length;

		return metadataRatio > 0.3; // If metadata makes up >30% of the file
	}

	return false;
}

function isValidUserId(userId: string): boolean {
	const userIdRegex = /^[\w-]{1,36}$/;
	return userIdRegex.test(userId);
}

export async function validateFile(
	file: Buffer,
	fileName: string,
	contentType: string,
	userId: string,
	config: Partial<FileValidationConfig> = {}
): Promise<ValidationResult> {
	const fullConfig = { ...DEFAULT_CONFIG, ...config };
	const errors: string[] = [];
	const warnings: string[] = [];

	const fileHash = crypto.createHash("sha256").update(file).digest("hex");

	try {
		// 1. Check file size
		if (file.length > fullConfig.maxFileSize) {
			errors.push(`File is too large: ${file.length} bytes (max: ${fullConfig.maxFileSize})`);
		}

		if (file.length === 0) {
			errors.push("File is empty");
		}

		// 2. Sanitize and check file name
		const sanitizedFileName = sanitizeFileName(fileName);
		if (sanitizedFileName !== fileName) {
			warnings.push("File name was changed for security reasons");
		}

		if (fileName.length > fullConfig.maxFilenameLength) {
			errors.push(
				`File name is too long: ${fileName.length} characters (max: ${fullConfig.maxFilenameLength})`
			);
		}

		// Check for forbidden characters
		// eslint-disable-next-line no-control-regex
		if (/[<>:"|*?\\/\x00-\x1F]/.test(fileName)) {
			errors.push("File name contains forbidden characters");
		}

		// Check for hidden extensions
		if (fileName.includes("\u202E")) {
			// Right-to-Left Override
			errors.push("Hidden file extension attempt detected");
		}

		// 3. Check file extension
		const fileExtension = path.extname(fileName.toLowerCase());
		if (!fullConfig.allowedExtensions.includes(fileExtension)) {
			errors.push(`Invalid file extension: ${fileExtension}`);
		}

		// 4. Check MIME type
		if (!fullConfig.allowedMimeTypes.includes(contentType)) {
			errors.push(`Invalid MIME type: ${contentType}`);
		}

		// 5. Check magic bytes
		let detectedMimeType: string | undefined;
		if (fullConfig.checkMagicBytes) {
			detectedMimeType = detectMimeTypeByMagicBytes(file);

			if (detectedMimeType && detectedMimeType !== contentType) {
				errors.push(
					`MIME type does not match file content. Expected: ${contentType}, detected: ${detectedMimeType}`
				);
			}

			if (!detectedMimeType && contentType !== "text/plain") {
				warnings.push("Failed to determine file type by magic bytes");
			}
		}

		// 6. Check for malicious code
		if (fullConfig.scanForMalware) {
			const malwareCheck = scanForMalwarePatterns(file);
			if (malwareCheck.length > 0) {
				errors.push(`Suspicious patterns detected: ${malwareCheck.join(", ")}`);
			}
		}

		// 7. Additional security checks

		// Check for polyglot files (files that are valid as multiple types)
		if (isPolyglotFile(file)) {
			errors.push("Polyglot file detected (potentially dangerous)");
		}

		// Check for embedded executable files
		if (hasEmbeddedExecutable(file)) {
			errors.push("Embedded executable code detected");
		}

		// Check for excessive metadata
		if (hasExcessiveMetadata(file, contentType)) {
			warnings.push("File contains excessive metadata");
		}

		// 8. Check userId for injections
		if (!isValidUserId(userId)) {
			errors.push("Invalid user ID");
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings,
			fileHash,
			detectedMimeType,
		};
	} catch (error) {
		errors.push(`Error checking file: ${error instanceof Error ? error.message : "Unknown error"}`);

		return {
			isValid: false,
			errors,
			warnings,
			fileHash,
		};
	}
}
