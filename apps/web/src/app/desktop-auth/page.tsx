import { authSchema } from "@synapse/shared/schemas";
import { Button, InputField } from "@synapse/ui/components";
import { useEffect, useState } from "react";

import { apiUrl } from "@/shared/config/api";
import { useAuth } from "@/shared/lib/auth-context";
import { useSearchParams } from "@/shared/router/navigation";

type Mode = "login" | "register";

export default function DesktopAuthPage() {
	const { signIn, signUp } = useAuth();
	const search = useSearchParams();
	const [mode, setMode] = useState<Mode>("login");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [callbackUrl, setCallbackUrl] = useState<string>();
	const state = search.get("state");
	const codeChallenge = search.get("code_challenge");
	const validRequest = Boolean(
		state?.match(/^[A-Za-z0-9_-]{16,128}$/) && codeChallenge?.match(/^[A-Za-z0-9_-]{43,128}$/)
	);

	useEffect(() => {
		if (!callbackUrl) return;
		const timer = window.setTimeout(() => window.location.assign(callbackUrl), 700);
		return () => window.clearTimeout(timer);
	}, [callbackUrl]);

	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		const validation = authSchema.safeParse({ email, password });
		if (!validation.success) return setError(validation.error.issues[0]?.message || "Проверьте данные формы");
		setError("");
		setIsLoading(true);
		try {
			const result = await (mode === "login"
				? signIn(email, password, { redirect: false })
				: signUp(email, password, { redirect: false }));
			if (result.error) return setError(result.error.message);
			const response = await fetch(apiUrl("/auth/desktop/complete"), {
				body: JSON.stringify({ codeChallenge, state }),
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			const payload = (await response.json()) as { code?: string; error?: string };
			if (!response.ok || !payload.code) throw new Error(payload.error || "Не удалось завершить подключение");
			setCallbackUrl(
				`synapse://auth/callback?code=${encodeURIComponent(payload.code)}&state=${encodeURIComponent(state!)}`
			);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Не удалось подключить аккаунт");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
			<section className="w-full max-w-md space-y-7 rounded-2xl border bg-background p-6 shadow-sm">
				<div className="space-y-2">
					<p className="text-sm font-medium text-primary">Synapse Desktop</p>
					<h1 className="text-2xl font-semibold">
						{mode === "login" ? "Войдите в аккаунт" : "Создайте аккаунт"}
					</h1>
					<p className="text-sm text-muted-foreground">После входа вы вернётесь в приложение Synapse.</p>
				</div>
				{callbackUrl ? (
					<div className="space-y-5">
						<div className="space-y-2">
							<h2 className="text-lg font-medium">Аккаунт подключён</h2>
							<p className="text-sm leading-6 text-muted-foreground">
								Сейчас откроется Synapse Desktop. Если приложение не открылось автоматически, вернитесь в него
								кнопкой ниже.
							</p>
						</div>
						<Button className="w-full" onClick={() => window.location.assign(callbackUrl)}>
							Вернуться в Synapse Desktop
						</Button>
					</div>
				) : !validRequest ? (
					<p role="alert" className="text-sm text-destructive">
						Ссылка подключения недействительна. Вернитесь в приложение и начните заново.
					</p>
				) : (
					<form className="space-y-4" onSubmit={submit}>
						<InputField
							id="email"
							label="Электронная почта"
							type="email"
							value={email}
							onChange={setEmail}
							required
						/>
						<InputField
							id="password"
							label="Пароль"
							type="password"
							value={password}
							onChange={setPassword}
							required
							minLength={8}
						/>
						{error && (
							<p role="alert" className="text-sm text-destructive">
								{error}
							</p>
						)}
						<Button className="w-full" type="submit" disabled={isLoading}>
							{isLoading ? "Подключаем…" : mode === "login" ? "Войти и подключить" : "Создать и подключить"}
						</Button>
						<Button
							className="w-full"
							type="button"
							variant="ghost"
							onClick={() => {
								setError("");
								setMode(mode === "login" ? "register" : "login");
							}}>
							{mode === "login" ? "Нет аккаунта? Создать" : "Уже есть аккаунт? Войти"}
						</Button>
					</form>
				)}
			</section>
		</main>
	);
}
