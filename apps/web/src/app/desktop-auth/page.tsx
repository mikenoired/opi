import { useI18n } from "@monolyth/i18n";
import { authSchema } from "@monolyth/shared/schemas";
import { Button, InputField } from "@monolyth/ui/components";
import { useCallback, useEffect, useState } from "react";

import { apiUrl } from "@/shared/config/api";
import { useAuth } from "@/shared/lib/auth-context";
import { useSearchParams } from "@/shared/router/navigation";

type Mode = "login" | "register";

export default function DesktopAuthPage() {
	const { t } = useI18n();
	const { signIn, signUp, user, loading: isSessionLoading } = useAuth();
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
	const complete = useCallback(async () => {
		const response = await fetch(apiUrl("/auth/desktop/complete"), {
			body: JSON.stringify({ codeChallenge, state }),
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});
		const payload = (await response.json()) as { code?: string; error?: string };
		if (!response.ok || !payload.code) throw new Error(payload.error || t("desktopAuth.completeFailed"));
		setCallbackUrl(
			`monolyth://auth/callback?code=${encodeURIComponent(payload.code)}&state=${encodeURIComponent(state!)}`
		);
	}, [codeChallenge, state, t]);

	useEffect(() => {
		if (!validRequest || !user || isSessionLoading || callbackUrl || isLoading) return;
		void complete().catch((cause) =>
			setError(cause instanceof Error ? cause.message : t("desktopAuth.completeFailed"))
		);
	}, [callbackUrl, complete, isLoading, isSessionLoading, t, user, validRequest]);

	useEffect(() => {
		if (!callbackUrl) return;
		const timer = window.setTimeout(() => window.location.assign(callbackUrl), 700);
		return () => window.clearTimeout(timer);
	}, [callbackUrl]);

	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		const validation = authSchema.safeParse({ email, password });
		if (!validation.success)
			return setError(validation.error.issues[0]?.message || t("desktopAuth.validationFailed"));
		setError("");
		setIsLoading(true);
		try {
			const result = await (mode === "login"
				? signIn(email, password, { redirect: false })
				: signUp(email, password, { redirect: false }));
			if (result.error) return setError(result.error.message);
			await complete();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : t("desktopAuth.completeFailed"));
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
			<section className="w-full max-w-md space-y-7 rounded-2xl border bg-background p-6 shadow-sm">
				<div className="space-y-2">
					<p className="text-sm font-medium text-primary">Monolyth Desktop</p>
					<h1 className="text-2xl font-semibold">
						{mode === "login" ? t("desktopAuth.loginTitle") : t("desktopAuth.registerTitle")}
					</h1>
					<p className="text-sm text-muted-foreground">{t("desktopAuth.description")}</p>
				</div>
				{callbackUrl ? (
					<div className="space-y-5">
						<div className="space-y-2">
							<h2 className="text-lg font-medium">{t("desktopAuth.connectedTitle")}</h2>
							<p className="text-sm leading-6 text-muted-foreground">
								{t("desktopAuth.connectedDescription")}
							</p>
						</div>
						<Button className="w-full" onClick={() => window.location.assign(callbackUrl)}>
							{t("desktopAuth.backToDesktop")}
						</Button>
					</div>
				) : !validRequest ? (
					<p role="alert" className="text-sm text-destructive">
						{t("desktopAuth.invalidLink")}
					</p>
				) : user && !isSessionLoading ? (
					<div className="space-y-4">
						<p className="text-sm text-muted-foreground">
							{t("desktopAuth.connecting", { email: user.email })}
						</p>
						<Button className="w-full" variant="ghost" onClick={() => setMode("login")}>
							{t("desktopAuth.otherAccount")}
						</Button>
					</div>
				) : (
					<form className="space-y-4" onSubmit={submit}>
						<InputField
							id="email"
							label={t("auth.email")}
							type="email"
							value={email}
							onChange={setEmail}
							required
						/>
						<InputField
							id="password"
							label={t("auth.password")}
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
							{isLoading
								? t("desktopAuth.connectingAction")
								: mode === "login"
									? t("desktopAuth.loginAction")
									: t("desktopAuth.registerAction")}
						</Button>
						<Button
							className="w-full"
							type="button"
							variant="ghost"
							onClick={() => {
								setError("");
								setMode(mode === "login" ? "register" : "login");
							}}>
							{mode === "login" ? t("auth.noAccount") : t("auth.hasAccount")}
						</Button>
					</form>
				)}
			</section>
		</main>
	);
}
