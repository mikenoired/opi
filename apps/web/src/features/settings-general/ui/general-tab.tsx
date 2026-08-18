import { AccountSettingsPanel, ConfirmDialog } from "@monolyth/features";
import { useI18n } from "@monolyth/i18n";
import { Button } from "@monolyth/ui/components";
import { useState } from "react";

import { api } from "@/shared/api/hooks";
import { useAuth } from "@/shared/lib/auth-context";

export default function GeneralTab() {
	const { data: user, isLoading } = api.user.getUser.useQuery();
	const { signOut } = useAuth();
	const { t } = useI18n();
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const deleteAccount = api.user.deleteAccount.useMutation();
	return (
		<>
			<AccountSettingsPanel
				isLoading={isLoading}
				isSigningOut={isSigningOut || false}
				onSignOut={async () => {
					setIsSigningOut(true);
					await signOut();
				}}
				user={user}
			/>
			<div className="mt-8 border-t pt-6">
				<h2 className="text-sm font-medium text-destructive">{t("accountDelete.title")}</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("accountDelete.description")}</p>
				<Button className="mt-4 bg-destructive hover:bg-destructive/90" onClick={() => setDeleteOpen(true)}>
					{t("accountDelete.action")}
				</Button>
			</div>
			<ConfirmDialog
				cancelText={t("library.cancel")}
				confirmText={t("accountDelete.confirm")}
				description={t("accountDelete.confirmDescription")}
				loading={deleteAccount.isPending}
				onConfirm={async () => {
					await deleteAccount.mutateAsync(undefined);
					await signOut();
				}}
				onOpenChange={setDeleteOpen}
				open={deleteOpen}
				title={t("accountDelete.confirmTitle")}
			/>
		</>
	);
}
