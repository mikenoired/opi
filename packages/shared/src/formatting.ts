/**
 * Format size from bytes to human-readable format
 * @param bytes Size in bytes
 * @param options Configuration options
 * @param options.precision Number of decimal places (default: 1)
 * @param options.binary Use binary units (1024) vs decimal (1000) (default: true)
 * @param options.locale Locale for number formatting (default: 'en-US')
 * @returns Formatted size string
 */
export function formatSize(
	bytes: number,
	options: {
		precision?: number;
		binary?: boolean;
		locale?: string;
	} = {}
): string {
	const { precision = 1, binary = true, locale = "en-US" } = options;

	if (bytes === 0) return "0 B";
	if (bytes < 0) return "Invalid size";

	const base = binary ? 1024 : 1000;
	const units = binary ? ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] : ["B", "KB", "MB", "GB", "TB", "PB"];

	const unitIndex = Math.floor(Math.log(bytes) / Math.log(base));
	const clampedIndex = Math.min(unitIndex, units.length - 1);

	if (clampedIndex === 0) {
		return `${bytes} B`;
	}

	const size = bytes / base ** clampedIndex;
	const formattedSize = size.toLocaleString(locale, {
		minimumFractionDigits: 0,
		maximumFractionDigits: precision,
	});

	return `${formattedSize} ${units[clampedIndex]}`;
}
