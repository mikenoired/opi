import type { ParsedDocument, ParserOptions } from "./types";

export async function parseEPUB(buffer: Buffer, options: ParserOptions = {}): Promise<ParsedDocument> {
	try {
		const { EPub } = await import("epub2");

		const epub = new EPub(buffer.toString("base64"));
		await epub.parse();

		let content = "";
		let title = epub.metadata?.title || "EPUB Document";

		const chapters = epub.flow || [];
		for (const chapter of chapters) {
			try {
				await new Promise<void>((resolve) => {
					epub.getChapter(chapter.id || "", (_error: unknown, text?: string) => {
						if (text) {
							const textContent = text
								.replace(/<[^>]*>/g, " ")
								.replace(/\s+/g, " ")
								.trim();
							content += textContent + "\n\n";
						}
						resolve();
					});
				});
			} catch {
				continue;
			}
		}

		if (options.extractThumbnail) {
			void options.extractThumbnail;
		}

		return {
			type: "epub",
			title,
			content: content.trim(),
			thumbnailBase64: undefined,
		};
	} catch (error) {
		throw new Error(`Failed to parse EPUB: ${error instanceof Error ? error.message : "Unknown error"}`);
	}
}
