/**
 * Gate: a collaborator joining a note never duplicates its content.
 *
 * `pnpm collab:lineage:check`
 *
 * Y.js merges two copies of a document by UNION. Two copies that grew from one
 * seed share their items, so the union is the document once. Two copies seeded
 * independently from the same JSON share nothing, so the union is the document
 * TWICE — every paragraph doubled, and the doubled state is then persisted.
 * Owner report 2026-10-08: "when a collaborator joins, the content in a note
 * gets duplicated".
 *
 * Three ways a rival copy was being made, each pinned here:
 *
 * 1. The load path rebuilt the stored Y.Doc from the payload whenever the
 *    payload was newer than the last mirror stamp — with a FRESH seed, and
 *    without recording that it had done so. The canonical-state fetch and
 *    Hocuspocus's own load each rebuilt, so the first collaborator to join got
 *    two rival copies and merged them. Charter marks, run ledgers and quests
 *    bump the payload's `updatedAt` without touching content, so they set this
 *    off too. Now: the payload is applied ONTO the stored copy as a diff, the
 *    stamp is written in the same transaction, and a per-document lock makes
 *    two loads take turns.
 *
 * 2. A solo editor (collaboration-local: Y.Doc bound, no live provider) saves
 *    through REST, so the payload moves ahead of the stored copy while the
 *    editor's own Y.Doc holds the same edits. When a collaborator arrived, the
 *    server caught up from the payload with its own items and the editor then
 *    brought ITS items for the same text. Now: the solo save carries its Y
 *    state, merged into the stored copy (refused if it is a rival).
 *
 * 3. A browser can still hold a rival copy (from (1) before this fix, or from
 *    the client's local seed when the canonical fetch failed). Before the
 *    first connect, the client compares lineages and moves onto the server's
 *    when that loses nothing.
 *
 * The checks drive the REAL `documents.ts` functions against an in-memory
 * Prisma stand-in (no database needed), with the advisory lock emulated so
 * concurrency is exercised too.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as Y from "yjs";
import type { JSONContent } from "@tiptap/core";
import { TiptapTransformer } from "@hocuspocus/transformer";

import type { PrismaClient } from "../lib/database/generated/prisma";
import { getCollaborationServerExtensions } from "../lib/domain/collaboration/extensions";
import {
  loadCollaborationYDocState,
  mergeSoloCollaborationCopy,
} from "../lib/domain/collaboration/documents";
import {
  alignOntoServerCopy,
  mergePushedCopy,
  planAlignment,
  planLocalCatchUp,
  sharesLineage,
  writeFragmentAsDiff,
} from "../lib/domain/collaboration/lineage";
import { noteSaveBody } from "../lib/domain/content/save-meta";

const extensions = getCollaborationServerExtensions();
let failures = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (!condition) {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — got: ${detail}` : ""}`);
  }
}

// ── Documents ───────────────────────────────────────────────────────────────

function para(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}
function docOf(...texts: string[]): JSONContent {
  return { type: "doc", content: texts.map(para) };
}
function seed(doc: JSONContent): Y.Doc {
  return TiptapTransformer.toYdoc(doc, "default", extensions);
}
function docFrom(...updates: Uint8Array[]): Y.Doc {
  const ydoc = new Y.Doc();
  for (const update of updates) Y.applyUpdate(ydoc, update);
  return ydoc;
}
/** The visible paragraphs, in order. */
function textsOf(ydoc: Y.Doc): string[] {
  const json = TiptapTransformer.fromYdoc(ydoc, "default") as JSONContent;
  return (json.content ?? []).map((block) =>
    (block.content ?? []).map((inline) => inline.text ?? "").join(""),
  );
}
const show = (texts: string[]) => texts.join(" | ");

// ── In-memory Prisma stand-in ───────────────────────────────────────────────

interface FakeRow {
  payload: { tiptapJson: JSONContent; metadata: Record<string, unknown>; updatedAt: Date };
  record: { ydocState: Buffer; snapshotJson: unknown; updatedAt: Date } | null;
}

/**
 * Just the calls `documents.ts` makes. `$executeRaw` with an advisory lock
 * takes a real in-process mutex held until the transaction ends, so two
 * concurrent loads serialize exactly as they would in Postgres.
 */
function fakePrisma(contentId: string, ownerId: string, row: FakeRow) {
  const held = new Map<string, Promise<void>>();
  const now = () => new Date();

  const base = {
    contentNode: {
      findFirst: async () => ({
        id: contentId,
        ownerId,
        contentType: "note",
        deletedAt: null,
        notePayload: { ...row.payload },
      }),
    },
    collaborationDocument: {
      findUnique: async () => (row.record ? { ...row.record } : null),
      upsert: async (args: { update: { ydocState: Buffer; snapshotJson: unknown } }) => {
        row.record = { ydocState: args.update.ydocState, snapshotJson: args.update.snapshotJson, updatedAt: now() };
        return row.record;
      },
    },
    notePayload: {
      findUnique: async () => ({ metadata: row.payload.metadata }),
      update: async (args: {
        data: { tiptapJson?: JSONContent; metadata?: Record<string, unknown>; updatedAt?: Date };
      }) => {
        if (args.data.tiptapJson) row.payload.tiptapJson = args.data.tiptapJson;
        if (args.data.metadata) row.payload.metadata = args.data.metadata;
        // Like Prisma's @updatedAt: an explicit value wins, else "now".
        row.payload.updatedAt = args.data.updatedAt ?? now();
        return row.payload;
      },
    },
  };

  const client = {
    ...base,
    $executeRaw: async () => 1,
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const release: Array<() => void> = [];
      const tx = {
        ...base,
        $executeRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
          const key = String(values[0]);
          while (held.has(key)) await held.get(key);
          let unlock!: () => void;
          held.set(key, new Promise<void>((resolve) => (unlock = resolve)));
          release.push(() => {
            held.delete(key);
            unlock();
          });
          return 1;
        },
      };
      try {
        return await fn(tx);
      } finally {
        release.forEach((done) => done());
      }
    },
  };
  return client as unknown as PrismaClient;
}

const CONTENT_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT = `content:${CONTENT_ID}`;
const MINUTE = 60_000;

/**
 * A note Hocuspocus last stored at `storedAt` (lineage L1, stamp written),
 * whose payload has since moved to `payloadNow` outside collaboration.
 */
function noteWithPayloadAhead(storedContent: JSONContent, payloadNow: JSONContent) {
  const stored = seed(storedContent);
  const storedAt = new Date(Date.now() - 10 * MINUTE);
  const row: FakeRow = {
    payload: {
      tiptapJson: payloadNow,
      metadata: { collaborationSnapshotAt: storedAt.toISOString() },
      updatedAt: new Date(storedAt.getTime() + 5 * MINUTE),
    },
    record: { ydocState: Buffer.from(Y.encodeStateAsUpdate(stored)), snapshotJson: storedContent, updatedAt: storedAt },
  };
  return { stored, row, prisma: fakePrisma(CONTENT_ID, "owner", row) };
}

async function main() {
  // ── 1. The first collaborator to join ────────────────────────────────────
  // The note's payload moved ahead of its stored copy (a solo REST save, an
  // offline fallback, a charter mark…). The joining browser has an empty
  // cache: it fetches the canonical state, then connects, and Hocuspocus
  // loads the document. Both loads go through the same function.
  {
    const { prisma } = noteWithPayloadAhead(docOf("one", "two"), docOf("one", "two", "three"));
    const fetched = await loadCollaborationYDocState(prisma, DOCUMENT); // canonical-state fetch
    const loaded = await loadCollaborationYDocState(prisma, DOCUMENT); // Hocuspocus load
    const joined = docFrom(fetched!, loaded!); // the browser syncs its copy into the server's
    check(
      "a joining collaborator sees the note once, not twice",
      show(textsOf(joined)) === "one | two | three",
      show(textsOf(joined)),
    );
  }

  // Two loads at the same moment take turns: the second sees the first's work.
  {
    const { prisma } = noteWithPayloadAhead(docOf("one"), docOf("one", "two"));
    const [a, b] = await Promise.all([
      loadCollaborationYDocState(prisma, DOCUMENT),
      loadCollaborationYDocState(prisma, DOCUMENT),
    ]);
    check(
      "two simultaneous loads agree on one copy",
      show(textsOf(docFrom(a!, b!))) === "one | two",
      show(textsOf(docFrom(a!, b!))),
    );
  }

  // ── 2. Anyone still holding the stored copy merges cleanly ───────────────
  // A device that last synced before the payload moved (a plain REST write
  // happened elsewhere): its copy is the stored lineage, unedited. The load
  // brings the stored copy up to the payload; that device's union with it
  // must be the payload once.
  {
    const { stored, prisma } = noteWithPayloadAhead(docOf("one", "two"), docOf("one", "two", "three"));
    const oldDevice = Y.encodeStateAsUpdate(stored);
    const served = await loadCollaborationYDocState(prisma, DOCUMENT);
    check(
      "a device holding the previous copy merges with the caught-up one without doubling",
      show(textsOf(docFrom(served!, oldDevice))) === "one | two | three",
      show(textsOf(docFrom(served!, oldDevice))),
    );
  }

  // A payload bump with NO content change (charter mark, run ledger, quest)
  // must not fork the document at all.
  {
    const { stored, prisma } = noteWithPayloadAhead(docOf("one", "two"), docOf("one", "two"));
    const served = await loadCollaborationYDocState(prisma, DOCUMENT);
    check(
      "a metadata-only payload bump changes nothing for existing copies",
      show(textsOf(docFrom(served!, Y.encodeStateAsUpdate(stored)))) === "one | two",
      show(textsOf(docFrom(served!, Y.encodeStateAsUpdate(stored)))),
    );
  }

  // The catch-up is recorded: a later load serves the stored copy as is.
  {
    const { row, prisma } = noteWithPayloadAhead(docOf("one"), docOf("one", "two"));
    const first = await loadCollaborationYDocState(prisma, DOCUMENT);
    const second = await loadCollaborationYDocState(prisma, DOCUMENT);
    check(
      "after catching up, the next load returns the same copy byte for byte",
      Buffer.from(first!).equals(Buffer.from(second!)),
    );
    const stamp = row.payload.metadata.collaborationSnapshotAt;
    check(
      "…because the catch-up wrote the mirror stamp",
      typeof stamp === "string" && row.payload.updatedAt.getTime() - new Date(stamp).getTime() < 1000,
      String(stamp),
    );
  }

  // Opening is not editing: the catch-up leaves the payload's updatedAt alone
  // (activity signals — "edited today" — read it).
  {
    const { row, prisma } = noteWithPayloadAhead(docOf("one"), docOf("one", "two"));
    const before = row.payload.updatedAt.getTime();
    await loadCollaborationYDocState(prisma, DOCUMENT);
    check("loading a note does not move its updatedAt", row.payload.updatedAt.getTime() === before);
  }

  // ── 3. A solo editor's saves carry its copy ──────────────────────────────
  // The editor (collaboration-local) typed "three" into ITS copy of the stored
  // lineage and saved through REST. The route merges the copy it sent, then
  // writes the payload with a fresh stamp. Then a collaborator joins and the
  // editor connects.
  const soloEdit = () => {
    const { stored, row, prisma } = noteWithPayloadAhead(docOf("one", "two"), docOf("one", "two"));
    const editor = docFrom(Y.encodeStateAsUpdate(stored));
    writeFragmentAsDiff(editor, docOf("one", "two", "three"));
    const writePayload = (stamped: boolean) => {
      const at = new Date();
      row.payload = {
        tiptapJson: docOf("one", "two", "three"),
        metadata: stamped ? { collaborationSnapshotAt: at.toISOString() } : row.payload.metadata,
        updatedAt: at,
      };
    };
    return { editor, row, prisma, writePayload };
  };
  {
    const { editor, prisma, writePayload } = soloEdit();
    const outcome = await mergeSoloCollaborationCopy(prisma, CONTENT_ID, Y.encodeStateAsUpdate(editor));
    writePayload(outcome === "merged");
    check("a solo editor's copy merges into the stored one", outcome === "merged", outcome);
    const fetched = await loadCollaborationYDocState(prisma, DOCUMENT);
    const loaded = await loadCollaborationYDocState(prisma, DOCUMENT);
    check(
      "the collaborator sees the solo edit before the editor even connects",
      show(textsOf(docFrom(fetched!, loaded!))) === "one | two | three",
      show(textsOf(docFrom(fetched!, loaded!))),
    );
    const all = docFrom(fetched!, loaded!, Y.encodeStateAsUpdate(editor));
    check(
      "the collaborator, the server and the solo editor meet as one note",
      show(textsOf(all)) === "one | two | three",
      show(textsOf(all)),
    );
  }
  {
    // Why the push exists: without it the server catches up with ITS OWN
    // items for "three", and the editor brings its own.
    const { editor, prisma, writePayload } = soloEdit();
    writePayload(false);
    const served = await loadCollaborationYDocState(prisma, DOCUMENT);
    const met = docFrom(served!, Y.encodeStateAsUpdate(editor));
    check(
      "THE REASON: without the push, the solo editor's edit arrives twice",
      show(textsOf(met)) === "one | two | three | three",
      show(textsOf(met)),
    );
  }
  {
    // A copy of ANOTHER lineage is refused, and nothing is written.
    const { row, prisma } = noteWithPayloadAhead(docOf("one", "two"), docOf("one", "two"));
    const storedBefore = Buffer.from(row.record!.ydocState);
    const rival = Y.encodeStateAsUpdate(seed(docOf("one", "two", "three")));
    const outcome = await mergeSoloCollaborationCopy(prisma, CONTENT_ID, rival);
    check("a rival copy is refused", outcome === "rival", outcome);
    check("…and the stored copy is untouched", Buffer.from(row.record!.ydocState).equals(storedBefore));
  }
  {
    // Nothing stored yet: the pushed copy becomes the stored one.
    const pushed = Y.encodeStateAsUpdate(seed(docOf("one")));
    check("with nothing stored, a pushed copy is adopted", mergePushedCopy(null, pushed) === pushed);
  }

  // ── 4. A browser already holding a rival copy ────────────────────────────
  // From a rebuild before this fix, or the client's own seed when the
  // canonical fetch failed. Before connecting, it compares and aligns.
  {
    check("same content → adopt", planAlignment(docOf("one", "two"), docOf("one", "two")) === "adopt");
    check("behind the server → adopt", planAlignment(docOf("one", "two"), docOf("one", "two", "three")) === "adopt");
    check(
      "only adds to the server's → adopt and re-apply",
      planAlignment(docOf("one", "two", "four"), docOf("one", "two")) === "adopt-and-reapply",
    );
    check("both sides changed → diverged (left alone)", planAlignment(docOf("one", "x"), docOf("one", "y")) === "diverged");
    check(
      "an empty paragraph decides nothing",
      planAlignment({ type: "doc", content: [para("one"), { type: "paragraph" }, para("two")] }, docOf("one", "two")) ===
        "adopt",
    );
    check(
      "key order inside a block doesn't matter",
      planAlignment(
        { type: "doc", content: [{ content: [{ text: "one", type: "text" }], type: "paragraph" }] },
        docOf("one"),
      ) === "adopt",
    );
  }
  {
    const server = seed(docOf("one", "two"));
    const local = seed(docOf("one", "two"));
    const serverUpdate = Y.encodeStateAsUpdate(server);
    check(
      "THE BUG: two seeds of the same text share no history",
      !sharesLineage(Y.encodeStateVector(local), Y.encodeStateVector(server)) &&
        show(textsOf(docFrom(serverUpdate, Y.encodeStateAsUpdate(local)))) === "one | two | one | two",
    );
    const clientIdBefore = local.clientID;
    let changes = 0;
    local.on("update", () => (changes += 1));
    alignOntoServerCopy(local, serverUpdate, null);
    check("adopted, the browser shows the note once", show(textsOf(local)) === "one | two", show(textsOf(local)));
    check("…in ONE change (the editor never sees it empty or doubled)", changes === 1, String(changes));
    check("…and the live doc keeps its client id", local.clientID === clientIdBefore);
    check(
      "…and meets the server's copy as one note",
      show(textsOf(docFrom(serverUpdate, Y.encodeStateAsUpdate(local)))) === "one | two",
      show(textsOf(docFrom(serverUpdate, Y.encodeStateAsUpdate(local)))),
    );
    check("…sharing its lineage from now on", sharesLineage(Y.encodeStateVector(local), Y.encodeStateVector(server)));
  }
  {
    const server = seed(docOf("one", "two"));
    const local = seed(docOf("one", "two", "four"));
    const serverUpdate = Y.encodeStateAsUpdate(server);
    const clientIdBefore = local.clientID;
    alignOntoServerCopy(local, serverUpdate, docOf("one", "two", "four"));
    check("re-applying keeps the live doc's client id", local.clientID === clientIdBefore);
    const met = docFrom(serverUpdate, Y.encodeStateAsUpdate(local));
    check("re-applied additions survive, and nothing doubles", show(textsOf(met)) === "one | two | four", show(textsOf(met)));
  }

  // ── 4b. A cached copy the stored note has moved past (D17) ──────────────
  // Owner report 2026-10-09: the AI rewrote a note with no server copy (so it
  // wrote the payload, by design); the browser kept opening its own cached
  // copy and never compared it — the revision was invisible in the viewer and
  // the next keystroke would have saved the stale copy over it.
  {
    const base = { sharesLineage: false, unionMatchesServer: false, alignment: "diverged" as const, localClean: true };
    check("D17: clean, diverged, edited before the stored note changed → adopt", planLocalCatchUp({ ...base, lastLocalEditAt: 1000, payloadUpdatedAt: 2000 }) === "adopt");
    check("D17: clean, diverged, edited AFTER the stored note changed → keep", planLocalCatchUp({ ...base, lastLocalEditAt: 3000, payloadUpdatedAt: 2000 }) === "keep");
    check("D17: clean, diverged, last edit unknown (cached before tracking) → adopt", planLocalCatchUp({ ...base, lastLocalEditAt: null, payloadUpdatedAt: 2000 }) === "adopt");
    check("D17: payload time unknown → keep", planLocalCatchUp({ ...base, lastLocalEditAt: 1000, payloadUpdatedAt: null }) === "keep");
    check("D17: offline edits never thrown away → keep", planLocalCatchUp({ ...base, localClean: false, lastLocalEditAt: null, payloadUpdatedAt: 2000 }) === "keep");
    check("D17: a one-sided rival follows #287 (adopt)", planLocalCatchUp({ ...base, alignment: "adopt", lastLocalEditAt: 3000, payloadUpdatedAt: 2000 }) === "adopt");
    check("D17: a one-sided rival follows #287 (adopt-and-reapply)", planLocalCatchUp({ ...base, alignment: "adopt-and-reapply", localClean: false, lastLocalEditAt: null, payloadUpdatedAt: null }) === "adopt-and-reapply");
    check("D17: same lineage, clean union → merge", planLocalCatchUp({ ...base, sharesLineage: true, unionMatchesServer: true, lastLocalEditAt: null, payloadUpdatedAt: null }) === "merge");
    check("D17: same lineage, union would double → keep", planLocalCatchUp({ ...base, sharesLineage: true, unionMatchesServer: false, lastLocalEditAt: null, payloadUpdatedAt: 2000 }) === "keep");
  }
  {
    // The incident, end to end: the browser cached the note as written by hand;
    // the AI rewrote the payload; opening mints the server copy from the payload.
    const local = seed(docOf("old heading", "old body"));
    const server = seed(docOf("New heading", "new body", "added section"));
    const serverUpdate = Y.encodeStateAsUpdate(server);
    const localJson = TiptapTransformer.fromYdoc(local, "default") as JSONContent;
    const serverJson = TiptapTransformer.fromYdoc(server, "default") as JSONContent;
    const plan = planLocalCatchUp({
      sharesLineage: sharesLineage(Y.encodeStateVector(local), Y.encodeStateVectorFromUpdate(serverUpdate)),
      unionMatchesServer: false,
      alignment: planAlignment(localJson, serverJson),
      localClean: true,
      lastLocalEditAt: null,
      payloadUpdatedAt: Date.parse("2026-10-09T15:46:54Z"),
    });
    check("D17 incident: the stale cached copy is adopted onto the server's", plan === "adopt", plan);
    alignOntoServerCopy(local, serverUpdate, null, "local-catch-up");
    check("…the viewer shows the revision, once", show(textsOf(local)) === "New heading | new body | added section", show(textsOf(local)));
    check(
      "…and a later connect meets the server's copy as one note",
      show(textsOf(docFrom(serverUpdate, Y.encodeStateAsUpdate(local)))) === "New heading | new body | added section",
    );
  }
  {
    // Why a shared lineage alone is not enough: a browser saved "two" through
    // REST before solo saves carried their Y state; the server caught up on
    // the same text with ITS items. The union shows "two" twice.
    const origin = seed(docOf("one"));
    const local = docFrom(Y.encodeStateAsUpdate(origin));
    writeFragmentAsDiff(local, docOf("one", "two"));
    const server = docFrom(Y.encodeStateAsUpdate(origin));
    writeFragmentAsDiff(server, docOf("one", "two"));
    const union = docFrom(Y.encodeStateAsUpdate(local), Y.encodeStateAsUpdate(server));
    check(
      "D17: same lineage, independently caught up — the union doubles (so it must not merge)",
      sharesLineage(Y.encodeStateVector(local), Y.encodeStateVector(server)) && show(textsOf(union)) !== show(textsOf(server)),
      show(textsOf(union)),
    );
  }
  {
    // The wiring: the runtime compares a cached copy before editing opens.
    const runtimeSrc = readFileSync(join(process.cwd(), "lib/domain/collaboration/runtime.ts"), "utf8");
    const route = readFileSync(join(process.cwd(), "app/api/collaboration/state/route.ts"), "utf8");
    const branch = runtimeSrc.slice(runtimeSrc.indexOf("// D17: a cached copy is compared"), runtimeSrc.indexOf("if (!entry.pendingInitialContent || !pendingContentIsMeaningful) {"));
    check("D17 wiring: a meaningful cached copy is caught up BEFORE bootstrap reports ready", /if \(localYdocIsMeaningful\) \{[\s\S]{0,200}await this\.catchUpLocalCopy\(entry\);/.test(branch) && branch.indexOf("catchUpLocalCopy") < branch.indexOf('bootstrapState = "ready"'));
    check("D17 wiring: …and announces readiness (awaited, so the caller's emit already ran)", /bootstrapState = "ready";[\s\S]{0,300}this\.emit\(entry\);\s*return;/.test(branch));
    check("D17 wiring: the decision is planLocalCatchUp", runtimeSrc.includes("const plan = planLocalCatchUp({"));
    check("D17 wiring: a merge requires the union to equal the server's copy", /unionMatchesServer =\s*JSON\.stringify\(TiptapTransformer\.fromYdoc\(union, "default"\)\) === JSON\.stringify\(server\)/.test(runtimeSrc));
    check("D17 wiring: the wait is bounded", /setTimeout\(\(\) => abortController\.abort\(\), LOCAL_CATCH_UP_TIMEOUT_MS\)/.test(runtimeSrc));
    check("D17 wiring: the previous session's manifest is read before this one overwrites it", runtimeSrc.includes("priorCacheEntry: readLocalCacheManifest()[contentId] ?? null,"));
    check("D17 wiring: local edits stamp lastLocalEditAt and it persists", runtimeSrc.includes("entry.lastLocalEditAt = Date.now();") && runtimeSrc.includes("lastLocalEditAt: entry.lastLocalEditAt"));
    check("D17 wiring: the state route returns when the stored note last changed", route.includes("payloadUpdatedAt: payload?.updatedAt.toISOString() ?? null"));
  }

  // ── 4c. Coming back online over a socket that never closed ───────────────
  // Owner smoke 2026-10-09: the browser's offline event left the WebSocket
  // open; on return the banners stuck because onSynced never fired again.
  // Reproduced in a two-tab browser run (control without the restore: both
  // banners still up 9 s later).
  {
    const rt = readFileSync(join(process.cwd(), "lib/domain/collaboration/runtime.ts"), "utf8");
    const editor = readFileSync(join(process.cwd(), "components/content/editor/MarkdownEditor.tsx"), "utf8");
    check("reconnect: onSynced clears the degraded markers through markSynced", /onSynced: \(\{ state \}\) => \{\s*if \(!state\) return;\s*this\.markSynced\(entry\);/.test(rt));
    check("reconnect: markSynced clears the warning and the reconnect intent", /private markSynced\(entry: DocumentRuntimeEntry\) \{[\s\S]{0,800}entry\.state\.warning = null;[\s\S]{0,80}entry\.state\.reconnectIntent = false;/.test(rt));
    check("reconnect: an existing provider asked to connect is checked for still being synced (promote)", /entry\.hocuspocusProvider\.connect\(\);\s*this\.emit\(entry\);\s*this\.restoreIfStillSynced\(entry\);/.test(rt));
    check("reconnect: …and in promoteInternal", /entry\.hocuspocusProvider\.connect\(\);\s*this\.restoreIfStillSynced\(entry\);\s*return;/.test(rt));
    check("reconnect: …and when pending changes drain to zero", /if \(number === 0\) this\.restoreIfStillSynced\(entry\);/.test(rt));
    check(
      "reconnect: the restore needs synced, nothing pending, online, and a runtime NOT already synced (a no-op in normal operation)",
      /provider\?\.synced &&\s*!provider\.hasUnsyncedChanges &&\s*entry\.state\.networkState === "online" &&[\s\S]{0,200}entry\.state\.connectionState !== "synced"/.test(rt),
    );
    check("reconnect: recovering sets recoveredAt and clears it after RECOVERED_NOTICE_MS", /if \(recovering\) \{\s*entry\.state\.recoveredAt = Date\.now\(\);[\s\S]{0,300}\}, RECOVERED_NOTICE_MS\);/.test(rt));
    check("reconnect: the notice timer is cleared when the entry goes away", rt.includes("if (entry.recoveredNoticeTimer) clearTimeout(entry.recoveredNoticeTimer);"));
    check("reconnect: the editor says so", editor.includes("Reconnected — your changes are synced.") && editor.includes("runtimeRecoveredAt !== null"));
  }

  // ── 5. The save carries the copy (request body) ──────────────────────────
  {
    const copy = Y.encodeStateAsUpdate(seed(docOf("one", "two")));
    const sent = JSON.parse(noteSaveBody(docOf("one", "two"), { userInitiated: true, collaborationUpdate: copy }));
    check(
      "a solo save sends the editor's copy, byte for byte",
      typeof sent.collaborationUpdate === "string" &&
        Buffer.from(Buffer.from(sent.collaborationUpdate, "base64")).equals(Buffer.from(copy)),
    );
    check("…beside the document and intent fields", sent.userInitiated === true && sent.tiptapJson?.type === "doc");
    check(
      "a save with no copy sends no copy field",
      !("collaborationUpdate" in JSON.parse(noteSaveBody(docOf("one"), { userInitiated: true }))),
    );
    const big = new Uint8Array(70_000).fill(7);
    check(
      "a keepalive save leaves out a copy that would break the 64 KiB keepalive cap",
      !("collaborationUpdate" in JSON.parse(noteSaveBody(docOf("one"), { keepalive: true, collaborationUpdate: big }))),
    );
    check(
      "…but an ordinary save still carries it",
      "collaborationUpdate" in JSON.parse(noteSaveBody(docOf("one"), { collaborationUpdate: big })),
    );
  }

  // ── 6. Wiring the pure checks can't reach ────────────────────────────────
  {
    const src = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
    const editor = src("components/content/editor/MarkdownEditor.tsx");
    check(
      "the editor encodes its bound copy into the save",
      /collaborationUpdate: Y\.encodeStateAsUpdate\(snapshotYdoc\)/.test(editor) &&
        /const snapshotYdoc = collaborationState\?\.document \?\? null;/.test(editor),
    );
    const route = src("app/api/content/content/[id]/route.ts");
    const merge = route.indexOf("await mergeSoloCollaborationCopy(");
    const upsert = route.indexOf("await prisma.notePayload.upsert(", merge);
    check(
      "the save route merges the copy BEFORE writing the payload, and stamps only then",
      merge > 0 && upsert > merge && /collaborationSnapshotAt: mirrorStampedAt/.test(route.slice(upsert, upsert + 1200)),
    );
    const runtime = src("lib/domain/collaboration/runtime.ts");
    const align = runtime.indexOf("await this.alignLineageBeforeFirstConnect(entry);");
    check(
      "the runtime aligns a copy before creating its first provider",
      align > 0 && runtime.indexOf("entry.hocuspocusProvider = new HocuspocusProvider(", align) > align,
    );
    check(
      "…every copy, one filled from the canonical state included (the server's can be replaced while a solo session waits)",
      (runtime.match(/entry\.lineageChecked = true;/g) ?? []).length === 1 &&
        runtime.indexOf("entry.lineageChecked = true;") < align &&
        runtime.indexOf("entry.lineageChecked = true;") > align - 200,
    );
    for (const caller of ["components/content/content/MainPanelContent.tsx", "components/content/editor/NoteWindowNodeView.tsx"]) {
      check(`${caller.split("/").pop()} builds its save body with noteSaveBody`, /body: noteSaveBody\(/.test(src(caller)));
    }
  }

  if (failures > 0) {
    console.error(`collab:lineage:check — ${failures} failure(s)`);
    process.exit(1);
  }
  console.log(
    "collab:lineage:check — OK (join, simultaneous loads, stale copies, metadata bumps, stamp, solo push, rival refusal, alignment, save body, wiring)",
  );
  process.exit(0);
}

void main();
