import type { Content } from "@synapse/shared/schemas";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { normalizeDroppedFiles } from "@/shared/lib/upload-file-kind";
import dynamic from "@/shared/router/dynamic";

const AddContentModal = dynamic(() =>
	import("@/widgets/modals/editor/add-content-modal").then((mod) => ({ default: mod.AddContentModal }))
);

interface AddDialogOpenOptions {
	initialTags?: string[];
	onContentAdded?: (content?: Content | Content[]) => void;
}

interface AddDialogConfig {
	initialTags: string[];
	onContentAdded?: (content?: Content | Content[]) => void;
}

interface AddDialogDefaults {
	initialTags?: string[];
	onContentAdded?: ((content?: Content | Content[]) => void) | null;
}

interface DashboardContextType {
	isAddDialogOpen: boolean;
	openAddDialog: (options?: AddDialogOpenOptions) => void;
	closeAddDialog: () => void;
	setAddDialogDefaults: (defaults: AddDialogDefaults) => void;
	dialogOptions: AddDialogConfig;
	triggerSearchFocus: () => void;
	setTriggerSearchFocus: (callback: () => void) => void;
	preloadedFiles: File[];
	setPreloadedFiles: Dispatch<SetStateAction<File[]>>;
	sidebarWidth: number;
	setSidebarWidth: (width: number) => void;
	isSidebarExpanded: boolean;
	toggleSidebar: () => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: ReactNode }) {
	const [isAddDialogOpen, setAddDialogOpen] = useState(false);
	const [searchFocus, setSearchFocus] = useState<() => void>(() => () => {});
	const [preloadedFiles, setPreloadedFiles] = useState<File[]>([]);
	const [dialogDefaults, setDialogDefaultsState] = useState<AddDialogConfig>({ initialTags: [] });
	const [dialogOptions, setDialogOptions] = useState<AddDialogConfig>({ initialTags: [] });
	const [sidebarWidth, setSidebarWidth] = useState(72);
	const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

	const setTriggerSearchFocus = useCallback((callback: () => void) => {
		setSearchFocus(() => callback);
	}, []);

	const normalizeTags = useCallback((tags?: string[]) => {
		if (!tags?.length) return [];
		return Array.from(new Set(tags.filter(Boolean)));
	}, []);

	const openAddDialog = useCallback(
		(options?: AddDialogOpenOptions) => {
			setDialogOptions({
				initialTags: normalizeTags(options?.initialTags ?? dialogDefaults.initialTags),
				onContentAdded: options?.onContentAdded ?? dialogDefaults.onContentAdded,
			});
			setAddDialogOpen(true);
		},
		[dialogDefaults, normalizeTags]
	);

	const closeAddDialog = useCallback(() => {
		setAddDialogOpen(false);
		setDialogOptions({
			initialTags: dialogDefaults.initialTags,
			onContentAdded: dialogDefaults.onContentAdded,
		});
	}, [dialogDefaults]);

	const setAddDialogDefaults = useCallback(
		(defaults: AddDialogDefaults) => {
			setDialogDefaultsState((prev) => ({
				initialTags:
					defaults.initialTags !== undefined ? normalizeTags(defaults.initialTags) : prev.initialTags,
				onContentAdded:
					defaults.onContentAdded !== undefined
						? (defaults.onContentAdded ?? undefined)
						: prev.onContentAdded,
			}));
		},
		[normalizeTags]
	);

	const toggleSidebar = useCallback(() => {
		setIsSidebarExpanded((prev) => !prev);
		setSidebarWidth((prev) => (prev === 72 ? 256 : 72));
	}, []);

	useEffect(() => {
		const handlePaste = (event: ClipboardEvent) => {
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable || target.closest("input, textarea, [contenteditable='true']"))
			) {
				return;
			}

			const { files } = normalizeDroppedFiles(Array.from(event.clipboardData?.files ?? []));
			if (files.length === 0) return;

			event.preventDefault();
			setPreloadedFiles(files);
			openAddDialog();
		};

		window.addEventListener("paste", handlePaste);
		return () => window.removeEventListener("paste", handlePaste);
	}, [openAddDialog]);

	const value = useMemo(
		() => ({
			isAddDialogOpen,
			openAddDialog,
			closeAddDialog,
			setAddDialogDefaults,
			dialogOptions,
			triggerSearchFocus: searchFocus,
			setTriggerSearchFocus,
			preloadedFiles,
			setPreloadedFiles,
			sidebarWidth,
			setSidebarWidth,
			isSidebarExpanded,
			toggleSidebar,
		}),
		[
			isAddDialogOpen,
			searchFocus,
			setTriggerSearchFocus,
			preloadedFiles,
			openAddDialog,
			closeAddDialog,
			setAddDialogDefaults,
			dialogOptions,
			sidebarWidth,
			isSidebarExpanded,
			toggleSidebar,
		]
	);

	const shouldRenderAddContentModal = isAddDialogOpen || preloadedFiles.length > 0;

	return (
		<DashboardContext.Provider value={value}>
			{children}
			{shouldRenderAddContentModal && (
				<AddContentModal
					open={isAddDialogOpen}
					onOpenChange={(nextOpen) => {
						setAddDialogOpen(nextOpen);
						if (!nextOpen) {
							setPreloadedFiles([]);
						}
					}}
					initialTags={dialogOptions.initialTags}
					onContentAdded={dialogOptions.onContentAdded}
					preloadedFiles={preloadedFiles}
				/>
			)}
		</DashboardContext.Provider>
	);
}

export function useDashboard() {
	const context = useContext(DashboardContext);
	if (!context) {
		throw new Error("useDashboard must be used within a DashboardProvider");
	}
	return context;
}
