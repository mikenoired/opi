CREATE OR REPLACE FUNCTION synapse_merge_duplicate_tags()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	WITH ranked_tags AS (
		SELECT
			id,
			user_id,
			first_value(id) OVER (
				PARTITION BY user_id, lower(btrim(title))
				ORDER BY id
			) AS canonical_id,
			row_number() OVER (
				PARTITION BY user_id, lower(btrim(title))
				ORDER BY id
			) AS row_number
		FROM tags
		WHERE user_id IS NOT NULL AND btrim(title) <> ''
	),
	duplicate_tags AS (
		SELECT id AS duplicate_id, user_id, canonical_id
		FROM ranked_tags
		WHERE row_number > 1
	)
	INSERT INTO content_tags (content_id, tag_id, user_id)
	SELECT DISTINCT ct.content_id, duplicate_tags.canonical_id, ct.user_id
	FROM content_tags ct
	INNER JOIN duplicate_tags ON duplicate_tags.duplicate_id = ct.tag_id
	WHERE NOT EXISTS (
		SELECT 1
		FROM content_tags existing
		WHERE existing.content_id = ct.content_id
			AND existing.tag_id = duplicate_tags.canonical_id
			AND existing.user_id IS NOT DISTINCT FROM ct.user_id
	);

	WITH ranked_tags AS (
		SELECT
			id,
			user_id,
			first_value(id) OVER (
				PARTITION BY user_id, lower(btrim(title))
				ORDER BY id
			) AS canonical_id,
			row_number() OVER (
				PARTITION BY user_id, lower(btrim(title))
				ORDER BY id
			) AS row_number
		FROM tags
		WHERE user_id IS NOT NULL AND btrim(title) <> ''
	),
	duplicate_tags AS (
		SELECT id AS duplicate_id
		FROM ranked_tags
		WHERE row_number > 1
	)
	DELETE FROM content_tags ct
	USING duplicate_tags
	WHERE ct.tag_id = duplicate_tags.duplicate_id;

	WITH ranked_tags AS (
		SELECT
			id,
			user_id,
			first_value(id) OVER (
				PARTITION BY user_id, lower(btrim(title))
				ORDER BY id
			) AS canonical_id,
			row_number() OVER (
				PARTITION BY user_id, lower(btrim(title))
				ORDER BY id
			) AS row_number
		FROM tags
		WHERE user_id IS NOT NULL AND btrim(title) <> ''
	),
	duplicate_tags AS (
		SELECT id AS duplicate_id, user_id, canonical_id
		FROM ranked_tags
		WHERE row_number > 1
	)
	UPDATE nodes node
	SET
		content = canonical.title,
		metadata = jsonb_set(
			coalesce(node.metadata, '{}'::jsonb),
			'{tag_id}',
			to_jsonb(duplicate_tags.canonical_id::text),
			true
		)
	FROM duplicate_tags
	INNER JOIN tags canonical ON canonical.id = duplicate_tags.canonical_id
	WHERE node.type = 'tag'
		AND node.user_id IS NOT DISTINCT FROM duplicate_tags.user_id
		AND node.metadata->>'tag_id' = duplicate_tags.duplicate_id::text;

	WITH duplicate_content_tags AS (
		SELECT
			ctid,
			row_number() OVER (
				PARTITION BY content_id, tag_id, user_id
				ORDER BY ctid
			) AS row_number
		FROM content_tags
	)
	DELETE FROM content_tags ct
	USING duplicate_content_tags
	WHERE ct.ctid = duplicate_content_tags.ctid
		AND duplicate_content_tags.row_number > 1;

	WITH tag_nodes AS (
		SELECT
			id,
			user_id,
			metadata->>'tag_id' AS tag_id,
			first_value(id) OVER (
				PARTITION BY user_id, metadata->>'tag_id'
				ORDER BY id
			) AS canonical_node_id,
			row_number() OVER (
				PARTITION BY user_id, metadata->>'tag_id'
				ORDER BY id
			) AS row_number
		FROM nodes
		WHERE type = 'tag' AND metadata ? 'tag_id'
	),
	duplicate_nodes AS (
		SELECT id AS duplicate_node_id, canonical_node_id
		FROM tag_nodes
		WHERE row_number > 1
	)
	UPDATE edges edge
	SET to_node = duplicate_nodes.canonical_node_id
	FROM duplicate_nodes
	WHERE edge.to_node = duplicate_nodes.duplicate_node_id;

	WITH tag_nodes AS (
		SELECT
			id,
			user_id,
			metadata->>'tag_id' AS tag_id,
			first_value(id) OVER (
				PARTITION BY user_id, metadata->>'tag_id'
				ORDER BY id
			) AS canonical_node_id,
			row_number() OVER (
				PARTITION BY user_id, metadata->>'tag_id'
				ORDER BY id
			) AS row_number
		FROM nodes
		WHERE type = 'tag' AND metadata ? 'tag_id'
	),
	duplicate_nodes AS (
		SELECT id AS duplicate_node_id, canonical_node_id
		FROM tag_nodes
		WHERE row_number > 1
	)
	UPDATE edges edge
	SET from_node = duplicate_nodes.canonical_node_id
	FROM duplicate_nodes
	WHERE edge.from_node = duplicate_nodes.duplicate_node_id;

	WITH duplicate_edges AS (
		SELECT
			ctid,
			row_number() OVER (
				PARTITION BY from_node, to_node, relation_type, user_id
				ORDER BY ctid
			) AS row_number
		FROM edges
	)
	DELETE FROM edges edge
	USING duplicate_edges
	WHERE edge.ctid = duplicate_edges.ctid
		AND duplicate_edges.row_number > 1;

	WITH tag_nodes AS (
		SELECT
			id,
			user_id,
			metadata->>'tag_id' AS tag_id,
			row_number() OVER (
				PARTITION BY user_id, metadata->>'tag_id'
				ORDER BY id
			) AS row_number
		FROM nodes
		WHERE type = 'tag' AND metadata ? 'tag_id'
	)
	DELETE FROM nodes node
	USING tag_nodes
	WHERE node.id = tag_nodes.id
		AND tag_nodes.row_number > 1;

	WITH ranked_tags AS (
		SELECT
			id,
			user_id,
			row_number() OVER (
				PARTITION BY user_id, lower(btrim(title))
				ORDER BY id
			) AS row_number
		FROM tags
		WHERE user_id IS NOT NULL AND btrim(title) <> ''
	)
	DELETE FROM tags tag
	USING ranked_tags
	WHERE tag.id = ranked_tags.id
		AND ranked_tags.row_number > 1;
END;
$$;

CREATE OR REPLACE FUNCTION synapse_merge_duplicate_tags_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM synapse_merge_duplicate_tags();
	RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tags_merge_duplicate_tags ON tags;
CREATE TRIGGER tags_merge_duplicate_tags
AFTER INSERT OR UPDATE OF title, user_id ON tags
FOR EACH STATEMENT
EXECUTE FUNCTION synapse_merge_duplicate_tags_trigger();

SELECT synapse_merge_duplicate_tags();

CREATE UNIQUE INDEX IF NOT EXISTS tags_user_id_normalized_title_unique_idx
ON tags (user_id, lower(btrim(title)))
WHERE user_id IS NOT NULL AND btrim(title) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS content_tags_content_id_tag_id_unique_idx
ON content_tags (content_id, tag_id);
