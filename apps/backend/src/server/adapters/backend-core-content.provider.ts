import type {
	ContentRepository as CoreContentRepository,
	GraphProvider,
	TagTitleRecord,
	TagTitleRepository,
} from "@monolyth/core";

import ContentRepository from "../repositories/content.repository";

/**
 * Backend persistence adapter for the Core Content and graph ports.
 *
 * Transaction ownership remains with the calling Backend service: construct this
 * adapter from a transaction-scoped repository when a workflow mutates data.
 */
export class BackendCoreContentProvider implements CoreContentRepository, GraphProvider, TagTitleRepository {
	constructor(private readonly repository: ContentRepository) {}

	async findAll(
		...args: Parameters<CoreContentRepository["findAll"]>
	): ReturnType<CoreContentRepository["findAll"]> {
		return await this.repository.getAll(...args);
	}

	async findByTagFilter(
		...args: Parameters<CoreContentRepository["findByTagFilter"]>
	): ReturnType<CoreContentRepository["findByTagFilter"]> {
		return await this.repository.getWithTagFilter(...args);
	}

	async findTagRelations(
		...args: Parameters<CoreContentRepository["findTagRelations"]>
	): ReturnType<CoreContentRepository["findTagRelations"]> {
		return await this.repository.contentTagsWithTitles(...args);
	}

	async search(
		...args: Parameters<CoreContentRepository["search"]>
	): ReturnType<CoreContentRepository["search"]> {
		return await this.repository.searchFtsFiltered(...args);
	}

	async findSuggestionsForTag(
		...args: Parameters<CoreContentRepository["findSuggestionsForTag"]>
	): ReturnType<CoreContentRepository["findSuggestionsForTag"]> {
		return await this.repository.getSuggestionsForTag(...args);
	}

	async findSuggestionTagPriorities(
		...args: Parameters<CoreContentRepository["findSuggestionTagPriorities"]>
	): ReturnType<CoreContentRepository["findSuggestionTagPriorities"]> {
		return await this.repository.getSuggestionTagPriorities(...args);
	}

	async findTagContentPreviews(
		...args: Parameters<CoreContentRepository["findTagContentPreviews"]>
	): ReturnType<CoreContentRepository["findTagContentPreviews"]> {
		return await this.repository.getTagsWithContentPreview(...args);
	}

	async findTagPage(
		...args: Parameters<CoreContentRepository["findTagPage"]>
	): ReturnType<CoreContentRepository["findTagPage"]> {
		return await this.repository.getContentTagPage(...args);
	}

	async findAvailableContentTypes(): ReturnType<CoreContentRepository["findAvailableContentTypes"]> {
		return await this.repository.getAvailableTypes().then((rows) => rows.map((row) => row.type));
	}

	async createContentTags(
		...args: Parameters<CoreContentRepository["createContentTags"]>
	): ReturnType<CoreContentRepository["createContentTags"]> {
		await this.repository.createContentTags(...args);
	}

	async deleteContent(contentId: string): Promise<void> {
		await this.repository.deleteContent(contentId);
	}

	async deleteContentTags(contentId: string): Promise<void> {
		await this.repository.deleteContentTag(contentId);
	}

	async createContentTagEdges(
		...args: Parameters<GraphProvider["createContentTagEdges"]>
	): ReturnType<GraphProvider["createContentTagEdges"]> {
		await this.repository.createContentTagEdges(...args);
	}

	async createTagNode(title: string): Promise<void> {
		await this.repository.createNode(title);
	}

	async deleteContentNodeGraph(contentNodeId: string): Promise<void> {
		await this.repository.deleteContentNodeGraph(contentNodeId);
	}

	async deleteContentTagEdges(contentNodeId: string): Promise<void> {
		await this.repository.deleteTagEdge(contentNodeId);
	}

	async findContentNodeId(contentId: string): Promise<string | undefined> {
		return (await this.repository.getNodeByContentId(contentId))?.id;
	}

	async getOrCreateTagNodeIds(tagIds: string[]): Promise<Record<string, string>> {
		return await this.repository.getOrCreateTagNodeIds(tagIds);
	}

	async createTags(titles: string[]): Promise<TagTitleRecord[]> {
		return await this.repository.createTags(titles.map((title) => ({ title })));
	}

	async findTagsByTitle(titles: string[]): Promise<TagTitleRecord[]> {
		return await this.repository.getTagsByTitle(titles);
	}
}
