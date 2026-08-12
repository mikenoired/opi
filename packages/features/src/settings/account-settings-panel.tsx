import type { CurrentUser } from "@synapse/api";
import { useI18n } from "@synapse/i18n";
import { Button, Skeleton } from "@synapse/ui/components";
import { CalendarDays, LogOutIcon, Mail } from "lucide-react";
import type { ReactNode } from "react";

export interface AccountSettingsPanelProps {
	isLoading?: boolean;
	isSigningOut?: boolean;
	onSignOut: () => void;
	user: CurrentUser | null | undefined;
	synapseSync?: ReactNode;
}

export function AccountSettingsPanel({
	isLoading = false,
	isSigningOut = false,
	onSignOut,
	user,
	synapseSync,
}: AccountSettingsPanelProps) {
	const { t, locale } = useI18n();
	if (isLoading) return <AccountSettingsSkeleton />;
	return (
		<div className="space-y-5 py-1">
			{user && (
				<div className="flex flex-wrap gap-3">
					<div className="inline-flex items-center gap-3 rounded-full bg-muted px-3 py-2 align-middle text-sm text-foreground">
						<Mail className="size-4" />
						<span className="truncate text-sm font-medium text-foreground">{user?.email}</span>
					</div>
					<div className="inline-flex items-center gap-2 rounded-full bg-muted px-3.5 py-2 text-sm text-foreground">
						<CalendarDays className="size-4 text-muted-foreground" />
						<span>
							{formatRegistrationDate(
								user?.createdAt,
								locale,
								(date) => t("account.createdWithUs", { date }),
								t("account.noDate")
							)}
						</span>
					</div>
				</div>
			)}
			<div className="flex items-center justify-between gap-4">
				<div>
					<h2 className="text-sm font-medium">{t("account.session.title")}</h2>
					<p className="mt-1 text-sm text-muted-foreground">{t("account.session.description")}</p>
				</div>
				<Button variant="primary" leadingIcon={LogOutIcon} disabled={isSigningOut} onClick={onSignOut}>
					{isSigningOut ? t("account.session.signingOut") : t("account.session.signOut")}
				</Button>
			</div>
			{synapseSync}
		</div>
	);
}

function AccountSettingsSkeleton() {
	return (
		<div className="space-y-4 py-1">
			<Skeleton className="h-14 w-full rounded-2xl" />
			<Skeleton className="h-10 w-52 rounded-full" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-4 w-full max-w-md" />
			</div>
			<Skeleton className="h-[76px] w-full rounded-3xl" />
		</div>
	);
}

function formatRegistrationDate(
	date: Date | string | null | undefined,
	locale: string,
	template: (date: string) => string,
	noDateLabel: string
) {
	if (!date) return noDateLabel;
	const formatted = new Intl.DateTimeFormat(locale, {
		day: "numeric",
		month: "long",
		year: "numeric",
	}).format(new Date(date));
	return template(formatted);
}
