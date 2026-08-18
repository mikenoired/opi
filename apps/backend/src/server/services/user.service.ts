import type { UserPreferencesInput } from "@monolyth/shared/preferences";

import type { Context } from "../context";
import UserRepository from "../repositories/user.repository";

export default class UserService {
	private repo: UserRepository;

	constructor(private readonly ctx: Context) {
		this.repo = new UserRepository(ctx);
	}

	async getUser() {
		return await this.repo.getUser();
	}

	async getStorageUsage() {
		return await this.ctx.cache.getUserStorage(this.ctx.user!.id);
	}

	async getPreferences() {
		return await this.repo.getPreferences();
	}

	async updatePreferences(preferences: UserPreferencesInput) {
		const updatedPreferences = await this.repo.updatePreferences(preferences);
		await this.ctx.sync.publish({
			entityId: this.ctx.user!.id,
			entityType: "user-preferences",
			operation: "update",
			payload: updatedPreferences,
			userId: this.ctx.user!.id,
		});
		return updatedPreferences;
	}

	async deleteAccount() {
		const userId = this.ctx.user!.id;
		const result = await this.repo.deleteAccount();
		await this.ctx.sync.publish({ entityId: userId, entityType: "user", operation: "delete", userId });
		return result;
	}
}
