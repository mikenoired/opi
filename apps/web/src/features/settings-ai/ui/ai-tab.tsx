import { AiSettingsPanel } from "@synapse/features";

import { api } from "@/shared/api/hooks";

export default function AiTab() {
	const query = api.ai.getUsageOverview.useQuery();
	return <AiSettingsPanel data={query.data} isError={query.isError} isLoading={query.isLoading} />;
}
