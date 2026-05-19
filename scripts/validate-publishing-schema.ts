/**
 * Publishing schema CI gate — analog to validate-collaboration-schema.ts.
 *
 * The collab check enforces "every Node/Mark is in the collab server schema."
 * This check enforces publishing-specific contracts:
 *
 *   1. Every block file in extensions/publishing/blocks/ exports both
 *      <Name> (client) and Server<Name> (server-safe) from Node.create.
 *   2. Every Server<Name> is imported and listed in
 *      extensions/publishing/server-runtime.ts's editorServerExtensions array.
 *   3. The id passed to registerBlock({ type: ... }) matches the name passed
 *      to Node.create({ name: ... }) in the same file.
 *
 * Run via `pnpm publishing:schema:check`. Hard-gates publishing PRs in CI.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, basename, relative } from "node:path";

const REPO_ROOT = process.cwd();
const BLOCKS_DIR = join(REPO_ROOT, "extensions/publishing/blocks");
const SERVER_RUNTIME = join(REPO_ROOT, "extensions/publishing/server-runtime.ts");

interface BlockDiscovery {
  file: string;
  nodeName: string;
  clientExport: string;
  serverExport: string;
  registeredType: string | null;
}

// `Node.create({ name: "foo" })` — anchored to capture the name only.
const NODE_CREATE_RE =
  /\bNode\.create(?:<[^>]+>)?\s*\(\s*\{\s*name:\s*["']([^"']+)["']/g;

// `export const Foo = Node.create(...)` — captures the const name.
const NAMED_NODE_EXPORT_RE =
  /export\s+const\s+([A-Z][A-Za-z0-9]*)\s*=\s*Node\.create/g;

// `registerBlock({ ... type: "foo" ... })` — captures the type value.
// The match is permissive about whitespace and other fields appearing first.
const REGISTER_BLOCK_RE =
  /registerBlock\(\s*\{[^}]*?\btype:\s*["']([^"']+)["']/g;

function discoverBlocks(): BlockDiscovery[] {
  const blocks: BlockDiscovery[] = [];

  for (const entry of readdirSync(BLOCKS_DIR)) {
    if (!entry.endsWith(".ts")) continue;
    const file = join(BLOCKS_DIR, entry);
    const source = readFileSync(file, "utf8");

    const nodeNames = [...source.matchAll(NODE_CREATE_RE)].map((m) => m[1]);
    const exportedNames = [...source.matchAll(NAMED_NODE_EXPORT_RE)].map(
      (m) => m[1],
    );
    const registeredTypes = [...source.matchAll(REGISTER_BLOCK_RE)].map(
      (m) => m[1],
    );

    // A well-formed block file should contain exactly two Node.create calls
    // with the same name (client + server variants) and exactly two
    // matching named exports (one PascalCase, one "Server<PascalCase>").
    const uniqueNodeNames = Array.from(new Set(nodeNames));
    if (uniqueNodeNames.length !== 1) {
      throw new Error(
        `${relative(REPO_ROOT, file)}: expected exactly one TipTap node name, found [${uniqueNodeNames.join(", ")}].`,
      );
    }
    const nodeName = uniqueNodeNames[0]!;

    const clientExport = exportedNames.find((n) => !n.startsWith("Server"));
    const serverExport = exportedNames.find((n) => n.startsWith("Server"));
    if (!clientExport || !serverExport) {
      throw new Error(
        `${relative(REPO_ROOT, file)}: expected both a client export and a Server* export, found [${exportedNames.join(", ")}].`,
      );
    }
    if (`Server${clientExport}` !== serverExport) {
      throw new Error(
        `${relative(REPO_ROOT, file)}: server export "${serverExport}" should be "Server${clientExport}" to match client export "${clientExport}".`,
      );
    }

    const registeredType = registeredTypes[0] ?? null;
    if (!registeredType) {
      throw new Error(
        `${relative(REPO_ROOT, file)}: missing registerBlock({ type: ... }) call.`,
      );
    }
    if (registeredType !== nodeName) {
      throw new Error(
        `${relative(REPO_ROOT, file)}: registerBlock type "${registeredType}" does not match Node.create name "${nodeName}".`,
      );
    }

    blocks.push({
      file: basename(file),
      nodeName,
      clientExport,
      serverExport,
      registeredType,
    });
  }

  return blocks.sort((a, b) => a.file.localeCompare(b.file));
}

function assertServerRuntimeCovers(blocks: BlockDiscovery[]): void {
  const source = readFileSync(SERVER_RUNTIME, "utf8");

  const missing = blocks.filter((block) => {
    const imported = new RegExp(
      `\\bimport\\s*\\{[^}]*\\b${block.serverExport}\\b`,
    ).test(source);
    const listed = new RegExp(`\\b${block.serverExport}\\b`).test(
      source.split("editorServerExtensions")[1] ?? "",
    );
    return !imported || !listed;
  });

  if (missing.length > 0) {
    const details = missing
      .map(
        (b) =>
          `- ${b.serverExport} (from blocks/${b.file}) not imported or not listed in editorServerExtensions`,
      )
      .join("\n");
    throw new Error(
      `extensions/publishing/server-runtime.ts is missing coverage for:\n${details}`,
    );
  }
}

function main(): void {
  const blocks = discoverBlocks();
  assertServerRuntimeCovers(blocks);
  console.log(`Publishing schema validation passed (${blocks.length} blocks).`);
}

main();
