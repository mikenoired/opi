import type { AuthCredentials, AuthError } from "@synapse/api";
import { authSchema } from "@synapse/shared/schemas";
import { Button, Input, Label, Modal } from "@synapse/ui/components";
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
			setSubmitError("Не удалось выполнить запрос");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			ariaLabel={mode === "login" ? "Вход в Synapse" : "Создание аккаунта"}
			className="w-full max-w-md p-5">
			<button
				type="button"
				onClick={() => onOpenChange(false)}
				aria-label="Закрыть"
				className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
				<X className="size-5" />
			</button>
			<div className="mb-4 space-y-1">
				<h1 className="pr-10 text-2xl font-bold">{mode === "login" ? "Вход" : "Создание аккаунта"}</h1>
				<div className="text-muted-foreground">
					{mode === "login" ? "Введите данные аккаунта" : "Укажите почту и придумайте пароль"}
				</div>
			</div>
			<form onSubmit={handleSubmit} className="space-y-4">
				<label className="space-y-2" htmlFor="email">
					<Label>Электронная почта</Label>
					<Input
						id="email"
						type="email"
						placeholder="example@mail.com"
						className="h-11"
						value={email}
						onChange={(event) => {
							setEmail(event.target.value);
							setFieldErrors((errors) => ({ ...errors, email: undefined }));
						}}
						aria-invalid={Boolean(fieldErrors.email)}
						aria-describedby={fieldErrors.email ? "email-error" : undefined}
						required
					/>
					{fieldErrors.email && (
						<p id="email-error" role="alert" className="text-xs text-destructive">
							{fieldErrors.email}
						</p>
					)}
				</label>
				<label className="space-y-2" htmlFor="password">
					<Label>Пароль</Label>
					<Input
						id="password"
						type="password"
						placeholder="••••••••"
						className="h-11"
						value={password}
						onChange={(event) => {
							setPassword(event.target.value);
							setFieldErrors((errors) => ({ ...errors, password: undefined }));
						}}
						aria-invalid={Boolean(fieldErrors.password)}
						aria-describedby={fieldErrors.password ? "password-error" : undefined}
						required
						minLength={8}
					/>
					{fieldErrors.password ? (
						<p id="password-error" role="alert" className="text-xs text-destructive">
							{fieldErrors.password}
						</p>
					) : mode === "register" ? (
						<p className="text-xs text-muted-foreground">
							Не менее 8 символов: строчная и заглавная буквы, цифра
						</p>
					) : null}
				</label>
				{submitError && (
					<p role="alert" className="text-sm text-destructive">
						{submitError}
					</p>
				)}
				<div className="flex flex-col space-y-2">
					<Button type="submit" disabled={isLoading} className="h-11">
						{isLoading ? "Подождите…" : mode === "login" ? "Войти" : "Создать аккаунт"}
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
						{mode === "login" ? "Нет аккаунта? Создать" : "Уже есть аккаунт? Войти"}
					</Button>
				</div>
			</form>
		</Modal>
	);
}
