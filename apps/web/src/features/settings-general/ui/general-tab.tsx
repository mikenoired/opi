import { AccountSettingsPanel } from "@synapse/features";
import { useState } from "react";

import { api } from "@/shared/api/hooks";
import { useAuth } from "@/shared/lib/auth-context";
import { useI18n } from "@/shared/lib/i18n";

export default function GeneralTab() {
	const { data: user, isLoading } = api.user.getUser.useQuery();
	const { signOut } = useAuth();
	const { locale, t } = useI18n();
	const [isSigningOut, setIsSigningOut] = useState(false);
	return (
		<AccountSettingsPanel
			isLoading={isLoading}
			isSigningOut={isSigningOut || false}
			locale={locale}
			onSignOut={async () => {
				setIsSigningOut(true);
				await signOut();
			}}
			strings={{
				createdWithUs: (date) => t("createdWithUs", { date }),
				noDate: t("noDate"),
				sessionDescription: t("session.description"),
				sessionSignOut: t("session.signOut"),
				sessionSigningOut: t("session.signingOut"),
				sessionTitle: t("session.title"),
			}}
			user={user}
		/>
	);
}
