# Database Development

## Mechanism for Granular Linking

### Application Side:

When you view or edit a document (like a Note or Project), the MDX parser/renderer must generate unique, stable HTML id attributes for every significant element (headers, list items, project sections).

### Database Side:

When a link is created in the Markdown source (e.g., [[My Project#Achievement-3]]), the application saves the link in document_links as:

```json
{
  "source_id": "Current Note ID",
  "target_id": "My Project Document ID",
  "target_fragment": "Achievement-3"
}
```

structured_documents table:

```json
owner_id:
doc_type:
is_published:
slug:
content_data: GIN
title:
parent_id:
```

document_paths table:

```json
document_id: Unique B-tree
path_slug: Unique B-tree
path_text: B-tree
depth: B-tree
```

document_links table:

```json
source_id: Unique B-tree
target_id: Unique B-tree
target_fragment: B-tree
link_type: B-tree (enum: wikilink, embed, section-ref)
```

tags table:

document_tags table:
