import { eq, inArray } from "drizzle-orm";

import type { Context } from "../context";
import { edges, nodes, tags } from "../db/schema";
import { requireAuth } from "../lib/auth-guard";

export default class GraphRepository {
	constructor(private readonly ctx: Context) {}

	async getNodes() {
		requireAuth(this.ctx);

		const data = await this.ctx.db.query.nodes.findMany({
			where: eq(nodes.userId, this.ctx.user.id),
			columns: {
				id: true,
				content: true,
				type: true,
				metadata: true,
			},
		});

		const tagIds = data.flatMap((node) => {
			if (node.type !== "tag" || !node.metadata || typeof node.metadata !== "object") return [];
			if (!("tag_id" in node.metadata) || typeof node.metadata.tag_id !== "string") return [];
			return [node.metadata.tag_id];
		});
		const tagRows = tagIds.length
			? await this.ctx.db.query.tags.findMany({
					columns: { color: true, id: true },
					where: inArray(tags.id, tagIds),
				})
			: [];
		const colorByTagId = new Map(tagRows.map((tag) => [tag.id, tag.color]));

		return data.map((node) => {
			const metadata = node.metadata as { tag_id?: string } | null;
			return { ...node, color: metadata?.tag_id ? (colorByTagId.get(metadata.tag_id) ?? 0) : 0 };
		});
	}

	async getEdges() {
		requireAuth(this.ctx);

		const data = await this.ctx.db.query.edges.findMany({
			where: eq(edges.userId, this.ctx.user.id),
		});

		return data;
	}
}
