import { ContentFilterBar } from "@synapse/features";
import type { Content } from "@synapse/shared/schemas";

import { useDashboard } from "@/shared/lib/dashboard-context";
import { useI18n } from "@/shared/lib/i18n";

interface ContentFilterProps {
	availableContentTypes: Content["type"][];
	onClearContentTypes: () => void;
	onToggleContentType: (type: Content["type"]) => void;
	searchQuery: string;
	selectedContentTypes: Content["type"][];
	setSearchQuery: (query: string) => void;
}

export function ContentFilter(props: ContentFilterProps) {
	const { setTriggerSearchFocus } = useDashboard();
	const { searchPlaceholder, t } = useI18n();
	return (
		<ContentFilterBar
			availableTypes={props.availableContentTypes}
			searchQuery={props.searchQuery}
			selectedContentTypes={props.selectedContentTypes}
			setSearchQuery={props.setSearchQuery}
			onClearContentTypes={props.onClearContentTypes}
			onToggleContentType={props.onToggleContentType}
			onRegisterSearchFocus={setTriggerSearchFocus}
			labels={{
				aria: t("search.aria"),
				clear: t("clearFilters"),
				placeholder: searchPlaceholder,
				types: {
					audio: t("audio"),
					doc: t("documents"),
					link: t("link"),
					media: t("media"),
					note: t("note"),
					todo: t("todo"),
				},
			}}
		/>
	);
}
