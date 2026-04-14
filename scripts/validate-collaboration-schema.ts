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
const CREATE_RE = /\b(Node|Mark)\.create(?:<[^>]+>)?\s*\(\s*\{[\s\S]*?\bname:\s*["']([^"']+)["']/g;

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
        const name = match[2];
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
          ],
        },
      ],
    },
    ["wikiLink", "tag", "personMention", "aiHighlight"]
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
