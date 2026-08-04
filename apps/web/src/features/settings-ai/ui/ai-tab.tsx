import { isUnlimited } from "@synapse/shared/plans";
import { Skeleton } from "@synapse/ui/components";
import { Activity, Bot, CircleDollarSign, Gauge, Timer } from "lucide-react";

import { api } from "@/shared/api/hooks";
import { useI18n } from "@/shared/lib/i18n";
import { PixelSparkles } from "@/shared/ui/pixel-sparkles";

function formatCompact(value: number, locale: string) {
	return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatTokens(value: number, locale: string) {
	return new Intl.NumberFormat(locale).format(value);
}

function UsageBar({
	label,
	value,
	limit,
	locale,
}: {
	label: string;
	value: number;
	limit: number;
	locale: string;
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

export default function AiTab() {
	const { data, isLoading, isError } = api.ai.getUsageOverview.useQuery();
	const { locale, t } = useI18n();

	if (isLoading) {
		return (
			<div className="space-y-4 py-1">
				<Skeleton className="h-32 w-full rounded-[1.75rem]" />
				<Skeleton className="h-44 w-full rounded-[1.75rem]" />
				<Skeleton className="h-28 w-full rounded-[1.75rem]" />
			</div>
		);
	}

	if (isError || !data) {
		return (
			<div className="rounded-[1.75rem] bg-muted p-5 text-sm text-muted-foreground">{t("aiUsage.error")}</div>
		);
	}

	const { usage, limits } = data;
	const successRate = usage.requests ? Math.round((usage.successfulRequests / usage.requests) * 100) : 0;
	const models = data.models.length ? data.models : [];
	const month = new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(data.period.start));

	return (
		<div className="space-y-4 py-1">
			<section className="relative overflow-hidden rounded-[1.75rem] bg-primary p-5 text-primary-foreground">
				<PixelSparkles className="opacity-90" pixelSize={5} speed={0.4} fireSpeed={1.8} density={1.1} />
				<div className="relative z-10 flex items-start justify-between gap-4">
					<div>
						<h2 className="text-2xl font-semibold tracking-tight">{data.planLabel}</h2>
						<p className="mt-1 text-sm text-primary-foreground/65">{t("aiUsage.planDescription")}</p>
					</div>
				</div>
			</section>

			<section className="rounded-[1.75rem] bg-muted p-5">
				<div className="mb-5 flex items-center gap-2 text-sm font-medium">
					<Gauge className="size-4 text-muted-foreground" />
					{t("aiUsage.thisMonth", { month })}
				</div>
				<div className="space-y-5">
					<UsageBar
						label={t("aiUsage.tokens")}
						value={usage.totalTokens}
						limit={limits.aiTokensPerMonth}
						locale={locale}
					/>
					<UsageBar
						label={t("aiUsage.requests")}
						value={usage.requests}
						limit={limits.aiRequestsPerMonth}
						locale={locale}
					/>
				</div>
			</section>

			<div className="grid grid-cols-2 gap-3">
				<Metric icon={Activity} label={t("aiUsage.successRate")} value={`${successRate}%`} />
				<Metric
					icon={CircleDollarSign}
					label={t("aiUsage.cost")}
					value={`$${usage.totalCostUsd.toFixed(4)}`}
				/>
				<Metric
					icon={Timer}
					label={t("aiUsage.latency")}
					value={usage.averageLatencyMs === null ? "—" : `${usage.averageLatencyMs} ms`}
				/>
				<Metric icon={Bot} label={t("aiUsage.failures")} value={formatTokens(usage.failedRequests, locale)} />
			</div>

			<section className="rounded-[1.75rem] bg-muted p-5">
				<div className="mb-4 flex items-center justify-between gap-3">
					<div className="text-sm font-medium">{t("aiUsage.models")}</div>
					<div className="text-xs text-muted-foreground">
						{data.models.length
							? `${data.models[0].provider} · ${data.models[0].model}`
							: t("aiUsage.noRequests")}
					</div>
				</div>
				{models.length ? (
					<div className="space-y-3">
						{models.map((model) => (
							<div
								key={`${model.provider}:${model.model}`}
								className="flex items-center justify-between gap-3 text-sm">
								<div className="min-w-0 truncate text-foreground">{model.model}</div>
								<div className="shrink-0 text-muted-foreground">
									{formatCompact(model.tokens, locale)} {t("aiUsage.tokensShort")}
								</div>
							</div>
						))}
					</div>
				) : (
					<p className="text-sm text-muted-foreground">{t("aiUsage.empty")}</p>
				)}
			</section>
		</div>
	);
}
