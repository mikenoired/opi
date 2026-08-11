import { ConfiguredAppSidebar } from "@synapse/features/app-shell";
import { useCallback } from "react";

import { getSettingsHref } from "@/features/settings/lib/settings-modal-url";
import { DEFAULT_SETTINGS_TAB, SETTINGS_QUERY_PARAM } from "@/features/settings/model/settings-tabs";
import { webRuntime } from "@/platform/web-runtime";
import { useDashboard } from "@/shared/lib/dashboard-context";
import { useI18n } from "@/shared/lib/i18n";
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
				add: t("add"),
				dashboard: t("home"),
				graph: t("graph"),
				settings: t("settings"),
				tags: t("tags"),
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
