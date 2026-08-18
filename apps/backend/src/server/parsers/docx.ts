import mammoth from "mammoth";

import type { ParsedDocument, ParserOptions } from "./types";

export async function parseDOCX(buffer: Buffer, options: ParserOptions = {}): Promise<ParsedDocument> {
	try {
		// Извлекаем HTML с форматированием
		const htmlResult = await mammoth.convertToHtml({ buffer });

		const content = htmlResult.value || "";
		const title = extractTitleFromHTML(content) || "DOCX Document";

		// Обрабатываем изображения
		const images = await processDocumentImages(htmlResult.messages, options);

		return {
			type: "docx",
			title,
			content: content.trim(),
			thumbnailBase64: options.extractThumbnail ? await generateDOCXThumbnail(buffer) : undefined,
			images,
		};
	} catch (error) {
		throw new Error(`Failed to parse DOCX: ${error instanceof Error ? error.message : "Unknown error"}`);
	}
}

function extractTitleFromHTML(html: string): string | null {
	// Извлекаем текст из HTML и ищем заголовок
	const textContent = html
		.replace(/<[^>]*>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	const lines = textContent.split("\n").filter((line) => line.trim().length > 0);

	if (lines.length === 0) return null;

	// Ищем строку, которая выглядит как заголовок (короткая, без точек в конце)
	for (const line of lines.slice(0, 5)) {
		const trimmed = line.trim();
		if (trimmed.length > 3 && trimmed.length < 100 && !trimmed.endsWith(".")) {
			return trimmed;
		}
	}

	return null;
}

async function processDocumentImages(
	messages: any[],
	_options: ParserOptions
): Promise<Array<{ id: string; url: string; base64?: string }>> {
	const images: Array<{ id: string; url: string; base64?: string }> = [];

	// Извлекаем изображения из сообщений mammoth
	for (const message of messages) {
		if (message.type === "image" && message.image) {
			try {
				const imageBuffer = message.image.buffer;
				const imageId = `doc-image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

				let base64: string | undefined;
				if (imageBuffer.length < 100000) {
					base64 = `data:image/png;base64,${imageBuffer.toString("base64")}`;
				}

				const imageUrl = base64 || `data:image/png;base64,${imageBuffer.toString("base64")}`;

				images.push({
					id: imageId,
					url: imageUrl,
					base64,
				});
			} catch {
				continue;
			}
		}
	}

	return images;
}

async function generateDOCXThumbnail(_buffer: Buffer): Promise<string | undefined> {
	try {
		return undefined;
	} catch {
		return undefined;
	}
}
