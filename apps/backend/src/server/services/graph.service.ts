import type { Context } from "../context";
import GraphRepository from "../repositories/graph.repository";

export default class GraphService {
	private repo: GraphRepository;

	constructor(ctx: Context) {
		this.repo = new GraphRepository(ctx);
	}

	async getGraph() {
		const [nodes, edges] = await Promise.all([this.repo.getNodes(), this.repo.getEdges()]);
		return { nodes, edges };
	}
}
