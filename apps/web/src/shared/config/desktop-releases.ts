export type DesktopPlatform = "linux" | "macos" | "windows";

export interface DesktopRelease {
	checksum?: string;
	label: string;
	platform: DesktopPlatform;
	signature?: string;
	url?: string;
	version?: string;
}

const releases: DesktopRelease[] = [
	{
		label: "macOS",
		platform: "macos",
		url: import.meta.env.VITE_DESKTOP_MACOS_URL,
		version: import.meta.env.VITE_DESKTOP_VERSION,
	},
	{
		label: "Windows",
		platform: "windows",
		url: import.meta.env.VITE_DESKTOP_WINDOWS_URL,
		version: import.meta.env.VITE_DESKTOP_VERSION,
	},
	{
		label: "Linux",
		platform: "linux",
		url: import.meta.env.VITE_DESKTOP_LINUX_URL,
		version: import.meta.env.VITE_DESKTOP_VERSION,
	},
];

export function getDesktopReleases(): DesktopRelease[] {
	return releases;
}

export function detectDesktopPlatform(userAgent = navigator.userAgent): DesktopPlatform | undefined {
	if (/Windows/i.test(userAgent)) return "windows";
	if (/Macintosh|Mac OS X/i.test(userAgent)) return "macos";
	if (/Linux/i.test(userAgent)) return "linux";
	return undefined;
}
