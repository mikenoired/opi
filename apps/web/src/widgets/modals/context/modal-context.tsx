import type { Content } from "@monolyth/shared/schemas";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { api } from "@/shared/api/hooks";
import { usePathname, useRouter, useSearchParams } from "@/shared/router/navigation";

export type ModalType = "viewer" | "editor" | "confirm" | "custom";

export interface ModalConfig {
	type: ModalType;
	contentType?: Content["type"];
	item?: Content | null;
	props?: Record<string, any>;
	onClose?: () => void;
	onSuccess?: () => void;
}

interface ModalContextType {
	activeModal: ModalConfig | null;
	openModal: (config: ModalConfig) => void;
	closeModal: () => void;
	dismissModal: () => void;
	navigateViewer: (item: Content) => void;
	isOpen: boolean;
}

const ModalContext = createContext<ModalContextType | null>(null);

interface ModalProviderProps {
	children: ReactNode;
}

export function ModalProvider({ children }: ModalProviderProps) {
	const [activeModal, setActiveModal] = useState<ModalConfig | null>(null);
	const activeModalRef = useRef<ModalConfig | null>(null);
	const viewerPropsRef = useRef<Record<string, any>>({});
	const dismissedViewerIdRef = useRef<string | null>(null);
	const viewerPathnameRef = useRef<string | null>(null);
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const viewerId = searchParams.get("viewer");
	const viewerIsPresentInBrowserUrl = new URLSearchParams(window.location.search).has("viewer");
	const restoredViewer = api.content.getById.useQuery(
		{ id: viewerId ?? "" },
		{ enabled: Boolean(viewerId), retry: false, refetchOnMount: false }
	);

	const setModal = useCallback((modal: ModalConfig | null) => {
		activeModalRef.current = modal;
		setActiveModal(modal);
	}, []);

	const viewerUrl = useCallback(
		(itemId?: string) => {
			const params = new URLSearchParams(window.location.search);
			if (itemId) params.set("viewer", itemId);
			else params.delete("viewer");
			const query = params.toString();
			return query ? `${pathname}?${query}` : pathname;
		},
		[pathname]
	);

	const openModal = useCallback(
		(config: ModalConfig) => {
			if (config.type === "viewer" && config.item) {
				viewerPropsRef.current = config.props ?? {};
				viewerPathnameRef.current = pathname;
				setModal(null);
				router.push(viewerUrl(config.item.id), { state: { monolythViewer: true } });
				// List endpoints intentionally provide a compact preview. Wait for the
				// detail query below before mounting the viewer so a note never opens
				// with truncated rich-text JSON.
				return;
			}
			setModal(config);
		},
		[pathname, router, setModal, viewerUrl]
	);

	const navigateViewer = useCallback(
		(item: Content) => {
			const current = activeModalRef.current;
			if (current?.type !== "viewer") return;
			const previousItems = (viewerPropsRef.current.items as Content[] | undefined) ?? [];
			const items = previousItems.some((entry) => entry.id === item.id)
				? previousItems
				: [...previousItems, item];
			const props = { ...viewerPropsRef.current, items };
			viewerPropsRef.current = props;
			setModal({ ...current, item, props });
			router.push(viewerUrl(item.id), { state: { monolythViewer: true } });
		},
		[router, setModal, viewerUrl]
	);

	const closeModal = useCallback(() => {
		const current = activeModalRef.current;
		if (current?.onClose) current.onClose();
		if (current?.type === "viewer") dismissedViewerIdRef.current = current.item?.id ?? null;
		viewerPathnameRef.current = null;
		setModal(null);

		if (current?.type !== "viewer") return;
		// Closing is final for the current view. Replacing (rather than going Back)
		// avoids stepping through earlier items that were visited inside the viewer.
		router.replace(viewerUrl());
	}, [router, setModal, viewerUrl]);

	// A tag link leaves the viewer URL behind as a history entry: Back then correctly
	// restores the item instead of reopening a modal on the tag page.
	const dismissModal = useCallback(() => {
		const current = activeModalRef.current;
		if (current?.onClose) current.onClose();
		if (current?.type === "viewer") dismissedViewerIdRef.current = current.item?.id ?? null;
		viewerPathnameRef.current = null;
		setModal(null);
	}, [setModal]);

	// Links rendered inside suggestion cards do not necessarily receive the viewer's
	// explicit dismiss callback. A route change is nevertheless always a viewer exit.
	useEffect(() => {
		const current = activeModalRef.current;
		const viewerPathname = viewerPathnameRef.current;
		if (current?.type !== "viewer" || !viewerPathname || viewerPathname === pathname) return;

		dismissedViewerIdRef.current = current.item?.id ?? null;
		viewerPathnameRef.current = null;
		setModal(null);
	}, [pathname, setModal]);

	useEffect(() => {
		if (!viewerId) {
			dismissedViewerIdRef.current = null;
			if (activeModalRef.current?.type === "viewer") setModal(null);
			return;
		}
		if (dismissedViewerIdRef.current === viewerId) return;
		if (activeModalRef.current?.type === "viewer" && activeModalRef.current.item?.id === viewerId) return;
		if (!restoredViewer.data) return;

		viewerPathnameRef.current = pathname;
		setModal({
			type: "viewer",
			contentType: restoredViewer.data.type,
			item: restoredViewer.data,
			props: viewerPropsRef.current,
		});
	}, [pathname, restoredViewer.data, setModal, viewerId]);

	const value: ModalContextType = {
		activeModal,
		openModal,
		closeModal,
		dismissModal,
		navigateViewer,
		isOpen:
			activeModal !== null &&
			(activeModal.type !== "viewer" || (Boolean(viewerId) && viewerIsPresentInBrowserUrl)),
	};

	return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}

export function useModal() {
	const context = useContext(ModalContext);
	if (!context) throw new Error("useModal must be used within ModalProvider");

	return context;
}
