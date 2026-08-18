import type { ParsedDocument, ParserOptions } from "./types";

export async function parsePDF(buffer: Buffer, options: ParserOptions = {}): Promise<ParsedDocument> {
	try {
		const pdfjsLib = await import("pdfjs-dist");

		pdfjsLib.GlobalWorkerOptions.workerSrc = "";

		const loadingTask = pdfjsLib.getDocument({
			data: buffer,
			useSystemFonts: true,
		});

		const pdf = await loadingTask.promise;
		let content = "";

		for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
			const page = await pdf.getPage(pageNum);
			const textContent = await page.getTextContent();

			const pageText = textContent.items.map((item: any) => item.str).join(" ");

			content += pageText + "\n\n";
		}

		const title = extractTitleFromContent(content) || "PDF Document";

		return {
			type: "pdf",
			title,
			content: content.trim(),
			thumbnailBase64: options.extractThumbnail ? await generatePDFThumbnail(buffer) : undefined,
		};
	} catch (error) {
		throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : "Unknown error"}`);
	}
}

function extractTitleFromContent(content: string): string | null {
	const lines = content.split("\n").filter((line) => line.trim().length > 0);

	if (lines.length === 0) return null;

	for (const line of lines.slice(0, 5)) {
		const trimmed = line.trim();
		if (trimmed.length > 3 && trimmed.length < 100 && !trimmed.endsWith(".")) {
			return trimmed;
		}
	}

	return null;
}

async function generatePDFThumbnail(_buffer: Buffer): Promise<string | undefined> {
	try {
		return undefined;
	} catch {
		return undefined;
	}
}
