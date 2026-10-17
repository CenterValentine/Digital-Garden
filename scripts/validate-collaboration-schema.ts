import { getSchema } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { TiptapTransformer } from "@hocuspocus/transformer";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import * as Y from "yjs";
import {
  hasMeaningfulTipTapContent,
  ydocUpdateHasMeaningfulDefaultContent,
} from "@/lib/domain/collaboration/content-safety";
import { getCollaborationServerExtensions } from "@/lib/domain/collaboration/extensions";

type SchemaKind = "node" | "mark";

interface DiscoveredSchemaExtension {
  kind: SchemaKind;
  name: string;
  filePath: string;
}

const REPO_ROOT = process.cwd();
const SCAN_ROOTS = [
  join(REPO_ROOT, "lib/domain/editor/extensions"),
  join(REPO_ROOT, "extensions"),
];

const SOURCE_FILE_RE = /\.(ts|tsx)$/;
// `name:` may be a string literal or an ALL_CAPS constant bound to one
// (privateText uses `name: PRIVATE_TEXT_MARK`). A constant is resolved through
// every `const X = "…"` under lib/domain plus the file's own; one that cannot
// be resolved fails the gate rather than hiding a mark from it. Lower-case
// identifiers (`name: string` in a type position) are skipped as before.
const CREATE_RE = /\b(Node|Mark)\.create(?:<[^>]+>)?\s*\(\s*\{[\s\S]*?\bname:\s*(?:["']([^"']+)["']|([A-Z][A-Z0-9_]+)\b)/g;
const STRING_CONST_RE = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*["']([^"'\n]+)["']/g;

let stringConstants: Map<string, string> | null = null;
function exportedStringConstants(): Map<string, string> {
  if (stringConstants) return stringConstants;
  const map = new Map<string, string>();
  for (const filePath of walkFiles(join(REPO_ROOT, "lib/domain"))) {
    const source = readFileSync(filePath, "utf8");
    for (const match of source.matchAll(STRING_CONST_RE)) {
      if (!map.has(match[1])) map.set(match[1], match[2]);
    }
  }
  stringConstants = map;
  return map;
}

function resolveSchemaName(literal: string | undefined, identifier: string | undefined, source: string, filePath: string): string {
  if (literal) return literal;
  const local = Array.from(source.matchAll(STRING_CONST_RE)).find((m) => m[1] === identifier);
  if (local) return local[2];
  const exported = identifier ? exportedStringConstants().get(identifier) : undefined;
  if (exported) return exported;
  throw new Error(
    `Cannot resolve the schema name \`${identifier}\` in ${relative(REPO_ROOT, filePath)} — use a string literal or an exported string const.`
  );
}

function walkFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      return walkFiles(path);
    }

    return SOURCE_FILE_RE.test(path) ? [path] : [];
  });
}

function discoverSchemaExtensions(): DiscoveredSchemaExtension[] {
  const discovered = new Map<string, DiscoveredSchemaExtension>();

  for (const root of SCAN_ROOTS) {
    for (const filePath of walkFiles(root)) {
      const source = readFileSync(filePath, "utf8");
      for (const match of source.matchAll(CREATE_RE)) {
        const kind = match[1] === "Mark" ? "mark" : "node";
        const name = resolveSchemaName(match[2], match[3], source, filePath);
        const key = `${kind}:${name}`;

        if (!discovered.has(key)) {
          discovered.set(key, { kind, name, filePath });
        }
      }
    }
  }

  return Array.from(discovered.values()).sort((a, b) =>
    `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`)
  );
}

function collectJsonTypes(doc: JSONContent): Set<string> {
  const types = new Set<string>();

  function visit(node: JSONContent) {
    if (node.type) {
      types.add(node.type);
    }
    for (const mark of node.marks ?? []) {
      if (mark.type) {
        types.add(mark.type);
      }
    }
    for (const child of node.content ?? []) {
      visit(child);
    }
  }

  visit(doc);
  return types;
}

function assertNoDuplicateTopLevelExtensionNames() {
  const names = getCollaborationServerExtensions()
    .map((extension) => extension.name)
    .filter((name): name is string => Boolean(name));
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

  if (duplicates.length > 0) {
    throw new Error(
      `Collaboration extension list has duplicate top-level names: ${Array.from(
        new Set(duplicates)
      ).join(", ")}`
    );
  }
}

function assertDiscoveredExtensionsAreSupported() {
  const schema = getSchema(getCollaborationServerExtensions());
  const schemaNodes = new Set(Object.keys(schema.nodes));
  const schemaMarks = new Set(Object.keys(schema.marks));

  const missing = discoverSchemaExtensions().filter((extension) => {
    if (extension.kind === "mark") {
      return !schemaMarks.has(extension.name);
    }
    return !schemaNodes.has(extension.name);
  });

  if (missing.length > 0) {
    const details = missing
      .map(
        (extension) =>
          `- ${extension.kind} "${extension.name}" from ${relative(
            REPO_ROOT,
            extension.filePath
          )}`
      )
      .join("\n");
    throw new Error(
      `Collaboration schema is missing server-safe coverage for editor schema extensions:\n${details}\n\nAdd a server-safe extension and include it in getCollaborationServerExtensions().`
    );
  }
}

function assertFixtureRoundTrip(name: string, doc: JSONContent, requiredTypes: string[]) {
  const ydoc = TiptapTransformer.toYdoc(doc, "default", getCollaborationServerExtensions());
  const roundTripped = TiptapTransformer.fromYdoc(ydoc, "default") as JSONContent;
  const roundTrippedTypes = collectJsonTypes(roundTripped);
  const missingTypes = requiredTypes.filter((type) => !roundTrippedTypes.has(type));

  if (missingTypes.length > 0) {
    throw new Error(
      `${name} fixture lost schema types after JSON -> Y.Doc -> JSON round trip: ${missingTypes.join(
        ", "
      )}`
    );
  }
}

function main() {
  assertNoDuplicateTopLevelExtensionNames();
  assertDiscoveredExtensionsAreSupported();
  assertMeaningfulContentPolicy();

  assertFixtureRoundTrip(
    "inline custom nodes and marks",
    {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Linked to " },
            {
              type: "wikiLink",
              attrs: {
                targetTitle: "Garden state",
                displayText: "Garden state",
              },
            },
            { type: "text", text: " with " },
            {
              type: "tag",
              attrs: {
                tagId: "tag-1",
                tagName: "collaboration",
                slug: "collaboration",
                color: "#3b82f6",
              },
            },
            { type: "text", text: " and " },
            {
              type: "personMention",
              attrs: {
                personId: "person-1",
                label: "Violet Valentine",
                slug: "violet-valentine",
              },
            },
            {
              type: "text",
              text: " highlighted",
              marks: [{ type: "aiHighlight", attrs: { source: "ai" } }],
            },
            {
              type: "text",
              text: " and commented",
              marks: [{ type: "comment", attrs: { threadId: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a" } }],
            },
          ],
        },
      ],
    },
    ["wikiLink", "tag", "personMention", "aiHighlight", "comment"]
  );

  assertFixtureRoundTrip(
    "block extension nodes",
    {
      type: "doc",
      content: [
        {
          type: "callout",
          attrs: {
            type: "warning",
            title: "Schema hardening",
          },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Do not blank documents." }],
            },
          ],
        },
        {
          type: "sectionHeader",
          attrs: {
            level: 2,
            label: "Collaboration",
            dividerStyle: "solid",
            showContainer: false,
          },
          content: [{ type: "text", text: "Collaboration" }],
        },
        {
          type: "calendarViewBlock",
          attrs: {
            view: "month",
            title: "Calendar",
            showBorder: true,
          },
        },
      ],
    },
    ["callout", "sectionHeader", "calendarViewBlock"]
  );

  console.log("Collaboration schema validation passed.");
}

function assertMeaningfulContentPolicy() {
  const emptyDoc: JSONContent = {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
  const blockOnlyDoc: JSONContent = {
    type: "doc",
    content: [{ type: "blockDivider", attrs: { style: "solid" } }],
  };
  const emptyYdoc = TiptapTransformer.toYdoc(
    emptyDoc,
    "default",
    getCollaborationServerExtensions()
  );
  const blockOnlyYdoc = TiptapTransformer.toYdoc(
    blockOnlyDoc,
    "default",
    getCollaborationServerExtensions()
  );

  if (hasMeaningfulTipTapContent(emptyDoc)) {
    throw new Error("Empty structural document was incorrectly classified as meaningful.");
  }
  if (!hasMeaningfulTipTapContent(blockOnlyDoc)) {
    throw new Error("Block-only document was incorrectly classified as empty.");
  }
  if (ydocUpdateHasMeaningfulDefaultContent(Y.encodeStateAsUpdate(emptyYdoc))) {
    throw new Error("Empty Yjs document was incorrectly classified as meaningful.");
  }
  if (!ydocUpdateHasMeaningfulDefaultContent(Y.encodeStateAsUpdate(blockOnlyYdoc))) {
    throw new Error("Block-only Yjs document was incorrectly classified as empty.");
  }

  emptyYdoc.destroy();
  blockOnlyYdoc.destroy();
}

main();
