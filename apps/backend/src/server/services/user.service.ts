import type { UserPreferencesInput } from "@synapse/shared/preferences";

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
		return await this.repo.updatePreferences(preferences);
	}

	async deleteAccount() {
		return await this.repo.deleteAccount();
	}
}
