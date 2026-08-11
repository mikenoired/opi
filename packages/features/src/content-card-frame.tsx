import type { Content } from "@synapse/shared/schemas";
import type { ReactNode } from "react";

/** Shared visual frame for every content card; platform code only supplies the card body and actions. */
export function ContentCardFrame({ children, type }: { children: ReactNode; type: Content["type"] }) {
	const padding =
		type === "note" ? "flex min-h-44 flex-col p-5" : type === "todo" || type === "link" ? "p-3" : "p-0";
	return (
		<div
			className={`relative cursor-pointer overflow-hidden transition-all ${type === "note" ? "min-h-44 rounded-xl bg-card text-card-foreground" : "hover:shadow-lg"}`}>
			<div className={padding}>{children}</div>
		</div>
	);
}
