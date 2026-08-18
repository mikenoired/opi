import { GraphSurface } from "@monolyth/features";
import type { Content } from "@monolyth/shared/schemas";
import { lazy, Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import { api } from "@/shared/api/hooks";
import { useModal } from "@/widgets/modals/context/modal-context";

const ItemPreview = lazy(() => import("@/entities/item/ui/item"));

interface Node {
	color: number;
	id: string;
	content: string | null;
	type: string;
	metadata?: unknown;
}

interface Edge {
	fromNode: string | null;
	toNode: string | null;
}

interface HoverState {
	node: Node;
	x: number;
	y: number;
}

export default function GraphClient({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
	const previewRef = useRef<HTMLDivElement>(null);
	const { data: currentTags = [] } = api.content.getTags.useQuery(undefined, {
		refetchOnMount: true,
	});
	const tagColors = useMemo(
		() => Object.fromEntries(currentTags.map((tag) => [tag.id, tag.color])),
		[currentTags]
	);
	const { openModal } = useModal();
	const utils = api.useUtils();
	const deleteMutation = api.content.delete.useMutation();
	const [hoverState, setHoverState] = useState<HoverState | null>(null);
	const [hoveredItem, setHoveredItem] = useState<Content | null>(null);
	const [previewSize, setPreviewSize] = useState({ width: 320, height: 120 });
	const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const hoveredNodeIdRef = useRef<string | null>(null);
	const hoverPositionRef = useRef({ x: 0, y: 0 });

	const nodesRef = useRef(nodes);
	nodesRef.current = nodes;

	const clickCallbackRef = useRef<(nodeId: string, nodeType: string) => void>(() => {});
	clickCallbackRef.current = async (nodeId: string, nodeType: string) => {
		const node = nodesRef.current.find((entry) => entry.id === nodeId);
		if (nodeType === "tag") {
			if (node?.metadata && typeof node.metadata === "object" && "tag_id" in node.metadata) {
				const tagId = node.metadata.tag_id;
				if (typeof tagId === "string") {
					window.location.href = `/tags/${tagId}`;
				}
			}
		} else {
			const contentId = node ? getContentId(node) : nodeId;
			const item = await utils.content.getById.fetch({ id: contentId });
			if (item) {
				openModal({
					type: "viewer",
					contentType: item.type,
					item,
					props: {
						// A graph node opens as a standalone item, without graph-wide navigation.
						items: [item],
						onEdit: (id: string) => {
							window.location.href = `/edit/${id}`;
						},
						onDelete: async (id: string) => {
							await deleteMutation.mutateAsync({ id });
							void utils.graph.getGraph.invalidate();
						},
						onContentUpdated: (content: Content) => {
							utils.content.getById.setData({ id: content.id }, content);
						},
					},
				});
			}
		}
	};

	const hoverCallbackRef = useRef<(nodeId: string, x: number, y: number) => void>(() => {});
	hoverCallbackRef.current = (nodeId: string, x: number, y: number) => {
		const node = nodesRef.current.find((n) => n.id === nodeId);
		if (!node) return;
		hoverPositionRef.current = { x, y };

		if (hoveredNodeIdRef.current !== nodeId) {
			if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
			hoveredNodeIdRef.current = nodeId;
			setHoverState(null);
			setHoveredItem(null);
			hoverTimerRef.current = setTimeout(async () => {
				if (node.type === "tag") {
					setHoverState({ node, ...hoverPositionRef.current });
					return;
				}

				try {
					const item = await utils.content.getById.fetch({ id: getContentId(node) });
					if (hoveredNodeIdRef.current === nodeId && item) {
						setHoveredItem(item);
						setHoverState({ node, ...hoverPositionRef.current });
					}
				} catch {
					return;
				}
			}, 300);
		} else if (hoverState) {
			setHoverState((prev) => (prev ? { ...prev, ...hoverPositionRef.current } : prev));
		}
	};

	const leaveCallbackRef = useRef<() => void>(() => {});
	leaveCallbackRef.current = () => {
		if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
		hoverTimerRef.current = null;
		hoveredNodeIdRef.current = null;
		setHoverState(null);
		setHoveredItem(null);
	};

	const handleNodeClick = useCallback(
		(nodeId: string, nodeType: string) => clickCallbackRef.current(nodeId, nodeType),
		[]
	);

	const handleNodeHover = useCallback(
		(nodeId: string, x: number, y: number) => hoverCallbackRef.current(nodeId, x, y),
		[]
	);

	const handleNodeLeave = useCallback(() => leaveCallbackRef.current(), []);

	useLayoutEffect(() => {
		if (!hoverState || !previewRef.current) return;

		const updatePreviewSize = () => {
			if (!previewRef.current) return;
			const { width, height } = previewRef.current.getBoundingClientRect();
			setPreviewSize({ width, height });
		};

		updatePreviewSize();
		const observer = new ResizeObserver(updatePreviewSize);
		observer.observe(previewRef.current);
		return () => observer.disconnect();
	}, [hoverState, hoveredItem]);

	const previewPosition = useMemo(() => {
		if (!hoverState) return null;
		return calculatePreviewPosition(hoverState.x, hoverState.y, previewSize);
	}, [hoverState, previewSize]);

	return (
		<div className="h-[calc(100vh-6rem)] w-full overflow-hidden p-4">
			<GraphSurface
				edges={edges}
				nodes={nodes}
				onNodeClick={(node) => void handleNodeClick(node.id, node.type)}
				onNodeHover={(node, x, y) => (node ? handleNodeHover(node.id, x, y) : handleNodeLeave())}
				tagColors={tagColors}
			/>
			{hoverState && previewPosition && (
				<div
					ref={previewRef}
					className="pointer-events-none fixed z-50 box-border max-h-[calc(100vh-1rem)] w-80 max-w-80 min-w-80 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
					style={{ left: previewPosition.x, top: previewPosition.y }}>
					{hoveredItem ? (
						<div
							className={`${
								hoveredItem.type === "note" ? "rounded-xl" : "rounded-sm shadow-sm"
							} pointer-events-none`}>
							<Suspense fallback={<div className="h-30" aria-busy="true" />}>
								<ItemPreview item={hoveredItem} index={0} onItemClick={() => {}} disableAnimation />
							</Suspense>
						</div>
					) : (
						<div className="rounded-lg bg-popover p-4">
							<h3 className="text-base font-semibold">{hoverState.node.content || "Без названия"}</h3>
							<p className="text-sm text-muted-foreground">{getTypeLabel(hoverState.node.type)}</p>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function getContentId(node: Node) {
	if (node.metadata && typeof node.metadata === "object" && "content_id" in node.metadata) {
		const contentId = node.metadata.content_id;
		if (typeof contentId === "string") return contentId;
	}

	return node.id;
}

function calculatePreviewPosition(cursorX: number, cursorY: number, size: { width: number; height: number }) {
	const CARD_W = size.width;
	const CARD_H = size.height;
	const GAP = 8;
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const maxX = Math.max(8, vw - CARD_W - 8);
	const maxY = Math.max(8, vh - CARD_H - 8);

	if (cursorY + CARD_H + GAP <= vh) {
		return { x: Math.min(cursorX, maxX), y: cursorY + GAP };
	}

	if (cursorY - CARD_H - GAP >= 0) {
		return { x: Math.min(cursorX, maxX), y: cursorY - CARD_H - GAP };
	}

	if (cursorX - CARD_W - GAP >= 0) {
		return { x: cursorX - CARD_W - GAP, y: Math.min(cursorY, maxY) };
	}

	if (cursorX + CARD_W + GAP <= vw) {
		return { x: cursorX + GAP, y: Math.min(cursorY, maxY) };
	}

	return {
		x: Math.max(8, Math.min(cursorX, maxX)),
		y: Math.max(8, Math.min(cursorY, maxY)),
	};
}

function getTypeLabel(type: string) {
	const typeMap: Record<string, string> = {
		note: "Заметка",
		link: "Ссылка",
		media: "Медиа",
		audio: "Аудио",
		todo: "Задача",
		doc: "Документ",
		pdf: "PDF",
		docx: "DOCX",
		epub: "EPUB",
		xlsx: "Excel",
		csv: "CSV",
		tag: "Тег",
	};
	return typeMap[type] || type;
}
