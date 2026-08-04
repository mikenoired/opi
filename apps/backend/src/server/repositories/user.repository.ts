import { mapCurrentUser, mergeUserPreferences, type CurrentUser } from "@synapse/core";
import { normalizeUserPreferences, type UserPreferencesInput } from "@synapse/shared/preferences";
import { eq } from "drizzle-orm";

import type { Context } from "../context";
import { users } from "../db/schema";
import { ApiError } from "../lib/api-error";
import { requireAuth } from "../lib/auth-guard";

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

		return mapCurrentUser(user);
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
		const nextPreferences = mergeUserPreferences(currentPreferences, preferences);

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
