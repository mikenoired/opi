export const editorImageTypes = ["image/gif", "image/jpeg", "image/png", "image/webp"];

export const editorImageMaxSize = 10 * 1024 * 1024;

const blockMarkdownPattern = /(^|\n)\s{0,3}(?:#{1,6}\s|>\s|[-+*]\s|\d+\.\s|```|~~~|(?:---|___|\*\*\*)\s*$)/m;
const inlineMarkdownPattern =
	/(?:\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|!?\[[^\]\n]+\]\([^)\n]+\))/;

export function looksLikeMarkdown(value: string): boolean {
	return blockMarkdownPattern.test(value) || inlineMarkdownPattern.test(value);
}

export interface SlashCommandOption {
	aliases: string[];
	label: string;
}

export function filterSlashCommands<T extends SlashCommandOption>(commands: T[], query: string): T[] {
	const normalized = query.trim().toLocaleLowerCase("ru");
	if (!normalized) return commands;
	return commands.filter((command) =>
		[command.label, ...command.aliases].some((value) => value.toLocaleLowerCase("ru").includes(normalized))
	);
}

export async function imageFilesToDataUrls(files: File[]): Promise<Array<{ alt: string; src: string }>> {
	const images: Array<{ alt: string; src: string }> = [];
	for (const file of files) {
		if (!editorImageTypes.includes(file.type)) throw new Error(`Неподдерживаемый формат: ${file.name}`);
		if (file.size > editorImageMaxSize) throw new Error(`Изображение ${file.name} превышает 10 МБ`);

		const src = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = () => reject(new Error(`Не удалось прочитать ${file.name}`));
			reader.readAsDataURL(file);
		});
		images.push({ alt: file.name, src });
	}
	return images;
}
