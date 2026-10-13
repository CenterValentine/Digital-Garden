/**
 * Gate: wake-on-write for sleeping tabs, and the merge notice.
 *
 * Sleep mode disconnects an idle editor on purpose (Cloud Run stays cold), so
 * a write that reaches the live document from outside the browser — an MCP
 * agent, a script, another device — is broadcast to nobody. The in-app chat
 * fires a window event after its own writes; an outside write has no browser
 * side to fire it. Found 2026-10-13 when two MCP writes landed correctly and
 * the owner's open tabs showed the old text until a refresh.
 *
 * The fix rides the presence poll the tab strip already runs (paused while
 * hidden or idle, so it never keeps the database awake on its own):
 *   1. the presence route reports the server document's stamp per note;
 *   2. the poller forwards it; the runtime wakes a DETACHED document when the
 *      stamp moves past what it last saw — never a connected one, and never
 *      on the first stamp it sees (that is only the baseline);
 *   3. a sync that merged this tab's own unsynced edits with remote changes
 *      sets `remoteWriteMergedAt`, which the editor shows briefly — the merge
 *      is the resolution; no keep-mine / keep-theirs (owner decision).
 *
 * Mutants this must kill (restore from git after each):
 *   - route stops selecting collaborationDocument stamps
 *   - poller stops forwarding documentStampMs to subscribers
 *   - runtime wakes connected documents too (drops the synced/connected guard)
 *   - runtime wakes on the first stamp (drops the baseline guard)
 *   - remote updates are counted without the local-dirty condition
 *   - markSynced never sets remoteWriteMergedAt
 *   - the editor stops rendering the merged notice
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const src = (p: string) => readFileSync(resolve(root, p), "utf8");

let failures = 0;
function check(ok: boolean, message: string): void {
  if (!ok) {
    failures += 1;
    console.error(`✗ ${message}`);
  }
}
function fnBody(source: string, start: string, end: string): string {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + 1);
  return a >= 0 && b > a ? source.slice(a, b) : "";
}

// 1. The route carries the stamp.
const route = src("app/api/collaboration/presence/route.ts");
check(/prisma\.collaborationDocument\.findMany\(/.test(route) && /documentStampByContentId/.test(route), "route: the presence response carries documentStampByContentId from the collaboration document table");
check(/documentStampByContentId,\s*\}/.test(route.replace(/\n/g, " ")), "route: documentStampByContentId is in the success payload");

// 2. The poller forwards it; the runtime wakes only a detached document, never on the baseline.
const poll = src("lib/domain/collaboration/presence-poll.ts");
check(/documentStampByContentId\?: Record<string, number>/.test(poll) && /getDocumentStamp\(/.test(poll), "poller: the response's stamp is parsed and exposed");
check(/callback\(presencePoller\.getSnapshot\(contentId\), presencePoller\.getDocumentStamp\(contentId\)\)/.test(poll), "poller: subscribers receive the stamp beside the sessions");
check(/stampMoved/.test(poll) && /recordsEqual\(prev, fresh\) && !stampMoved/.test(poll), "poller: a moved stamp notifies subscribers even when presence is unchanged");

const runtime = src("lib/domain/collaboration/runtime.ts");
const applyStamp = fnBody(runtime, "private applyDocumentStamp(", "private handleBroadcastMessage(");
check(applyStamp.length > 0, "runtime: applyDocumentStamp exists");
check(/if \(previous === null\) return;/.test(applyStamp), "runtime: the first stamp seen is only a baseline (no wake)");
check(/connectionState === "connected" \|\| connectionState === "synced"\) return;/.test(applyStamp), "runtime: a connected or synced document is never woken (it heard the broadcast)");
check(/this\.wakeForRemoteWrite\(entry\.contentId\)/.test(applyStamp), "runtime: a detached document with a newer stamp wakes through wakeForRemoteWrite");
check(/this\.applyDocumentStamp\(entry, documentStampMs\)/.test(runtime) && /documentStampMs,\s*timestamp: Date\.now\(\)/.test(runtime.replace(/\n/g, " ")), "runtime: the poll handler applies the stamp and fans it out to the other tabs");

// 3. The merge notice: counted only while detached with local edits; set in markSynced; rendered.
const updateHandler = fnBody(runtime, "entry.ydocUpdateHandler = (", "entry.ydoc.on(\"update\"");
check(/origin === entry\.hocuspocusProvider/.test(updateHandler) && /\(entry\.state\.localDirty \|\| entry\.state\.unsyncedUpdateCount > 0\)/.test(updateHandler) && /remoteUpdatesWhileDetached \+= 1/.test(updateHandler), "runtime: remote updates count toward a merge only while detached with unsynced local edits");
const markSynced = fnBody(runtime, "private markSynced(", "private restoreIfStillSynced(");
check(/const merged = this\.consumeDetachedMerge\(entry\);/.test(markSynced) && /if \(merged\) \{\s*entry\.state\.remoteWriteMergedAt = Date\.now\(\);/.test(markSynced), "runtime: markSynced decides the merge before clearing the dirty markers and reports it");
check(/remoteUpdatesWhileDetached > 0/.test(markSynced) && /remoteUpdatesWhileDetached = 0;/.test(markSynced), "runtime: the detached-update count is consumed once per sync");
check(/remoteWriteMergedAt: number \| null;/.test(runtime) && /remoteWriteMergedAt: null,/.test(runtime), "runtime: remoteWriteMergedAt is part of the state and initialised");
check(/clearTimeout\(entry\.remoteWriteNoticeTimer\)/.test(runtime), "runtime: the notice timer is cleared on eviction");

const editor = src("components/content/editor/MarkdownEditor.tsx");
check(/state\.remoteWriteMergedAt/.test(editor) && /runtimeRemoteWriteMergedAt !== null/.test(editor) && /Merged with a change made outside this tab/.test(editor), "editor: the merged notice renders from remoteWriteMergedAt");

if (failures > 0) {
  console.error(`\nremote-write:wake:check — ${failures} failure(s)`);
  process.exit(1);
}
console.log("remote-write:wake:check — OK (stamp on the presence poll, detached-only wake, baseline guard, merge notice)");
