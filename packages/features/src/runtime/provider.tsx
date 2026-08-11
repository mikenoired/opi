import type { SynapseClient } from "@synapse/api";
import { createContext, useContext, type ReactNode } from "react";

import type { AppConfiguration, CapabilitySnapshot } from "./config";

export interface CommandExecutor {
	execute(command: string, input?: unknown): Promise<unknown>;
}

/**
 * The only dependency boundary visible to shared product UI.
 *
 * Platform constructors pass REST or IPC implementations here. Components use
 * the interface, never a browser/Electron global or a transport library.
 */
export interface AppServices {
	capabilities: CapabilitySnapshot;
	client: SynapseClient;
	commands: CommandExecutor;
}

export interface AppRuntime {
	configuration: AppConfiguration;
	services: AppServices;
}

const AppRuntimeContext = createContext<AppRuntime | null>(null);

export function AppRuntimeProvider({ children, runtime }: { children: ReactNode; runtime: AppRuntime }) {
	return <AppRuntimeContext.Provider value={runtime}>{children}</AppRuntimeContext.Provider>;
}

export function useAppRuntime(): AppRuntime {
	const runtime = useContext(AppRuntimeContext);
	if (!runtime) throw new Error("useAppRuntime must be used within AppRuntimeProvider");
	return runtime;
}

export function useAppServices(): AppServices {
	return useAppRuntime().services;
}
