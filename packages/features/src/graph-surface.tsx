import type { GraphEdge, GraphNode } from "@synapse/api";
import { useI18n } from "@synapse/i18n";
import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";

export interface GraphSurfaceProps {
	edges: GraphEdge[];
	nodes: GraphNode[];
	onNodeClick?(node: GraphNode): void;
	onNodeHover?(node: GraphNode | null, x: number, y: number): void;
	tagColors?: Record<string, number>;
}

const size = 1_000;
const center = size / 2;

/** Shared, dependency-free relationship map for browser and Electron renderers. */
export function GraphSurface({ edges, nodes, onNodeClick, onNodeHover, tagColors = {} }: GraphSurfaceProps) {
	const { t } = useI18n();
	const [zoom, setZoom] = useState(1);
	const [pan, setPan] = useState({ x: 0, y: 0 });
	const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
	const layout = useMemo(() => layoutGraph(nodes), [nodes]);
	const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
	const visibleEdges = useMemo(
		() =>
			edges.flatMap((edge) => {
				if (!edge.fromNode || !edge.toNode) return [];
				const from = layout.get(edge.fromNode);
				const to = layout.get(edge.toNode);
				return from && to ? [{ from, id: `${edge.fromNode}:${edge.toNode}`, to }] : [];
			}),
		[edges, layout]
	);
	if (!nodes.length)
		return (
			<div className="grid h-full min-h-80 place-items-center rounded-2xl border bg-card text-sm text-muted-foreground">
				{t("library.graphEmpty")}
			</div>
		);
	const view = size / zoom;
	const viewBox = `${center - view / 2 - pan.x} ${center - view / 2 - pan.y} ${view} ${view}`;
	return (
		<div className="relative h-full min-h-100 overflow-hidden rounded-2xl border bg-card shadow-sm">
			<svg
				aria-label={t("graph.label")}
				className="h-full w-full touch-none select-none"
				viewBox={viewBox}
				onPointerDown={(event) => {
					if (event.target instanceof SVGCircleElement) return;
					setDrag({ x: event.clientX, y: event.clientY });
				}}
				onPointerMove={(event) => {
					if (!drag) return;
					setPan((current) => ({
						x: current.x - (event.clientX - drag.x) / zoom,
						y: current.y - (event.clientY - drag.y) / zoom,
					}));
					setDrag({ x: event.clientX, y: event.clientY });
				}}
				onPointerUp={() => setDrag(null)}
				onPointerLeave={() => {
					setDrag(null);
					onNodeHover?.(null, 0, 0);
				}}
				onWheel={(event) => {
					event.preventDefault();
					setZoom((value) => Math.min(2.25, Math.max(0.55, value * (event.deltaY > 0 ? 0.88 : 1.12))));
				}}>
				<rect fill="transparent" height={size} width={size} x="0" y="0" />
				<g stroke="hsl(var(--border))" strokeOpacity="0.65" strokeWidth={1.5 / zoom}>
					{visibleEdges.map((edge) => (
						<line key={edge.id} x1={edge.from.x} x2={edge.to.x} y1={edge.from.y} y2={edge.to.y} />
					))}
				</g>
				{[...layout.values()].map((position) => {
					const node = byId.get(position.id);
					if (!node) return null;
					const isTag = node.type === "tag";
					const color = isTag
						? palette(tagColors[tagId(node) ?? node.id] ?? node.color)
						: "hsl(var(--primary))";
					return (
						<g
							key={node.id}
							tabIndex={0}
							role="button"
							aria-label={node.content ?? node.type}
							className="cursor-pointer outline-none"
							onClick={() => onNodeClick?.(node)}
							onFocus={() => onNodeHover?.(node, 0, 0)}
							onMouseEnter={(event) => onNodeHover?.(node, event.clientX, event.clientY)}
							onMouseLeave={() => onNodeHover?.(null, 0, 0)}>
							<circle
								cx={position.x}
								cy={position.y}
								fill={color}
								fillOpacity={isTag ? 0.9 : 0.76}
								r={position.radius}
							/>
							<text
								fill="hsl(var(--foreground))"
								fontSize={14 / Math.sqrt(zoom)}
								pointerEvents="none"
								textAnchor="middle"
								x={position.x}
								y={position.y + position.radius + 17 / Math.sqrt(zoom)}>
								{label(node.content ?? node.type)}
							</text>
						</g>
					);
				})}
			</svg>
			<div className="absolute right-4 bottom-4 flex overflow-hidden rounded-lg border bg-background shadow-sm">
				<button
					aria-label={t("graph.zoomOut")}
					className="grid size-9 place-items-center hover:bg-muted"
					onClick={() => setZoom((value) => Math.max(0.55, value * 0.85))}
					type="button">
					<Minus className="size-4" />
				</button>
				<button
					aria-label={t("graph.zoomIn")}
					className="grid size-9 place-items-center border-l hover:bg-muted"
					onClick={() => setZoom((value) => Math.min(2.25, value * 1.15))}
					type="button">
					<Plus className="size-4" />
				</button>
			</div>
		</div>
	);
}

function layoutGraph(nodes: GraphNode[]) {
	const tags = nodes.filter((node) => node.type === "tag");
	const content = nodes.filter((node) => node.type !== "tag");
	const placed = new Map<string, { id: string; radius: number; x: number; y: number }>();
	const place = (entries: GraphNode[], radius: number, nodeRadius: number, offset = 0) =>
		entries.forEach((node, index) => {
			const angle = offset + (index / Math.max(entries.length, 1)) * Math.PI * 2;
			placed.set(node.id, {
				id: node.id,
				radius: nodeRadius,
				x: center + Math.cos(angle) * radius,
				y: center + Math.sin(angle) * radius,
			});
		});
	place(content, Math.max(120, 90 + Math.sqrt(content.length) * 38), 14);
	place(tags, Math.max(250, 190 + Math.sqrt(tags.length) * 48), 18, Math.PI / 8);
	return placed;
}

function tagId(node: GraphNode): string | undefined {
	return node.metadata &&
		typeof node.metadata === "object" &&
		"tag_id" in node.metadata &&
		typeof node.metadata.tag_id === "string"
		? node.metadata.tag_id
		: undefined;
}
function label(value: string) {
	return value.length > 28 ? `${value.slice(0, 27)}…` : value;
}
function palette(value: number) {
	return `hsl(${(value * 47) % 360} 68% 52%)`;
}
