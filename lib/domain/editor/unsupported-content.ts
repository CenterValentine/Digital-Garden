import { getSchema, type Extensions, type JSONContent } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import { v4 as uuid } from "uuid";

export const UNSUPPORTED_BLOCK_NODE_TYPE = "unsupportedBlock";
export const UNSUPPORTED_INLINE_NODE_TYPE = "unsupportedInline";

type UnsupportedReplacement =
  | typeof UNSUPPORTED_BLOCK_NODE_TYPE
  | typeof UNSUPPORTED_INLINE_NODE_TYPE
  | "dropped";

export interface UnsupportedContentRewrite {
  kind: "node" | "mark";
  unsupported: string;
  path: string;
  replacement: UnsupportedReplacement | "removedMark";
  original: unknown;
}

export interface SanitizedTipTapContentResult {
  json: JSONContent;
  rewritten: UnsupportedContentRewrite[];
}

interface SanitizeContext {
  schema: Schema;
  validNodes: Set<string>;
  validMarks: Set<string>;
  rewritten: UnsupportedContentRewrite[];
}

interface SanitizeNodeResult {
  node: JSONContent | null;
  changed: boolean;
}

type JSONMark = NonNullable<JSONContent["marks"]>[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function parseOriginalJson(value: unknown): JSONContent | null {
  if (typeof value !== "string" || value.length === 0) return null;

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? (parsed as JSONContent) : null;
  } catch {
    return null;
  }
}

function canPlaceChild(
  schema: Schema,
  parentTypeName: string | null,
  childTypeName: string
) {
  if (!parentTypeName) return false;

  const parentType = schema.nodes[parentTypeName];
  const childType = schema.nodes[childTypeName];
  if (!parentType || !childType) return false;

  return parentType.contentMatch.matchType(childType) !== null;
}

function createUnsupportedBlockNode(original: JSONContent): JSONContent {
  return {
    type: UNSUPPORTED_BLOCK_NODE_TYPE,
    attrs: {
      blockId: uuid(),
      blockType: UNSUPPORTED_BLOCK_NODE_TYPE,
      originalType: typeof original.type === "string" ? original.type : "unknown",
      originalJson: safeStringify(original),
    },
  };
}

function createUnsupportedInlineNode(original: JSONContent): JSONContent {
  return {
    type: UNSUPPORTED_INLINE_NODE_TYPE,
    attrs: {
      originalType: typeof original.type === "string" ? original.type : "unknown",
      originalJson: safeStringify(original),
    },
  };
}

function sanitizeMarks(
  marks: JSONMark[] | undefined,
  path: string,
  context: SanitizeContext
) {
  if (!Array.isArray(marks) || marks.length === 0) {
    return { marks, changed: false };
  }

  let changed = false;
  const sanitized: JSONMark[] = [];

  marks.forEach((mark, index) => {
    const type = typeof mark?.type === "string" ? mark.type : "";
    if (type && context.validMarks.has(type)) {
      sanitized.push(mark);
      return;
    }

    changed = true;
    context.rewritten.push({
      kind: "mark",
      unsupported: type || "unknown-mark",
      path: `${path}/marks[${index}]`,
      replacement: "removedMark",
      original: cloneJsonValue(mark),
    });
  });

  return {
    marks: changed ? sanitized : marks,
    changed,
  };
}

function createUnsupportedReplacement(
  original: JSONContent,
  parentTypeName: string | null,
  path: string,
  context: SanitizeContext
): SanitizeNodeResult {
  if (canPlaceChild(context.schema, parentTypeName, UNSUPPORTED_BLOCK_NODE_TYPE)) {
    context.rewritten.push({
      kind: "node",
      unsupported: typeof original.type === "string" ? original.type : "unknown-node",
      path,
      replacement: UNSUPPORTED_BLOCK_NODE_TYPE,
      original: cloneJsonValue(original),
    });

    return {
      node: createUnsupportedBlockNode(original),
      changed: true,
    };
  }

  if (canPlaceChild(context.schema, parentTypeName, UNSUPPORTED_INLINE_NODE_TYPE)) {
    context.rewritten.push({
      kind: "node",
      unsupported: typeof original.type === "string" ? original.type : "unknown-node",
      path,
      replacement: UNSUPPORTED_INLINE_NODE_TYPE,
      original: cloneJsonValue(original),
    });

    return {
      node: createUnsupportedInlineNode(original),
      changed: true,
    };
  }

  context.rewritten.push({
    kind: "node",
    unsupported: typeof original.type === "string" ? original.type : "unknown-node",
    path,
    replacement: "dropped",
    original: cloneJsonValue(original),
  });

  return {
    node: null,
    changed: true,
  };
}

function tryReviveUnsupportedNode(
  node: JSONContent,
  parentTypeName: string | null,
  path: string,
  context: SanitizeContext
): SanitizeNodeResult | null {
  if (
    node.type !== UNSUPPORTED_BLOCK_NODE_TYPE &&
    node.type !== UNSUPPORTED_INLINE_NODE_TYPE
  ) {
    return null;
  }

  const attrs = isRecord(node.attrs) ? node.attrs : null;
  const originalType =
    attrs && typeof attrs.originalType === "string" ? attrs.originalType : null;
  if (!originalType || !context.validNodes.has(originalType)) {
    return null;
  }

  const revivedJson = parseOriginalJson(attrs?.originalJson);
  if (!revivedJson || revivedJson.type !== originalType) {
    return null;
  }

  return sanitizeNode(revivedJson, parentTypeName, `${path}/revived`, context);
}

function sanitizeNode(
  node: JSONContent,
  parentTypeName: string | null,
  path: string,
  context: SanitizeContext
): SanitizeNodeResult {
  const revived = tryReviveUnsupportedNode(node, parentTypeName, path, context);
  if (revived) {
    return {
      node: revived.node,
      changed: true,
    };
  }

  const type = typeof node.type === "string" ? node.type : "";
  if (!type || !context.validNodes.has(type)) {
    return createUnsupportedReplacement(node, parentTypeName, path, context);
  }

  const markResult = sanitizeMarks(node.marks, path, context);

  let contentChanged = false;
  let nextContent: JSONContent[] | undefined;

  if (Array.isArray(node.content)) {
    const sanitizedChildren: JSONContent[] = [];

    node.content.forEach((child, index) => {
      const childPath = `${path}/content[${index}]`;
      if (!isRecord(child)) {
        contentChanged = true;
        context.rewritten.push({
          kind: "node",
          unsupported: "invalid-node",
          path: childPath,
          replacement: "dropped",
          original: child,
        });
        return;
      }

      const result = sanitizeNode(child as JSONContent, type, childPath, context);
      if (!result.node) {
        contentChanged = true;
        return;
      }

      if (result.changed || result.node !== child) {
        contentChanged = true;
      }
      sanitizedChildren.push(result.node);
    });

    if (contentChanged) {
      nextContent = sanitizedChildren;
    }
  }

  if (!markResult.changed && !contentChanged) {
    return {
      node,
      changed: false,
    };
  }

  const nextNode: JSONContent = { ...node };

  if (markResult.changed) {
    if (markResult.marks && markResult.marks.length > 0) {
      nextNode.marks = markResult.marks;
    } else {
      delete nextNode.marks;
    }
  }

  if (contentChanged) {
    if (nextContent) {
      nextNode.content = nextContent;
    } else {
      delete nextNode.content;
    }
  }

  return {
    node: nextNode,
    changed: true,
  };
}

export function sanitizeTipTapJsonWithExtensions(
  json: JSONContent | null | undefined,
  extensions: Extensions
): SanitizedTipTapContentResult {
  const schema = getSchema(extensions);
  const context: SanitizeContext = {
    schema,
    validNodes: new Set(Object.keys(schema.nodes)),
    validMarks: new Set(Object.keys(schema.marks)),
    rewritten: [],
  };

  if (!json || !isRecord(json)) {
    return {
      json: {
        type: "doc",
        content: [{ type: "paragraph" }],
      },
      rewritten: context.rewritten,
    };
  }

  const result = sanitizeNode(json, null, "root", context);
  const sanitizedRoot = result.node;

  if (sanitizedRoot?.type === "doc") {
    return {
      json: sanitizedRoot,
      rewritten: context.rewritten,
    };
  }

  if (sanitizedRoot && canPlaceChild(schema, "doc", sanitizedRoot.type || "")) {
    return {
      json: {
        type: "doc",
        content: [sanitizedRoot],
      },
      rewritten: context.rewritten,
    };
  }

  return {
    json: {
      type: "doc",
      content: [{ type: "paragraph" }],
    },
    rewritten: context.rewritten,
  };
}
