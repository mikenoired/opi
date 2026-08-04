import { DEFAULT_PLAN_ID, isPlanId, type PlanId } from "@synapse/shared/plans";
import { normalizeUserPreferences, type UserPreferencesInput } from "@synapse/shared/preferences";
import { eq } from "drizzle-orm";

import type { Context } from "../context";
import { users } from "../db/schema";
import { ApiError } from "../lib/api-error";
import { requireAuth } from "../lib/auth-guard";

export interface CurrentUser {
	id: string;
	email: string;
	plan: PlanId;
	createdAt: Date | null;
	updatedAt: Date | null;
}

export default class UserRepository {
	constructor(private readonly ctx: Context) {}

	async getUser(): Promise<CurrentUser> {
		requireAuth(this.ctx);

		const user = await this.ctx.db.query.users.findFirst({
			where: eq(users.id, this.ctx.user.id),
			columns: {
				id: true,
				email: true,
				plan: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		if (!user) {
			throw new ApiError({
				code: "NOT_FOUND",
				message: "User not found",
			});
		}

		return {
			id: user.id,
			email: user.email,
			plan: isPlanId(user.plan) ? user.plan : DEFAULT_PLAN_ID,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
		};
	}

	async getPreferences() {
		requireAuth(this.ctx);

		const user = await this.ctx.db.query.users.findFirst({
			where: eq(users.id, this.ctx.user.id),
			columns: {
				preferences: true,
			},
		});

		if (!user) {
			throw new ApiError({
				code: "NOT_FOUND",
				message: "User not found",
			});
		}

		return normalizeUserPreferences(user.preferences);
	}

	async updatePreferences(preferences: UserPreferencesInput) {
		requireAuth(this.ctx);

		const currentPreferences = await this.getPreferences();
		const nextPreferences = normalizeUserPreferences({
			...currentPreferences,
			...preferences,
		});

		const [updatedUser] = await this.ctx.db
			.update(users)
			.set({
				preferences: nextPreferences,
				updatedAt: new Date(),
			})
			.where(eq(users.id, this.ctx.user.id))
			.returning({
				preferences: users.preferences,
			});

		if (!updatedUser) {
			throw new ApiError({
				code: "NOT_FOUND",
				message: "User not found",
			});
		}

		return normalizeUserPreferences(updatedUser.preferences);
	}

	async deleteAccount() {
		requireAuth(this.ctx);
		await this.ctx.db.delete(users).where(eq(users.id, this.ctx.user.id));
		return { success: true };
	}
}
