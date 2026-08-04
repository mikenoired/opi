import type { ParsedDocument, ParserOptions } from "./types";

export async function parseXLSX(buffer: Buffer, _options: ParserOptions = {}): Promise<ParsedDocument> {
	try {
		const XLSX = await import("xlsx");

		const workbook = XLSX.read(buffer, { type: "buffer" });

		let content = "";
		let title = workbook.Props?.Title || "XLSX Document";

		for (const sheetName of workbook.SheetNames) {
			const worksheet = workbook.Sheets[sheetName];
			const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

			content += `Лист: ${sheetName}\n`;

			for (const row of jsonData as any[][]) {
				if (row && row.length > 0) {
					const rowText = row
						.filter((cell) => cell !== null && cell !== undefined && cell !== "")
						.map((cell) => String(cell))
						.join(" | ");

					if (rowText.trim()) {
						content += rowText + "\n";
					}
				}
			}
			content += "\n";
		}

		return {
			type: "xlsx",
			title,
			content: content.trim(),
			thumbnailBase64: undefined,
		};
	} catch (error) {
		throw new Error(`Failed to parse XLSX: ${error instanceof Error ? error.message : "Unknown error"}`);
	}
}
