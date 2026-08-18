import {
	AuthDialog as SharedAuthDialog,
	type AuthDialogProps as SharedAuthDialogProps,
} from "@monolyth/features";

import { useAuth } from "@/shared/lib/auth-context";

type AuthDialogProps = Omit<SharedAuthDialogProps, "onAuthenticate">;

/** Web only supplies the account adapter; the dialog visual is shared. */
export function AuthDialog(props: AuthDialogProps) {
	const { signIn, signUp } = useAuth();
	return (
		<SharedAuthDialog
			{...props}
			onAuthenticate={(mode, input) =>
				mode === "login" ? signIn(input.email, input.password) : signUp(input.email, input.password)
			}
		/>
	);
}
