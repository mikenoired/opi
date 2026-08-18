import { ContentFilterBar } from "@monolyth/features";
import { useI18n } from "@monolyth/i18n";
import type { Content } from "@monolyth/shared/schemas";

import { useDashboard } from "@/shared/lib/dashboard-context";

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
				aria: t("library.searchAria"),
				clear: t("library.clearFilters"),
				placeholder: searchPlaceholder,
				types: {
					audio: t("library.types.audio"),
					doc: t("library.types.doc"),
					link: t("library.types.link"),
					media: t("library.types.media"),
					note: t("library.types.note"),
					todo: t("library.types.todo"),
				},
			}}
		/>
	);
}
