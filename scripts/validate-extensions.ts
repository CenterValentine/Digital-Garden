import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { ALL_EXTENSION_MANIFESTS } from "@/lib/extensions/manifests";

/**
 * Extension-registration consistency gate.
 *
 * A built-in extension must be registered in BOTH lists — they are split by
 * the client/server import boundary (installed.ts bundles client runtimes;
 * manifests.ts is server-safe data the /settings/extensions/[id] route reads)
 * and nothing at the type level keeps them in sync. Registering in only one
 * yields a working runtime but a 404 settings page (this bit the workflows
 * extension, PR #103). This gate turns that silent runtime failure into a
 * hard build failure.
 *
 * Design: the parity/coverage checks are FULLY STATIC (read the two registry
 * files + the filesystem) so the gate never imports client runtime code and
 * never depends on how an extension declares its id (string literal vs const
 * reference). Only the plain-data ALL_EXTENSION_MANIFESTS is imported, for the
 * id-uniqueness and icon-resolution checks.
 */

const REPO_ROOT = process.cwd();
const EXTENSIONS_DIR = join(REPO_ROOT, "extensions");
const INSTALLED_PATH = join(REPO_ROOT, "lib/extensions/installed.ts");
const MANIFESTS_PATH = join(REPO_ROOT, "lib/extensions/manifests.ts");
const ICONS_PATH = join(REPO_ROOT, "lib/extensions/icons.tsx");

/** kebab-case folder names only — skips " 2" filesystem artifacts (CLAUDE.md). */
const EXTENSION_FOLDER_RE = /^[a-z0-9-]+$/;

/** Real extensions on disk: a folder with both a manifest and a runtime module. */
function discoverExtensionFolders(): string[] {
  return readdirSync(EXTENSIONS_DIR)
    .filter((name) => EXTENSION_FOLDER_RE.test(name))
    .filter((name) => statSync(join(EXTENSIONS_DIR, name)).isDirectory())
    .filter(
      (name) =>
        existsSync(join(EXTENSIONS_DIR, name, "manifest.ts")) &&
        existsSync(join(EXTENSIONS_DIR, name, "module.ts"))
    )
    .sort();
}

/**
 * Extract the `[ ... ]` block of a named array declaration from source.
 * Anchors on the `=` so the type annotation's brackets (e.g. `: Foo[]`) are
 * skipped and the assignment's array literal is matched. Assumes a flat array
 * (no nested `]`), which holds for these registry lists.
 */
function arrayLiteralBlock(source: string, arrayName: string): string {
  const declIndex = source.indexOf(arrayName);
  const eq = source.indexOf("=", declIndex);
  const open = source.indexOf("[", eq);
  const close = source.indexOf("]", open);
  if (declIndex === -1 || eq === -1 || open === -1 || close === -1) {
    throw new Error(`Could not locate the ${arrayName} array literal.`);
  }
  return source.slice(open + 1, close);
}

/**
 * Folders that are FULLY registered in a registry file: the folder's entry
 * module is imported AND the imported symbol appears in the registry array.
 * Catches both "not imported" and "imported but forgotten in the array".
 */
function registeredFolders(
  sourcePath: string,
  entry: "manifest" | "module",
  arrayName: string
): Set<string> {
  const source = readFileSync(sourcePath, "utf8");
  const arrayBlock = arrayLiteralBlock(source, arrayName);
  const importRe = new RegExp(
    `import\\s+\\{\\s*([A-Za-z0-9_]+)\\s*\\}\\s+from\\s+["']@/extensions/([^/"']+)/${entry}["']`,
    "g"
  );

  const registered = new Set<string>();
  for (const match of source.matchAll(importRe)) {
    const symbol = match[1];
    const folder = match[2];
    if (new RegExp(`\\b${symbol}\\b`).test(arrayBlock)) {
      registered.add(folder);
    }
  }
  return registered;
}

/** Icon component names the extension icon registry actually maps. */
function registeredIconNames(): Set<string> {
  const source = readFileSync(ICONS_PATH, "utf8");
  const block = arrayLiteralBlockBraced(source, "EXTENSION_ICONS");
  const names = new Set<string>();
  for (const line of block.split(/[,\n]/)) {
    const name = line.trim().replace(/:.*$/, "").trim();
    if (/^[A-Za-z0-9_]+$/.test(name)) names.add(name);
  }
  return names;
}

/** Like arrayLiteralBlock but for a `{ ... }` object literal. */
function arrayLiteralBlockBraced(source: string, declName: string): string {
  const declIndex = source.indexOf(declName);
  const open = source.indexOf("{", declIndex);
  const close = source.indexOf("}", open);
  if (declIndex === -1 || open === -1 || close === -1) {
    throw new Error(`Could not locate the ${declName} object literal.`);
  }
  return source.slice(open + 1, close);
}

function setDiff<T>(a: Set<T>, b: Set<T>): T[] {
  return [...a].filter((item) => !b.has(item)).sort();
}

function main() {
  const errors: string[] = [];

  const fsFolders = new Set(discoverExtensionFolders());
  const manifestFolders = registeredFolders(
    MANIFESTS_PATH,
    "manifest",
    "ALL_EXTENSION_MANIFESTS"
  );
  const installedFolders = registeredFolders(
    INSTALLED_PATH,
    "module",
    "BUILT_IN_EXTENSIONS"
  );

  // 1. Parity: both registry files must cover the same extensions.
  const inManifestsOnly = setDiff(manifestFolders, installedFolders);
  const inInstalledOnly = setDiff(installedFolders, manifestFolders);
  if (inManifestsOnly.length > 0) {
    errors.push(
      `Registered in manifests.ts (ALL_EXTENSION_MANIFESTS) but NOT installed.ts (BUILT_IN_EXTENSIONS): ${inManifestsOnly.join(", ")}`
    );
  }
  if (inInstalledOnly.length > 0) {
    errors.push(
      `Registered in installed.ts (BUILT_IN_EXTENSIONS) but NOT manifests.ts (ALL_EXTENSION_MANIFESTS): ${inInstalledOnly.join(", ")}. ` +
        `Its runtime works but /settings/extensions/<id> will 404 — add it to ALL_EXTENSION_MANIFESTS.`
    );
  }

  // 2. Coverage: every extension on disk must be registered in both lists.
  const missingFromManifests = setDiff(fsFolders, manifestFolders);
  const missingFromInstalled = setDiff(fsFolders, installedFolders);
  if (missingFromManifests.length > 0) {
    errors.push(
      `Extension folder(s) not registered in manifests.ts: ${missingFromManifests.join(", ")}`
    );
  }
  if (missingFromInstalled.length > 0) {
    errors.push(
      `Extension folder(s) not registered in installed.ts: ${missingFromInstalled.join(", ")}`
    );
  }

  // 3. Stale: registered folders that no longer exist on disk.
  const staleManifests = setDiff(manifestFolders, fsFolders);
  const staleInstalled = setDiff(installedFolders, fsFolders);
  if (staleManifests.length > 0 || staleInstalled.length > 0) {
    const stale = [...new Set([...staleManifests, ...staleInstalled])].sort();
    errors.push(
      `Registered extension folder(s) missing on disk (missing manifest.ts/module.ts, or deleted): ${stale.join(", ")}`
    );
  }

  // 4. Unique, non-empty ids in the manifest list.
  const ids = ALL_EXTENSION_MANIFESTS.map((m) => m.id);
  const dupeIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupeIds.length > 0) {
    errors.push(`Duplicate extension ids: ${[...new Set(dupeIds)].join(", ")}`);
  }
  const emptyIds = ALL_EXTENSION_MANIFESTS.filter((m) => !m.id?.trim());
  if (emptyIds.length > 0) {
    errors.push(`Extension manifest(s) with empty id: ${emptyIds.length}`);
  }

  // 5. Icon resolution: iconName must map, else it silently falls back to Puzzle.
  const iconNames = registeredIconNames();
  const unmappedIcons = ALL_EXTENSION_MANIFESTS.filter(
    (m) => !iconNames.has(m.iconName)
  );
  if (unmappedIcons.length > 0) {
    errors.push(
      `Extension(s) with an iconName not in lib/extensions/icons.tsx (would silently render the Puzzle fallback): ${unmappedIcons
        .map((m) => `${m.id} → "${m.iconName}"`)
        .join(", ")}`
    );
  }

  if (errors.length > 0) {
    console.error("Extension registration validation FAILED:\n");
    for (const error of errors) console.error(`- ${error}`);
    console.error(
      "\nEvery built-in extension must be registered in BOTH lib/extensions/installed.ts and lib/extensions/manifests.ts. See CLAUDE.md → \"Adding a New Extension Module\"."
    );
    process.exit(1);
  }

  console.log(
    `Extension registration validation passed (${fsFolders.size} extensions, both lists in sync).`
  );
}

main();
