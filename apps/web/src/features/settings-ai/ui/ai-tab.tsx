import { AiSettingsPanel } from "@synapse/features";

import { api } from "@/shared/api/hooks";
import { useI18n } from "@/shared/lib/i18n";

/** Web supplies the API query; the AI usage visual is shared. */
export default function AiTab() {
	const query = api.ai.getUsageOverview.useQuery();
	const { locale, t } = useI18n();
	return (
		<AiSettingsPanel
			data={query.data}
			isError={query.isError}
			isLoading={query.isLoading}
			locale={locale}
			strings={{
				cost: t("aiUsage.cost"),
				error: t("aiUsage.error"),
				failures: t("aiUsage.failures"),
				latency: t("aiUsage.latency"),
				models: t("aiUsage.models"),
				noRequests: t("aiUsage.noRequests"),
				planDescription: t("aiUsage.planDescription"),
				requests: t("aiUsage.requests"),
				successRate: t("aiUsage.successRate"),
				thisMonth: (month) => t("aiUsage.thisMonth", { month }),
				tokens: t("aiUsage.tokens"),
				tokensShort: t("aiUsage.tokensShort"),
			}}
		/>
	);
}
