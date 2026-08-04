import { DEFAULT_PLAN_ID, isPlanId, type PlanId } from "@synapse/shared/plans";

export interface CurrentUser {
	createdAt: Date | null;
	email: string;
	id: string;
	plan: PlanId;
	updatedAt: Date | null;
}

export function mapCurrentUser(record: Omit<CurrentUser, "plan"> & { plan: unknown }): CurrentUser {
	return {
		...record,
		plan: isPlanId(record.plan) ? record.plan : DEFAULT_PLAN_ID,
	};
}
