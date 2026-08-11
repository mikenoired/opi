import type { AiUsage } from "@synapse/api";
import { isUnlimited } from "@synapse/shared/plans";
import { Skeleton } from "@synapse/ui/components";
import { Activity, Bot, CircleDollarSign, Gauge, Timer } from "lucide-react";

import { PixelSparkles } from "../components/pixel-sparkles";

export interface AiSettingsPanelProps {
	data?: AiUsage;
	isError?: boolean;
	isLoading?: boolean;
	locale: string;
	strings: {
		cost: string;
		error: string;
		failures: string;
		latency: string;
		models: string;
		noRequests: string;
		planDescription: string;
		requests: string;
		successRate: string;
		thisMonth: (month: string) => string;
		tokens: string;
		tokensShort: string;
	};
}

/** Shared AI usage visual. Querying and platform availability stay outside the component. */
export function AiSettingsPanel({
	data,
	isError = false,
	isLoading = false,
	locale,
	strings,
}: AiSettingsPanelProps) {
	if (isLoading) return <AiSettingsSkeleton />;
	if (isError || !data)
		return (
			<div className="rounded-[1.75rem] bg-muted p-5 text-sm text-muted-foreground">{strings.error}</div>
		);

	const { limits, usage } = data;
	const successRate = usage.requests ? Math.round((usage.successfulRequests / usage.requests) * 100) : 0;
	const month = new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(data.period.start));
	return (
		<div className="space-y-4 py-1">
			<section className="relative overflow-hidden rounded-[1.75rem] bg-primary p-5 text-primary-foreground">
				<PixelSparkles className="opacity-90" pixelSize={5} speed={0.4} fireSpeed={1.8} density={1.1} />
				<div className="relative z-10 flex items-start justify-between gap-4">
					<div>
						<h2 className="text-2xl font-semibold tracking-tight">{data.planLabel}</h2>
						<p className="mt-1 text-sm text-primary-foreground/65">{strings.planDescription}</p>
					</div>
				</div>
			</section>
			<section className="rounded-[1.75rem] bg-muted p-5">
				<div className="mb-5 flex items-center gap-2 text-sm font-medium">
					<Gauge className="size-4 text-muted-foreground" />
					{strings.thisMonth(month)}
				</div>
				<div className="space-y-5">
					<UsageBar
						label={strings.tokens}
						value={usage.totalTokens}
						limit={limits.aiTokensPerMonth}
						locale={locale}
					/>
					<UsageBar
						label={strings.requests}
						value={usage.requests}
						limit={limits.aiRequestsPerMonth}
						locale={locale}
					/>
				</div>
			</section>
			<div className="grid grid-cols-2 gap-3">
				<Metric icon={Activity} label={strings.successRate} value={`${successRate}%`} />
				<Metric icon={CircleDollarSign} label={strings.cost} value={`$${usage.totalCostUsd.toFixed(4)}`} />
				<Metric
					icon={Timer}
					label={strings.latency}
					value={usage.averageLatencyMs === null ? "—" : `${usage.averageLatencyMs} ms`}
				/>
				<Metric icon={Bot} label={strings.failures} value={formatTokens(usage.failedRequests, locale)} />
			</div>
			<section className="rounded-[1.75rem] bg-muted p-5">
				<div className="mb-4 flex items-center justify-between gap-3">
					<div className="text-sm font-medium">{strings.models}</div>
					<div className="text-xs text-muted-foreground">
						{data.models.length ? `${data.models[0].provider} · ${data.models[0].model}` : strings.noRequests}
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
									{formatCompact(model.tokens, locale)} {strings.tokensShort}
								</div>
							</div>
						))}
					</div>
				) : (
					<p className="text-sm text-muted-foreground">{strings.noRequests}</p>
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
