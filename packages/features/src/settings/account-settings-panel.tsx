import type { CurrentUser } from "@monolyth/api";
import { useI18n } from "@monolyth/i18n";
import { Button, Skeleton } from "@monolyth/ui/components";
import { CalendarDays, LogInIcon, LogOutIcon, Mail } from "lucide-react";
import type { ReactNode } from "react";

export interface AccountSettingsPanelProps {
	connectionNotice?: string;
	isConnectingAccount?: boolean;
	isLoading?: boolean;
	isSigningOut?: boolean;
	onSignOut: () => void;
	onConnectAccount?: () => void;
	user: CurrentUser | null | undefined;
	monolythSync?: ReactNode;
}

export function AccountSettingsPanel({
	connectionNotice,
	isConnectingAccount = false,
	isLoading = false,
	isSigningOut = false,
	onSignOut,
	onConnectAccount,
	user,
	monolythSync,
}: AccountSettingsPanelProps) {
	const { t, locale } = useI18n();
	if (isLoading) return <AccountSettingsSkeleton />;
	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-xl font-semibold tracking-tight">{t("account.title")}</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("account.description")}</p>
			</div>
			{connectionNotice && (
				<p role="status" className="text-sm text-primary">
					{connectionNotice}
				</p>
			)}
			{user && (
				<div className="flex flex-wrap gap-3">
					<div className="inline-flex items-center gap-3 rounded-full bg-muted px-3 py-2 align-middle text-sm text-foreground">
						<Mail className="size-4" />
						<span className="truncate text-sm font-medium text-foreground">{user?.email}</span>
					</div>
					<div className="inline-flex items-center gap-2 rounded-full bg-muted px-3.5 py-2 text-sm text-foreground">
						<CalendarDays className="size-4 text-muted-foreground" />
						<span className="text-sm font-medium text-foreground">
							{formatRegistrationDate(
								user?.createdAt,
								locale,
								(date) => t("account.createdWithUs", { date }),
								t("account.noDate")
							)}
						</span>
					</div>
					<div className="inline-flex items-center gap-2 rounded-full bg-muted px-3.5 py-2 text-sm text-foreground">
						<span className="text-sm font-medium text-foreground">
							{user?.plan ? t("sync.withPlan", { plan: user.plan }) : t("sync.unavailable")}
						</span>
					</div>
				</div>
			)}
			<div className="flex items-center justify-between gap-4">
				<div>
					<h2 className="text-sm font-medium">{t("account.session.title")}</h2>
					<p className="mt-1 text-sm text-muted-foreground">{t("account.session.description")}</p>
				</div>
				{user ? (
					<Button variant="primary" leadingIcon={LogOutIcon} disabled={isSigningOut} onClick={onSignOut}>
						{isSigningOut ? t("account.session.signingOut") : t("account.session.signOut")}
					</Button>
				) : onConnectAccount ? (
					<Button
						variant="primary"
						leadingIcon={LogInIcon}
						disabled={isConnectingAccount}
						onClick={onConnectAccount}>
						{isConnectingAccount ? t("account.session.connecting") : t("account.session.connect")}
					</Button>
				) : null}
			</div>
			{monolythSync}
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
