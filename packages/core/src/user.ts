import { DEFAULT_PLAN_ID, isPlanId, type PlanId } from "@monolyth/shared/plans";
import {
	normalizeUserPreferences,
	type UserPreferences,
	type UserPreferencesInput,
} from "@monolyth/shared/preferences";

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

export function mergeUserPreferences(
	currentPreferences: UserPreferences,
	preferences: UserPreferencesInput
): UserPreferences {
	return normalizeUserPreferences({ ...currentPreferences, ...preferences });
}
