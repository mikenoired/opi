import type { Content } from "./schemas";

export const documentContentTypes: Content["type"][] = ["doc", "pdf", "docx", "epub", "xlsx", "csv"];

export function getQueryTypesForFilter(type: Content["type"]) {
	return type === "doc" ? documentContentTypes : [type];
}

export function isContentTypeFilterAvailable(type: Content["type"], availableTypes: Content["type"][]) {
	return getQueryTypesForFilter(type).some((queryType) => availableTypes.includes(queryType));
}
