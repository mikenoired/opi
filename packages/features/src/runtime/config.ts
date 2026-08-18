import type { UserPreferences } from "@monolyth/shared/preferences";

/** Visual icon names are resolved by shared UI, so platform configs never render JSX. */
export type AppIcon =
	| "add"
	| "ai"
	| "appearance"
	| "cloud"
	| "graph"
	| "home"
	| "localStorage"
	| "media"
	| "settings"
	| "sync"
	| "tags";

/** Stable route IDs let Web and Desktop choose history implementations independently. */
export type AppRouteId = "dashboard" | "graph" | "landing" | "tag" | "tags";

export type AppCapability =
	| "account"
	| "ai"
	| "cloud-storage"
	| "local-storage"
	| "media-import"
	| "sync"
	| "system-integration";

export interface CapabilitySnapshot {
	enabled: readonly AppCapability[];
}

/**
 * A serializable visibility expression. It deliberately has no callback or
 * ReactNode escape hatch: extensions must remain configuration, not copied UI.
 */
export type VisibilityCondition =
	| { all: VisibilityCondition[] }
	| { any: VisibilityCondition[] }
	| { capability: AppCapability }
	| { not: VisibilityCondition }
	| { value: boolean };

export interface NavigationItemConfig {
	command?: string;
	icon: AppIcon;
	id: string;
	label: string;
	route?: AppRouteId;
	variant?: "action" | "navigation";
	when?: VisibilityCondition;
}

export interface SettingsTabConfig {
	groups: SettingsGroupConfig[];
	icon: AppIcon;
	id: string;
	label: string;
	order?: number;
	when?: VisibilityCondition;
}

export interface SettingsGroupConfig {
	controls: SettingsControlConfig[];
	description?: string;
	id: string;
	title?: string;
	when?: VisibilityCondition;
}

export type SettingsControlConfig =
	| SettingsActionControl
	| SettingsInfoControl
	| SettingsRadioControl
	| SettingsStatControl
	| SettingsToggleControl;

export interface SettingsControlBase {
	description?: string;
	id: string;
	label: string;
	when?: VisibilityCondition;
}

export interface SettingsActionControl extends SettingsControlBase {
	command: string;
	kind: "action";
	variant?: "danger" | "primary" | "secondary";
}

export interface SettingsInfoControl extends SettingsControlBase {
	kind: "info";
}

export interface SettingsRadioControl extends SettingsControlBase {
	kind: "radio";
	options: Array<{ label: string; value: string }>;
	preference: keyof UserPreferences;
}

export interface SettingsStatControl extends SettingsControlBase {
	kind: "stat";
	valueKey: string;
}

export interface SettingsToggleControl extends SettingsControlBase {
	kind: "toggle";
	preference: keyof UserPreferences;
}

export interface AppConfiguration {
	navigation: NavigationItemConfig[];
	settings: SettingsTabConfig[];
}

/** Canonical product navigation. Platforms may only replace labels or add declarative extensions. */
export const commonAppConfiguration: AppConfiguration = {
	navigation: [
		{ command: "content.add", icon: "add", id: "add", label: "Add", variant: "action" },
		{ icon: "home", id: "dashboard", label: "Home", route: "dashboard" },
		{ icon: "tags", id: "tags", label: "Tags", route: "tags" },
		{ icon: "graph", id: "graph", label: "Graph", route: "graph" },
		{ command: "settings.open", icon: "settings", id: "settings", label: "Settings" },
	],
	settings: [
		{ groups: [], icon: "settings", id: "general", label: "General", when: { capability: "account" } },
		{
			groups: [],
			icon: "appearance",
			id: "appearance",
			label: "Appearance",
		},
		{ groups: [], icon: "media", id: "media", label: "Media" },
	],
};

/** Common configuration plus a platform extension, merged by stable IDs. */
export function mergeAppConfiguration(
	common: AppConfiguration,
	extension: Partial<AppConfiguration>
): AppConfiguration {
	return {
		navigation: mergeById(common.navigation, extension.navigation),
		settings: mergeById(common.settings, extension.settings).sort(
			(left, right) => (left.order ?? 0) - (right.order ?? 0)
		),
	};
}

export function isVisible(
	condition: VisibilityCondition | undefined,
	capabilities: CapabilitySnapshot
): boolean {
	if (!condition) return true;
	if ("value" in condition) return condition.value;
	if ("capability" in condition) return capabilities.enabled.includes(condition.capability);
	if ("all" in condition) return condition.all.every((entry) => isVisible(entry, capabilities));
	if ("any" in condition) return condition.any.some((entry) => isVisible(entry, capabilities));
	return !isVisible(condition.not, capabilities);
}

function mergeById<T extends { id: string }>(common: T[], extension: T[] | undefined): T[] {
	const entries = new Map(common.map((entry) => [entry.id, entry]));
	for (const entry of extension ?? []) entries.set(entry.id, entry);
	return [...entries.values()];
}
