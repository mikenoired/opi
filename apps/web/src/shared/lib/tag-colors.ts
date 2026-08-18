import type { CSSProperties } from "react";

export { getTagColor, TAG_COLOR_PALETTE } from "@monolyth/shared/tag-colors";

import { getTagColor } from "@monolyth/shared/tag-colors";

export function getTagColorStyle(color?: number | null): CSSProperties | undefined {
	const value = getTagColor(color);
	if (!value) return undefined;

	return {
		"--tag-color": value,
		"backgroundColor": `${value}20`,
		"borderColor": `${value}58`,
	} as CSSProperties;
}
