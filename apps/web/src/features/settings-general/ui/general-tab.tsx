import { AccountSettingsPanel, ConfirmDialog } from "@synapse/features";
import { Button } from "@synapse/ui/components";
import { useState } from "react";

import { api } from "@/shared/api/hooks";
import { useAuth } from "@/shared/lib/auth-context";
import { useI18n } from "@/shared/lib/i18n";

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
				<h2 className="text-sm font-medium text-destructive">{t("account.delete.title")}</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("account.delete.description")}</p>
				<Button className="mt-4 bg-destructive hover:bg-destructive/90" onClick={() => setDeleteOpen(true)}>
					{t("account.delete.action")}
				</Button>
			</div>
			<ConfirmDialog
				cancelText={t("cancel")}
				confirmText={t("account.delete.confirm")}
				description={t("account.delete.confirmDescription")}
				loading={deleteAccount.isPending}
				onConfirm={async () => {
					await deleteAccount.mutateAsync(undefined);
					await signOut();
				}}
				onOpenChange={setDeleteOpen}
				open={deleteOpen}
				title={t("account.delete.confirmTitle")}
			/>
		</>
	);
}
