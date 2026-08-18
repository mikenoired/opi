import { ContentTag as SharedContentTag, type ContentTagProps } from "@monolyth/features";
import { useMemo } from "react";

import { api } from "@/shared/api/hooks";
import { useRouter } from "@/shared/router/navigation";

/** Web binding resolves server tag colour and maps navigation to browser history. */
export function ContentTag({ color, onNavigate, tag, tagId, ...props }: ContentTagProps) {
	const router = useRouter();
	const { data: knownTags = [] } = api.content.getTags.useQuery(undefined, {
		enabled: color === undefined,
		refetchOnMount: true,
		staleTime: 30_000,
	});
	const resolvedColor = useMemo(
		() =>
			color ??
			knownTags.find(
				(candidate) =>
					candidate.id === tagId ||
					candidate.title.trim().toLocaleLowerCase() === tag.trim().toLocaleLowerCase()
			)?.color ??
			0,
		[color, knownTags, tag, tagId]
	);
	return (
		<SharedContentTag
			{...props}
			tag={tag}
			tagId={tagId}
			color={resolvedColor}
			onNavigate={
				tagId
					? (id) => {
							onNavigate?.(id);
							router.push(`/tags/${id}`);
						}
					: undefined
			}
		/>
	);
}
