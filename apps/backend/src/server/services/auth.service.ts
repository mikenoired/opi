import type { Context } from "../context";
import AuthRepository from "../repositories/auth.repository";

export default class AuthService {
	private repo: AuthRepository;

	constructor(ctx: Context) {
		this.repo = new AuthRepository(ctx);
	}

	async register(email: string, password: string) {
		const { data } = await this.repo.registerUser(email, password);
		return { user: data.user, token: data.token, refreshToken: data.refreshToken };
	}

	async login(email: string, password: string) {
		const { data } = await this.repo.loginUser(email, password);
		return { user: data.user, token: data.token, refreshToken: data.refreshToken };
	}

	async logout() {
		await this.repo.logoutUser();
		return { success: true };
	}
}
