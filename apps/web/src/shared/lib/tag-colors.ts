import type { CSSProperties } from "react";

export { getTagColor, TAG_COLOR_PALETTE } from "@synapse/shared/tag-colors";

import { getTagColor } from "@synapse/shared/tag-colors";

export function getTagColorStyle(color?: number | null): CSSProperties | undefined {
	const value = getTagColor(color);
	if (!value) return undefined;

	return {
		"--tag-color": value,
		"backgroundColor": `${value}20`,
		"borderColor": `${value}58`,
	} as CSSProperties;
}

export function tagColorToPixi(color?: number | null) {
	const value = getTagColor(color);
	return value ? Number.parseInt(value.slice(1), 16) : undefined;
}
