import type { AiUsage } from "@synapse/api";
import { useI18n } from "@synapse/i18n";
import { isUnlimited } from "@synapse/shared/plans";
import { Skeleton } from "@synapse/ui/components";
import { Activity, Bot, CircleDollarSign, Gauge, Timer } from "lucide-react";

import { PixelSparkles } from "../components/pixel-sparkles";

export interface AiSettingsPanelProps {
	data?: AiUsage;
	isError?: boolean;
	isLoading?: boolean;
}

export function AiSettingsPanel({ data, isError = false, isLoading = false }: AiSettingsPanelProps) {
	const { t, locale } = useI18n();
	if (isLoading) return <AiSettingsSkeleton />;
	if (isError || !data)
		return (
			<div className="rounded-[1.75rem] bg-muted p-5 text-sm text-muted-foreground">{t("ai.error")}</div>
		);

	const { limits, usage } = data;
	const successRate = usage.requests ? Math.round((usage.successfulRequests / usage.requests) * 100) : 0;
	const month = new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(data.period.start));
	return (
		<div className="space-y-4 py-1">
			<div>
				<h2 className="text-xl font-semibold tracking-tight">{t("ai.title")}</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("ai.description")}</p>
			</div>
			<section className="relative overflow-hidden rounded-[1.75rem] bg-primary p-5 text-primary-foreground">
				<PixelSparkles className="opacity-90" pixelSize={5} speed={0.4} fireSpeed={1.8} density={1.1} />
				<div className="relative z-10 flex items-start justify-between gap-4">
					<div>
						<h2 className="text-2xl font-semibold tracking-tight">{data.planLabel}</h2>
						<p className="mt-1 text-sm text-primary-foreground/65">{t("ai.planDescription")}</p>
					</div>
				</div>
			</section>
			<section className="rounded-[1.75rem] bg-muted p-5">
				<div className="mb-5 flex items-center gap-2 text-sm font-medium">
					<Gauge className="size-4 text-muted-foreground" />
					{t("ai.thisMonth", { month })}
				</div>
				<div className="space-y-5">
					<UsageBar
						label={t("ai.tokens")}
						value={usage.totalTokens}
						limit={limits.aiTokensPerMonth}
						locale={locale}
					/>
					<UsageBar
						label={t("ai.requests")}
						value={usage.requests}
						limit={limits.aiRequestsPerMonth}
						locale={locale}
					/>
				</div>
			</section>
			<div className="grid grid-cols-2 gap-3">
				<Metric icon={Activity} label={t("ai.successRate")} value={`${successRate}%`} />
				<Metric icon={CircleDollarSign} label={t("ai.cost")} value={`$${usage.totalCostUsd.toFixed(4)}`} />
				<Metric
					icon={Timer}
					label={t("ai.latency")}
					value={usage.averageLatencyMs === null ? "—" : `${usage.averageLatencyMs} ms`}
				/>
				<Metric icon={Bot} label={t("ai.failures")} value={formatTokens(usage.failedRequests, locale)} />
			</div>
			<section className="rounded-[1.75rem] bg-muted p-5">
				<div className="mb-4 flex items-center justify-between gap-3">
					<div className="text-sm font-medium">{t("ai.models")}</div>
					<div className="text-xs text-muted-foreground">
						{data.models.length ? `${data.models[0].provider} · ${data.models[0].model}` : t("ai.noRequests")}
					</div>
				</div>
				{data.models.length ? (
					<div className="space-y-3">
						{data.models.map((model) => (
							<div
								key={`${model.provider}:${model.model}`}
								className="flex items-center justify-between gap-3 text-sm">
								<div className="min-w-0 truncate text-foreground">{model.model}</div>
								<div className="shrink-0 text-muted-foreground">
									{formatCompact(model.tokens, locale)} {t("ai.tokensShort")}
								</div>
							</div>
						))}
					</div>
				) : (
					<p className="text-sm text-muted-foreground">{t("ai.noRequests")}</p>
				)}
			</section>
		</div>
	);
}

function AiSettingsSkeleton() {
	return (
		<div className="space-y-4 py-1">
			<Skeleton className="h-32 w-full rounded-[1.75rem]" />
			<Skeleton className="h-44 w-full rounded-[1.75rem]" />
			<Skeleton className="h-28 w-full rounded-[1.75rem]" />
		</div>
	);
}
function formatCompact(value: number, locale: string) {
	return new Intl.NumberFormat(locale, { maximumFractionDigits: 1, notation: "compact" }).format(value);
}
function formatTokens(value: number, locale: string) {
	return new Intl.NumberFormat(locale).format(value);
}
function UsageBar({
	label,
	limit,
	locale,
	value,
}: {
	label: string;
	limit: number;
	locale: string;
	value: number;
}) {
	const unlimited = isUnlimited(limit);
	const percent = unlimited ? 0 : Math.min(100, Math.round((value / limit) * 100));
	return (
		<div className="space-y-2">
			<div className="flex items-baseline justify-between gap-3 text-sm">
				<span className="text-muted-foreground">{label}</span>
				<span className="font-medium text-foreground">
					{formatCompact(value, locale)} {unlimited ? "∞" : `/ ${formatCompact(limit, locale)}`}
				</span>
			</div>
			<div className="h-2 overflow-hidden rounded-full bg-primary/15">
				<div
					className="h-full rounded-full bg-primary transition-[width]"
					style={{ width: `${unlimited ? 12 : Math.max(value ? 2 : 0, percent)}%` }}
				/>
			</div>
		</div>
	);
}
function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
	return (
		<div className="rounded-2xl bg-background/70 px-4 py-3">
			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<Icon className="size-3.5" />
				<span>{label}</span>
			</div>
			<div className="mt-1 text-lg font-semibold tracking-tight text-foreground">{value}</div>
		</div>
	);
}
