/**
 * sync-session-terms.ts — ship development / architectural terms captured in a
 * Claude Code session into the Digital Garden as one note per term.
 *
 * Companion to the `sync-terms` skill: the skill extracts terms from the live
 * conversation and writes them to a JSON file; this script authenticates,
 * plans, and (only with --apply) writes.
 *
 * Usage:
 *   npx tsx scripts/sync-session-terms.ts --input terms.json            # DRY RUN
 *   npx tsx scripts/sync-session-terms.ts --input terms.json --apply    # write
 *   npx tsx scripts/sync-session-terms.ts --input terms.json --verbose  # show bodies
 *
 * Environment (see `_terms-sync-env.ts`; put these in .env.terms-sync.local):
 *   TERMS_SYNC_DATABASE_URL   the garden to write to — no fallback to DATABASE_URL
 *   TERMS_SYNC_TOKEN          ServiceToken with the garden:terms-sync scope
 *   TERMS_SYNC_ACCOUNT_EMAIL  the DG account that token must resolve to
 *
 * Safety model:
 *   - Dry run is the default; --apply is the only path that writes.
 *   - The owner is DERIVED from the token, never supplied. `TERMS_SYNC_ACCOUNT_EMAIL`
 *     is a second, independent assertion: if the token resolves to a different
 *     account than the one named, the run aborts. A stolen token cannot be
 *     retargeted, and revoking the ServiceToken row ends write access at once.
 *   - Existing notes are never regenerated. Re-syncing a known term APPENDS a
 *     dated bullet to its "Session log"; everything you hand-edited above that
 *     section survives untouched. See `decideTermAction`.
 *   - Notes with live collaboration state get `reseedCollaborationDocumentFromNote`
 *     after the payload write, because for those the Y.Doc — not NotePayload —
 *     is what the editor renders. Only docs that ALREADY exist are reseeded;
 *     the reseed helper upserts, and we don't want to enable collaboration on a
 *     note as a side effect of syncing it.
 *
 * tsx resolution notes (learned the hard way in `regen-degraded-notes.ts`):
 *   - `@tiptap/html/server` must be imported by its explicit subpath. The bare
 *     specifier resolves to the browser build under tsx and throws.
 *   - Do NOT import the `@/lib/domain/content` barrel: it statically pulls
 *     `extensions-server`, whose lowlight dependency is undefined under tsx's
 *     CJS transform, crashing before main() runs. Import module paths directly.
 *   - `getCollaborationServerExtensions()` loads cleanly and — per the
 *     `collab:schema:check` CI gate — is guaranteed to cover every Node/Mark in
 *     the app, so markdown parsed through it is schema-identical to the editor's.
 */

import "./_terms-sync-env";
import { describeTermsSyncTarget } from "./_terms-sync-env";

import { readFileSync } from "node:fs";

import { generateJSON } from "@tiptap/html/server";
import type { JSONContent } from "@tiptap/core";
import { marked } from "marked";

import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { validateServiceToken } from "@/extensions/workflows/server/service-token";
import { extractSearchTextFromTipTap } from "@/lib/domain/content/search-text";
import { getCollaborationServerExtensions } from "@/lib/domain/collaboration/extensions";
import { reseedCollaborationDocumentFromNote } from "@/lib/domain/collaboration/documents";

import {
  GARDEN_TERMS_SYNC_SCOPE,
  GLOSSARY_FOLDER_SLUG,
  GLOSSARY_FOLDER_TITLE,
  renderSessionLogEntry,
  renderTermMarkdown,
  tagsForTerm,
  termsFileSchema,
  type TermRecord,
} from "./_terms-sync-shared";

// ---------------------------------------------------------------------------
// markdown → TipTap
// ---------------------------------------------------------------------------

/** Local twin of `markdownToTiptap`, using the collaboration extension set. */
function markdownToTiptapForScript(markdown: string): JSONContent {
  const html = marked.parse(markdown, { async: false, gfm: true }) as string;
  return generateJSON(html, getCollaborationServerExtensions()) as JSONContent;
}

// ---------------------------------------------------------------------------
// Merge policy
// ---------------------------------------------------------------------------

type TermAction = "create" | "append" | "skip";

interface ExistingNote {
  id: string;
  title: string;
  tiptapJson: JSONContent;
  searchText: string;
}

/**
 * Decide what to do with a term whose note already exists.
 *
 * The tension: a glossary is only trustworthy if re-running the sync can't
 * degrade it, but it's only useful if repeated encounters with a term
 * accumulate rather than vanish. Regenerating the note would keep the
 * machine-written parts fresh at the cost of destroying anything you wrote by
 * hand — the wrong trade for a digital garden, where the hand-written layer is
 * the point.
 *
 * So: never rewrite, only accrue. A term seen again appends one dated bullet to
 * its session log, and a term whose exact context line is already recorded is a
 * no-op — that idempotency is what makes re-running a sync safe.
 */
function decideTermAction(
  term: TermRecord,
  existing: ExistingNote | null,
): { action: TermAction; reason: string } {
  if (!existing) {
    return { action: "create", reason: "new term" };
  }

  const entry = renderSessionLogEntry(term);
  // Compare against searchText: it is the flattened text of the doc, so a
  // bullet already present shows up here regardless of node structure.
  const alreadyLogged = existing.searchText.includes(term.context.trim());

  if (alreadyLogged) {
    return { action: "skip", reason: "this session's context already logged" };
  }

  return { action: "append", reason: `appending session log entry: ${entry.slice(0, 60)}…` };
}

// ---------------------------------------------------------------------------
// TipTap document surgery
// ---------------------------------------------------------------------------

/**
 * Append a session-log bullet to an existing note's document.
 *
 * If the document already ends in a bullet list — the shape `renderTermMarkdown`
 * produces — the new item joins that list so the log stays one contiguous list
 * rather than a stack of single-item lists.
 */
function appendSessionLogEntry(doc: JSONContent, term: TermRecord): JSONContent {
  const snippet = markdownToTiptapForScript(renderSessionLogEntry(term));
  const snippetList = snippet.content?.[0];
  const content = [...(doc.content ?? [])];
  const last = content[content.length - 1];

  if (
    last?.type === "bulletList" &&
    snippetList?.type === "bulletList" &&
    snippetList.content
  ) {
    content[content.length - 1] = {
      ...last,
      content: [...(last.content ?? []), ...snippetList.content],
    };
  } else {
    content.push(...(snippet.content ?? []));
  }

  return { ...doc, content };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

interface AuthenticatedAccount {
  userId: string;
  email: string;
  username: string;
  tokenPrefix: string;
}

/**
 * Authenticate the run and resolve the account to write as.
 *
 * The owner id comes out of the validated token — it is never read from the
 * environment — so the credential itself determines whose garden is written.
 * The configured email is then asserted against the resolved account as an
 * independent second gate.
 */
async function authenticate(): Promise<AuthenticatedAccount> {
  const token = process.env.TERMS_SYNC_TOKEN?.trim();
  const expectedEmail = process.env.TERMS_SYNC_ACCOUNT_EMAIL?.trim().toLowerCase();

  if (!token) {
    throw new Error(
      "TERMS_SYNC_TOKEN is not set. Mint one with:\n" +
        "    npx tsx scripts/mint-terms-sync-token.ts --account <email>",
    );
  }
  if (!expectedEmail) {
    throw new Error(
      "TERMS_SYNC_ACCOUNT_EMAIL is not set. Terms sync refuses to run without a\n" +
        "named account to assert the token against.",
    );
  }

  const validated = await validateServiceToken(token, GARDEN_TERMS_SYNC_SCOPE);
  if (!validated) {
    throw new Error(
      `Token rejected: unknown, revoked, expired, or missing the ${GARDEN_TERMS_SYNC_SCOPE} scope.`,
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: validated.userId },
    select: { id: true, email: true, username: true },
  });

  if (!user) {
    throw new Error("Token resolved to a user that no longer exists.");
  }

  if (user.email.toLowerCase() !== expectedEmail) {
    throw new Error(
      `Account mismatch. The token belongs to ${user.email}, but\n` +
        `TERMS_SYNC_ACCOUNT_EMAIL names ${expectedEmail}. Refusing to write —\n` +
        "this usually means an env file and a credential came from different gardens.",
    );
  }

  return {
    userId: user.id,
    email: user.email,
    username: user.username,
    tokenPrefix: validated.record.tokenPrefix,
  };
}

// ---------------------------------------------------------------------------
// Glossary folder + tags
// ---------------------------------------------------------------------------

async function findGlossaryFolder(ownerId: string) {
  return prisma.contentNode.findFirst({
    where: {
      ownerId,
      slug: GLOSSARY_FOLDER_SLUG,
      contentType: "folder",
      deletedAt: null,
    },
    select: { id: true, title: true },
  });
}

async function createGlossaryFolder(ownerId: string) {
  return prisma.contentNode.create({
    data: {
      ownerId,
      title: GLOSSARY_FOLDER_TITLE,
      slug: GLOSSARY_FOLDER_SLUG,
      contentType: "folder",
      parentId: null,
      customIcon: "book-open",
      folderPayload: {
        create: {
          viewMode: "list",
          sortMode: null,
          viewPrefs: {},
          includeReferencedContent: false,
        },
      },
    },
    select: { id: true, title: true },
  });
}

/** Upsert the Tag rows for a term and link them to its note. */
async function applyTags(ownerId: string, contentId: string, term: TermRecord) {
  for (const slug of tagsForTerm(term)) {
    const tag = await prisma.tag.upsert({
      where: { userId_slug: { userId: ownerId, slug } },
      update: {},
      create: { userId: ownerId, slug, name: slug },
      select: { id: true },
    });
    await prisma.contentTag.upsert({
      where: { contentId_tagId: { contentId, tagId: tag.id } },
      update: {},
      create: { contentId, tagId: tag.id },
    });
  }
}

/**
 * Reseed the Y.Doc, but only for notes that already have collaboration state.
 * The reseed helper upserts, so calling it unconditionally would silently
 * enable collaboration on every synced note.
 */
async function reseedIfCollaborative(contentId: string): Promise<boolean> {
  const existing = await prisma.collaborationDocument.findUnique({
    where: { contentId },
    select: { id: true },
  });
  if (!existing) return false;
  await reseedCollaborationDocumentFromNote(prisma, contentId);
  return true;
}

// ---------------------------------------------------------------------------
// Planning + writing
// ---------------------------------------------------------------------------

interface PlannedTerm {
  term: TermRecord;
  action: TermAction;
  reason: string;
  existing: ExistingNote | null;
}

async function findExistingTermNote(
  ownerId: string,
  folderId: string,
  term: TermRecord,
): Promise<ExistingNote | null> {
  const node = await prisma.contentNode.findFirst({
    where: {
      ownerId,
      parentId: folderId,
      contentType: "note",
      deletedAt: null,
      title: { equals: term.term, mode: "insensitive" },
    },
    select: {
      id: true,
      title: true,
      notePayload: { select: { tiptapJson: true, searchText: true } },
    },
  });

  if (!node?.notePayload) return null;

  return {
    id: node.id,
    title: node.title,
    tiptapJson: node.notePayload.tiptapJson as JSONContent,
    searchText: node.notePayload.searchText,
  };
}

/**
 * Slugs are unique per OWNER, not per folder (`@@unique([ownerId, slug])`), so
 * a term called "Overview" would collide with any other note of that name.
 * Namespacing under `glossary-` keeps the glossary self-contained; the numeric
 * suffix loop handles collisions within the namespace itself.
 */
async function uniqueGlossarySlug(ownerId: string, term: string): Promise<string> {
  const base = `glossary-${term
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 180)}`;

  let candidate = base;
  let suffix = 2;
  while (
    await prisma.contentNode.findFirst({
      where: { ownerId, slug: candidate },
      select: { id: true },
    })
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
    if (suffix > 100) throw new Error(`Could not find a free slug for "${term}"`);
  }
  return candidate;
}

async function createTermNote(
  ownerId: string,
  folderId: string,
  term: TermRecord,
): Promise<string> {
  const json = markdownToTiptapForScript(renderTermMarkdown(term));
  const searchText = extractSearchTextFromTipTap(json);
  const slug = await uniqueGlossarySlug(ownerId, term.term);

  const maxOrder = await prisma.contentNode.aggregate({
    where: { parentId: folderId, deletedAt: null },
    _max: { displayOrder: true },
  });

  const node = await prisma.contentNode.create({
    data: {
      ownerId,
      title: term.term,
      slug,
      contentType: "note",
      parentId: folderId,
      displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
      notePayload: {
        create: {
          tiptapJson: json as unknown as Prisma.InputJsonValue,
          searchText,
          metadata: {
            wordCount: searchText.split(/\s+/).filter(Boolean).length,
            characterCount: searchText.length,
            termsSync: {
              kind: term.kind,
              firstCapturedAt: term.sessionDate,
            },
          } as unknown as Prisma.InputJsonValue,
        },
      },
    },
    select: { id: true },
  });

  await applyTags(ownerId, node.id, term);
  return node.id;
}

async function appendToTermNote(
  ownerId: string,
  existing: ExistingNote,
  term: TermRecord,
): Promise<void> {
  const json = appendSessionLogEntry(existing.tiptapJson, term);
  const searchText = extractSearchTextFromTipTap(json);

  await prisma.notePayload.update({
    where: { contentId: existing.id },
    data: {
      tiptapJson: json as unknown as Prisma.InputJsonValue,
      searchText,
    },
  });

  await applyTags(ownerId, existing.id, term);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

async function main() {
  const argv = process.argv.slice(2);
  const inputPath = readFlag(argv, "input");
  const apply = argv.includes("--apply");
  const verbose = argv.includes("--verbose");

  if (!inputPath) {
    console.error("  ✗ --input <path-to-terms.json> is required.");
    process.exit(1);
  }

  const parsed = termsFileSchema.safeParse(
    JSON.parse(readFileSync(inputPath, "utf8")),
  );
  if (!parsed.success) {
    console.error("  ✗ Input file failed validation:\n");
    console.error(JSON.stringify(parsed.error.issues, null, 2));
    process.exit(1);
  }
  const { session, terms } = parsed.data;

  const account = await authenticate();
  const target = describeTermsSyncTarget();

  console.log("");
  console.log(`  mode:     ${apply ? "APPLY — writes to the garden" : "DRY RUN — no writes"}`);
  console.log(`  target:   ${target.host} / ${target.database}`);
  console.log(`  account:  ${account.email} (${account.username})`);
  console.log(`  token:    ${account.tokenPrefix}… [${GARDEN_TERMS_SYNC_SCOPE}]`);
  if (session) console.log(`  session:  ${session}`);
  console.log(`  terms:    ${terms.length}`);
  console.log("");

  let folder = await findGlossaryFolder(account.userId);
  if (!folder) {
    if (!apply) {
      console.log(`  + would create folder "${GLOSSARY_FOLDER_TITLE}" at the tree root\n`);
    } else {
      folder = await createGlossaryFolder(account.userId);
      console.log(`  + created folder "${folder.title}"\n`);
    }
  }

  const plan: PlannedTerm[] = [];
  for (const term of terms) {
    const existing = folder
      ? await findExistingTermNote(account.userId, folder.id, term)
      : null;
    const { action, reason } = decideTermAction(term, existing);
    plan.push({ term, action, reason, existing });
  }

  const symbols: Record<TermAction, string> = { create: "+", append: "~", skip: "·" };
  for (const item of plan) {
    console.log(
      `  ${symbols[item.action]} ${item.term.term.padEnd(34)} ${item.action.padEnd(7)} ${item.reason}`,
    );
    if (verbose) {
      console.log(`      kind: ${item.term.kind}`);
      console.log(`      ${item.term.summary}`);
      if (item.term.related.length > 0) {
        console.log(`      related: ${item.term.related.join(", ")}`);
      }
      console.log("");
    }
  }

  const counts = plan.reduce<Record<TermAction, number>>(
    (acc, item) => ({ ...acc, [item.action]: acc[item.action] + 1 }),
    { create: 0, append: 0, skip: 0 },
  );

  console.log("");
  console.log(
    `  ${counts.create} to create · ${counts.append} to append · ${counts.skip} unchanged`,
  );

  if (!apply) {
    console.log("\n  Dry run — nothing was written. Re-run with --apply to commit.\n");
    return;
  }

  if (!folder) {
    throw new Error("Glossary folder missing after apply — this should not happen.");
  }

  let reseeded = 0;
  for (const item of plan) {
    if (item.action === "skip") continue;

    if (item.action === "create") {
      const id = await createTermNote(account.userId, folder.id, item.term);
      if (await reseedIfCollaborative(id)) reseeded += 1;
    } else if (item.existing) {
      await appendToTermNote(account.userId, item.existing, item.term);
      if (await reseedIfCollaborative(item.existing.id)) reseeded += 1;
    }
  }

  console.log(
    `\n  ✓ wrote ${counts.create + counts.append} note(s)` +
      (reseeded > 0 ? `, reseeded ${reseeded} collaborative Y.Doc(s)` : "") +
      "\n",
  );
}

main()
  .catch((error: unknown) => {
    console.error(`\n  ✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
