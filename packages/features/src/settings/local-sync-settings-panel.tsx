import { useI18n } from "@synapse/i18n";
import { Button } from "@synapse/ui/components";
import { RefreshCw } from "lucide-react";
import { useState } from "react";

export interface LocalSyncSettingsPanelProps {
	isSyncing?: boolean;
	onLogin(input: { apiUrl: string; email: string; password: string }): Promise<void>;
	onSync(): Promise<void>;
	onSyncPolicyChange(value: "automatic" | "manual"): Promise<void> | void;
	session?: { eligible: boolean; email: string; plan: string };
	statistics?: {
		conflictCount?: number;
		itemCount: number;
		localBytes: number;
		pendingSyncCount: number;
		tagCount: number;
	};
	syncPolicy: "automatic" | "manual";
}

/** Shared Desktop extension visual. It receives only declared settings and service callbacks. */
export function LocalSyncSettingsPanel({
	isSyncing,
	onLogin,
	onSync,
	onSyncPolicyChange,
	session,
	syncPolicy,
}: LocalSyncSettingsPanelProps) {
	const { t } = useI18n();
	const [credentials, setCredentials] = useState({
		apiUrl: "http://localhost:3000/api",
		email: "",
		password: "",
	});
	const [error, setError] = useState("");
	return (
		<div className="space-y-6 py-1">
			<section className="rounded-[1.75rem] bg-muted p-5">
				<h2 className="text-xl font-semibold tracking-tight">Synapse Sync</h2>
				<div className="mt-4 space-y-3 text-sm">
					<label className="flex gap-2">
						<input
							type="radio"
							checked={syncPolicy === "manual"}
							onChange={() => void onSyncPolicyChange("manual")}
						/>
						{t("sync.manual")}
					</label>
					<label className="flex gap-2">
						<input
							type="radio"
							checked={syncPolicy === "automatic"}
							onChange={() => void onSyncPolicyChange("automatic")}
						/>
						{t("sync.automatic")}
					</label>
				</div>
				{session ? (
					<div className="mt-5 space-y-3">
						<p className="text-sm text-muted-foreground">
							{session.eligible ? t("sync.withPlan", { plan: session.plan }) : t("sync.unavailable")}
						</p>
						<Button disabled={!session.eligible || isSyncing} onClick={() => void onSync()}>
							<RefreshCw className={isSyncing ? "size-4 animate-spin" : "size-4"} />
							{isSyncing ? t("sync.syncing") : t("sync.sync")}
						</Button>
					</div>
				) : (
					<form
						className="mt-5 grid gap-3"
						onSubmit={async (event) => {
							event.preventDefault();
							setError("");
							try {
								await onLogin(credentials);
							} catch (cause) {
								setError(cause instanceof Error ? cause.message : "Sync login failed");
							}
						}}>
						<input
							required
							placeholder={t("sync.apiUrl")}
							value={credentials.apiUrl}
							onChange={(event) => setCredentials({ ...credentials, apiUrl: event.target.value })}
							className="rounded-lg border bg-background p-2"
						/>
						<input
							required
							type="email"
							placeholder={t("sync.email")}
							value={credentials.email}
							onChange={(event) => setCredentials({ ...credentials, email: event.target.value })}
							className="rounded-lg border bg-background p-2"
						/>
						<input
							required
							type="password"
							placeholder={t("sync.password")}
							value={credentials.password}
							onChange={(event) => setCredentials({ ...credentials, password: event.target.value })}
							className="rounded-lg border bg-background p-2"
						/>
						{error && <p className="text-sm text-destructive">{error}</p>}
						<Button>{t("sync.login")}</Button>
					</form>
				)}
			</section>
		</div>
	);
}
