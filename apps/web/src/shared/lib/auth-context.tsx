import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";

import { apiUrl } from "@/shared/config/api";
import { useRouter } from "@/shared/router/navigation";

export interface User {
	id: string;
	email: string;
}

export interface AuthError {
	message: string;
	fieldErrors?: Partial<Record<"email" | "password", string>>;
}

interface AuthContextType {
	user: User | null;
	loading: boolean;
	signUp: (
		email: string,
		password: string,
		options?: { redirect?: boolean }
	) => Promise<{ error: AuthError | null }>;
	signIn: (
		email: string,
		password: string,
		options?: { redirect?: boolean }
	) => Promise<{ error: AuthError | null }>;
	signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({
	children,
	initialUser = null,
}: {
	children: ReactNode;
	initialUser?: User | null;
}) {
	const [user, setUser] = useState<User | null>(initialUser);
	const [loading, setLoading] = useState(initialUser === null);
	const router = useRouter();

	useEffect(() => {
		if (initialUser) return;

		const controller = new AbortController();

		async function loadUser() {
			try {
				const response = await fetch(apiUrl("/user"), {
					credentials: "include",
					signal: controller.signal,
				});

				if (!response.ok) {
					setUser(null);
					return;
				}

				const nextUser = (await response.json()) as User;
				setUser(nextUser);
			} catch (error) {
				if (error instanceof DOMException && error.name === "AbortError") return;
				setUser(null);
			} finally {
				if (!controller.signal.aborted) setLoading(false);
			}
		}

		void loadUser();

		return () => controller.abort();
	}, [initialUser]);

	const signUp = async (email: string, password: string, options?: { redirect?: boolean }) => {
		try {
			const result = await fetch(apiUrl("/auth/register"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password }),
				credentials: "include",
			}).then(async (res) => ({ ok: res.ok, body: await res.json() }));

			if (!result.ok) {
				const error = result.body as { error?: string; fieldErrors?: Record<string, string[] | undefined> };
				return {
					error: {
						message: error?.error || "Register error",
						fieldErrors: error?.fieldErrors
							? {
									email: error.fieldErrors.email?.[0],
									password: error.fieldErrors.password?.[0],
								}
							: undefined,
					},
				};
			}

			const data = result.body as { user?: User; token?: string; refreshToken?: string };
			if (!data?.token || !data?.refreshToken) {
				return { error: { message: "Can't get tokens" } };
			}

			const sessionResponse = await fetch(apiUrl("/session"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					token: data.token,
					refreshToken: data.refreshToken,
				}),
				credentials: "include",
			});

			if (!sessionResponse.ok) {
				return { error: { message: "Session setting error" } };
			}

			setUser({ id: data.user!.id, email: data.user!.email });
			if (options?.redirect !== false) router.push("/");
			return { error: null };
		} catch (error) {
			return { error: { message: error instanceof Error ? error.message : "Register error" } };
		}
	};

	const signIn = async (email: string, password: string, options?: { redirect?: boolean }) => {
		try {
			const result = await fetch(apiUrl("/auth/login"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password }),
				credentials: "include",
			}).then(async (res) => ({ ok: res.ok, body: await res.json() }));

			if (!result.ok) {
				const error = result.body as { error?: string; fieldErrors?: Record<string, string[] | undefined> };
				return {
					error: {
						message: error?.error || "Login error",
						fieldErrors: error?.fieldErrors
							? {
									email: error.fieldErrors.email?.[0],
									password: error.fieldErrors.password?.[0],
								}
							: undefined,
					},
				};
			}

			const data = result.body as { user?: User; token?: string; refreshToken?: string };
			if (!data?.token || !data?.refreshToken) {
				return { error: { message: "Can't get register tokens" } };
			}

			const sessionResponse = await fetch(apiUrl("/session"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					token: data.token,
					refreshToken: data.refreshToken,
				}),
				credentials: "include",
			});

			if (!sessionResponse.ok) {
				return { error: { message: "Session setting error" } };
			}

			setUser({ id: data.user!.id, email: data.user!.email });
			if (options?.redirect !== false) router.push("/");
			return { error: null };
		} catch (error) {
			return { error: { message: error instanceof Error ? error.message : "Login error" } };
		}
	};

	const signOut = async () => {
		try {
			await fetch(apiUrl("/session"), {
				method: "DELETE",
				credentials: "include",
			});
			setUser(null);
			router.push("/");
		} catch {
			setUser(null);
			router.push("/");
		}
	};

	return (
		<AuthContext.Provider
			value={{
				user,
				loading,
				signUp,
				signIn,
				signOut,
			}}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}
