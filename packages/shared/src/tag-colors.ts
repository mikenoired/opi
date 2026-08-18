export const TAG_COLOR_PALETTE = [
	"#df5871",
	"#df8041",
	"#c89a27",
	"#86a63a",
	"#3d9d68",
	"#29988d",
	"#3296ae",
	"#4c7fd1",
	"#696bd0",
	"#9163bd",
	"#bd5b9b",
	"#d15e70",
] as const;

export function getTagColor(color?: number | null) {
	if (!color || color < 1) return undefined;
	return TAG_COLOR_PALETTE[color - 1];
}
