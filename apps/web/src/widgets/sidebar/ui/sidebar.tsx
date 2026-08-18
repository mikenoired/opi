import { ConfiguredAppSidebar } from "@monolyth/features/app-shell";
import { useI18n } from "@monolyth/i18n";
import { useCallback } from "react";

import { getSettingsHref } from "@/features/settings/lib/settings-modal-url";
import { DEFAULT_SETTINGS_TAB, SETTINGS_QUERY_PARAM } from "@/features/settings/model/settings-tabs";
import { webRuntime } from "@/platform/web-runtime";
import { useDashboard } from "@/shared/lib/dashboard-context";
import { usePathname, useRouter, useSearchParams } from "@/shared/router/navigation";

export default function Sidebar() {
	const { openAddDialog } = useDashboard();
	const pathname = usePathname();
	const router = useRouter();
	const searchParams = useSearchParams();
	const { t } = useI18n();

	const preloadAddContentDialog = useCallback(() => {
		import("@/widgets/modals/editor/add-content-modal");
	}, []);

	return (
		<ConfiguredAppSidebar
			activeId={searchParams.has(SETTINGS_QUERY_PARAM) ? "settings" : undefined}
			activeRoute={
				pathname === "/graph"
					? "graph"
					: pathname === "/tags" || pathname.startsWith("/tags/")
						? "tags"
						: "dashboard"
			}
			capabilities={webRuntime.services.capabilities}
			items={webRuntime.configuration.navigation}
			labels={{
				add: t("library.add"),
				dashboard: t("library.title"),
				graph: t("library.graph"),
				settings: t("library.settings"),
				tags: t("library.tags"),
			}}
			onCommand={(command) => {
				if (command === "content.add") openAddDialog();
				if (command === "settings.open")
					router.push(getSettingsHref(pathname, searchParams, DEFAULT_SETTINGS_TAB));
			}}
			onItemHover={(id) => {
				if (id === "add") preloadAddContentDialog();
			}}
			onNavigate={(route) => {
				if (route === "dashboard") router.push("/");
				if (route === "tags") router.push("/tags");
				if (route === "graph") router.push("/graph");
			}}
		/>
	);
}
