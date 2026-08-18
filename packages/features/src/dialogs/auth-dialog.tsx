import type { AuthCredentials, AuthError } from "@monolyth/api";
import { useI18n } from "@monolyth/i18n";
import { authSchema } from "@monolyth/shared/schemas";
import { Button, InputField, Modal } from "@monolyth/ui/components";
import { X } from "lucide-react";
import { useState } from "react";

export type AuthDialogMode = "login" | "register";

export interface AuthDialogProps {
	mode: AuthDialogMode;
	onAuthenticate: (mode: AuthDialogMode, input: AuthCredentials) => Promise<{ error: AuthError | null }>;
	onModeChange: (mode: AuthDialogMode) => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}

/** Shared account dialog. Authentication transport and post-login navigation stay outside UI. */
export function AuthDialog({ mode, onAuthenticate, onModeChange, onOpenChange, open }: AuthDialogProps) {
	const { t } = useI18n();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [fieldErrors, setFieldErrors] = useState<Partial<Record<"email" | "password", string>>>({});
	const [submitError, setSubmitError] = useState<string>();

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		const validation = authSchema.safeParse({ email, password });
		if (!validation.success) {
			const errors = validation.error.flatten().fieldErrors;
			setFieldErrors({ email: errors.email?.[0], password: errors.password?.[0] });
			return;
		}

		setFieldErrors({});
		setSubmitError(undefined);
		setIsLoading(true);
		try {
			const result = await onAuthenticate(mode, { email, password });
			if (!result.error) return;
			setFieldErrors(result.error.fieldErrors ?? {});
			setSubmitError(result.error.fieldErrors ? undefined : result.error.message);
		} catch {
			setSubmitError(t("auth.invalidRequest"));
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			ariaLabel={mode === "login" ? t("auth.loginTitle") : t("auth.registerTitle")}
			className="w-full max-w-md p-5">
			<button
				type="button"
				onClick={() => onOpenChange(false)}
				aria-label={t("auth.close")}
				className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
				<X className="size-5" />
			</button>
			<div className="mb-4 space-y-1">
				<h1 className="pr-10 text-2xl font-bold">
					{mode === "login" ? t("auth.login") : t("auth.register")}
				</h1>
				<div className="text-muted-foreground">
					{mode === "login" ? t("auth.loginDescription") : t("auth.registerDescription")}
				</div>
			</div>
			<form onSubmit={handleSubmit} className="space-y-4">
				<div>
					<InputField
						id="email"
						label={t("auth.email")}
						type="email"
						placeholder="example@mail.com"
						className="h-11"
						value={email}
						onChange={(value) => {
							setEmail(value);
							setFieldErrors((errors) => ({ ...errors, email: undefined }));
						}}
						error={fieldErrors.email}
						required
					/>
				</div>
				<div>
					<InputField
						id="password"
						label={t("auth.password")}
						type="password"
						placeholder="••••••••"
						className="h-11"
						value={password}
						onChange={(value) => {
							setPassword(value);
							setFieldErrors((errors) => ({ ...errors, password: undefined }));
						}}
						error={fieldErrors.password}
						required
						minLength={8}
					/>
					{!fieldErrors.password && mode === "register" ? (
						<p className="text-xs text-muted-foreground">{t("auth.passwordHint")}</p>
					) : null}
				</div>
				{submitError && (
					<p role="alert" className="text-sm text-destructive">
						{submitError}
					</p>
				)}
				<div className="flex flex-col space-y-2">
					<Button type="submit" disabled={isLoading} className="h-11">
						{isLoading ? t("auth.submitLoading") : mode === "login" ? t("auth.login") : t("auth.register")}
					</Button>
					<Button
						type="button"
						variant="ghost"
						className="h-11"
						onClick={() => {
							setFieldErrors({});
							setSubmitError(undefined);
							onModeChange(mode === "login" ? "register" : "login");
						}}>
						{mode === "login" ? t("auth.noAccount") : t("auth.hasAccount")}
					</Button>
				</div>
			</form>
		</Modal>
	);
}
