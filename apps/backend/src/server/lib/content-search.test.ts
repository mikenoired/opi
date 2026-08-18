import { describe, expect, test } from "bun:test";

import { buildContentSearchText } from "@synapse/shared/content-search";

describe("content search text", () => {
	test("extracts title, tags, tiptap text and raw link text", () => {
		const text = buildContentSearchText({
			content: JSON.stringify({
				content: [{ content: [{ text: "Body text", type: "text" }], type: "paragraph" }],
				rawText: "Link text",
				type: "doc",
			}),
			tags: ["tag"],
			title: "Title",
		});

		expect(text).toBe("Title tag Link text Body text");
	});
});
