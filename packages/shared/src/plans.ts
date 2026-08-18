export const PLAN_IDS = ["starter", "plus", "pro", "god-mode"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface PlanLimits {
	aiTokensPerMonth: number;
	aiRequestsPerMonth: number;
	contentItemsLimit: number;
	storageBytesLimit: number;
}

export interface PlanMeta extends PlanLimits {
	id: PlanId;
	label: string;
	tagline: string;
}

export const DEFAULT_PLAN_ID: PlanId = "starter";
export const MONOLYTH_SYNC_PLAN_IDS = ["plus", "pro", "god-mode"] as const satisfies readonly PlanId[];

const GiB = 1024 ** 3;

const LIMITS = {
	"starter": {
		aiTokensPerMonth: 50_000,
		aiRequestsPerMonth: 100,
		contentItemsLimit: 500,
		storageBytesLimit: 1 * GiB,
	},
	"plus": {
		aiTokensPerMonth: 250_000,
		aiRequestsPerMonth: 1_000,
		contentItemsLimit: 5_000,
		storageBytesLimit: 10 * GiB,
	},
	"pro": {
		aiTokensPerMonth: 1_500_000,
		aiRequestsPerMonth: 5_000,
		contentItemsLimit: 50_000,
		storageBytesLimit: 100 * GiB,
	},
	"god-mode": {
		aiTokensPerMonth: Number.POSITIVE_INFINITY,
		aiRequestsPerMonth: Number.POSITIVE_INFINITY,
		contentItemsLimit: Number.POSITIVE_INFINITY,
		storageBytesLimit: Number.POSITIVE_INFINITY,
	},
} satisfies Record<PlanId, PlanLimits>;

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = LIMITS;

const META: Record<PlanId, { label: string; tagline: string }> = {
	"starter": { label: "Starter", tagline: "Для знакомства с сервисом" },
	"plus": { label: "Plus", tagline: "Для личного архива" },
	"pro": { label: "Pro", tagline: "Для активной работы с контентом" },
	"god-mode": { label: "God Mode", tagline: "Без ограничений" },
};

// Порядок важен — используется для отрисовки карточек планов в настройках.
export const PLANS: readonly PlanMeta[] = PLAN_IDS.map((id) => ({
	id,
	...META[id],
	...LIMITS[id],
}));

export function isPlanId(value: unknown): value is PlanId {
	return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function getPlanLimits(plan: PlanId): PlanLimits {
	return PLAN_LIMITS[plan];
}

export function isUnlimited(value: number): boolean {
	return !Number.isFinite(value);
}

/** Monolyth Sync is a paid-plan capability; local Desktop storage remains available to every plan. */
export function canUseMonolythSync(plan: PlanId): boolean {
	return (MONOLYTH_SYNC_PLAN_IDS as readonly PlanId[]).includes(plan);
}
