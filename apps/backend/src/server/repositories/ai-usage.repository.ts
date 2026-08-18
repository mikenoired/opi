import { getPlanLimits, PLANS, type PlanId } from "@monolyth/shared/plans";
import { and, desc, eq, gte } from "drizzle-orm";

import type { Context } from "../context";
import { aiUsage } from "../db/schema";
import { requireAuth } from "../lib/auth-guard";

export interface AiUsageRecord {
	provider: string;
	model: string;
	feature?: string;
	inputTokens: number;
	outputTokens: number;
	inputCostUsd: number;
	outputCostUsd: number;
	totalCostUsd: number;
	success: boolean;
	errorType?: string | null;
	errorMessage?: string | null;
	latencyMs?: number | null;
	contentId?: string | null;
}

export default class AiUsageRepository {
	constructor(private readonly ctx: Context) {}

	async getOverview() {
		requireAuth(this.ctx);
		const userId = this.ctx.user.id;

		const now = new Date();
		const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
		const [user, rows, latest] = await Promise.all([
			this.ctx.db.query.users.findFirst({
				where: (users, { eq }) => eq(users.id, userId),
				columns: { plan: true },
			}),
			this.ctx.db
				.select({
					provider: aiUsage.provider,
					model: aiUsage.model,
					feature: aiUsage.feature,
					inputTokens: aiUsage.inputTokens,
					outputTokens: aiUsage.outputTokens,
					totalCostUsd: aiUsage.totalCostUsd,
					success: aiUsage.success,
					latencyMs: aiUsage.latencyMs,
				})
				.from(aiUsage)
				.where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, monthStart))),
			this.ctx.db.query.aiUsage.findFirst({
				where: (usage, { eq }) => eq(usage.userId, userId),
				orderBy: [desc(aiUsage.createdAt)],
				columns: { provider: true, model: true, feature: true, createdAt: true },
			}),
		]);

		const plan = (
			user?.plan && PLANS.some((item) => item.id === user.plan) ? user.plan : "starter"
		) as PlanId;
		const limits = getPlanLimits(plan);
		const byModel = new Map<string, { provider: string; model: string; requests: number; tokens: number }>();
		let inputTokens = 0;
		let outputTokens = 0;
		let successfulRequests = 0;
		let totalCostUsd = 0;
		let totalLatencyMs = 0;
		let measuredLatencies = 0;

		for (const row of rows) {
			const tokens = row.inputTokens + row.outputTokens;
			inputTokens += row.inputTokens;
			outputTokens += row.outputTokens;
			totalCostUsd += Number(row.totalCostUsd);
			if (row.success) successfulRequests += 1;
			if (row.latencyMs !== null) {
				totalLatencyMs += row.latencyMs;
				measuredLatencies += 1;
			}
			const key = `${row.provider}:${row.model}`;
			const current = byModel.get(key) ?? {
				provider: row.provider,
				model: row.model,
				requests: 0,
				tokens: 0,
			};
			current.requests += 1;
			current.tokens += tokens;
			byModel.set(key, current);
		}

		return {
			period: { start: monthStart.toISOString(), end: now.toISOString() },
			plan,
			planLabel: PLANS.find((item) => item.id === plan)?.label ?? plan,
			limits,
			usage: {
				requests: rows.length,
				successfulRequests,
				failedRequests: rows.length - successfulRequests,
				inputTokens,
				outputTokens,
				totalTokens: inputTokens + outputTokens,
				totalCostUsd,
				averageLatencyMs: measuredLatencies ? Math.round(totalLatencyMs / measuredLatencies) : null,
			},
			models: [...byModel.values()].sort((a, b) => b.tokens - a.tokens),
			latest,
		};
	}

	async record(input: AiUsageRecord): Promise<void> {
		requireAuth(this.ctx);
		await this.ctx.db.insert(aiUsage).values({
			userId: this.ctx.user.id,
			provider: input.provider,
			model: input.model,
			feature: input.feature ?? "tag_suggestion",
			inputTokens: input.inputTokens,
			outputTokens: input.outputTokens,
			inputCostUsd: input.inputCostUsd.toFixed(8),
			outputCostUsd: input.outputCostUsd.toFixed(8),
			totalCostUsd: input.totalCostUsd.toFixed(8),
			success: input.success,
			errorType: input.errorType ?? null,
			errorMessage: input.errorMessage ?? null,
			latencyMs: input.latencyMs ?? null,
			contentId: input.contentId ?? null,
		});
	}
}
