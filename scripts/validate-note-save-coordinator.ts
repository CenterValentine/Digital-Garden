/**
 * note-save:check — the per-NOTE save coordinator
 * (lib/domain/content/note-save-coordinator.ts).
 *
 * Prod 2026-10-09: "This note changed elsewhere" after nearly every edit —
 * a save left while the previous one was still running and carried the
 * stamp from before it committed (409 against the user's own write). These
 * checks drive the coordinator against a fake server that refuses stale
 * stamps exactly like the content PATCH route, with real delays, so each
 * scenario fails if the coordination it pins is removed.
 */

import {
  noteBodyHash,
  noteCached,
  noteLoaded,
  noteSaveGeneration,
  noteSaved,
  runNoteSave,
} from "../lib/domain/content/note-save-coordinator";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The content PATCH route's X-Body-Hash precondition, with latency. */
function makeServer(initialHash: string, latencyMs = 40) {
  let hash = initialHash;
  let version = 0;
  const log: Array<{ sent: string | null; status: 200 | 409; body: string }> = [];
  /** A save task as an editor builds it: the stamp is read at SEND time. */
  const save = (noteId: string, body: string) => async () => {
    const sent = noteBodyHash(noteId);
    // The server checks first and commits later, like the real route.
    await sleep(latencyMs / 2);
    if (sent && sent !== hash) {
      log.push({ sent, status: 409, body });
      await sleep(latencyMs / 2);
      return;
    }
    version += 1;
    hash = `h${version}`;
    log.push({ sent, status: 200, body });
    await sleep(latencyMs / 2);
    noteSaved(noteId, hash);
  };
  return { save, log, get hash() { return hash; }, set hash(h: string) { hash = h; } };
}

async function main() {
  console.log("note-save:check");

  // 1. Overlapping saves of one note: the second waits and carries the
  //    stamp the first brought back.
  {
    const id = "note-overlap";
    const server = makeServer("h0");
    noteLoaded(id, "h0", noteSaveGeneration(id));
    const a = runNoteSave(id, server.save(id, "one"));
    await sleep(5);
    const b = runNoteSave(id, server.save(id, "one two"));
    await Promise.all([a, b]);
    await sleep(150);
    check(
      "overlapping saves: no 409, both land in order",
      server.log.length === 2 && server.log.every((l) => l.status === 200) &&
        server.log[1].body === "one two",
      JSON.stringify(server.log),
    );
  }

  // 2. A burst while one runs: only the NEWEST waiting save is sent.
  {
    const id = "note-burst";
    const server = makeServer("h0");
    noteLoaded(id, "h0", noteSaveGeneration(id));
    void runNoteSave(id, server.save(id, "v1"));
    await sleep(5);
    void runNoteSave(id, server.save(id, "v2"));
    void runNoteSave(id, server.save(id, "v3"));
    void runNoteSave(id, server.save(id, "v4"));
    await sleep(200);
    check(
      "burst while running: sends v1 then only v4",
      server.log.map((l) => l.body).join(",") === "v1,v4" && server.log.every((l) => l.status === 200),
      JSON.stringify(server.log),
    );
  }

  // 3. Pane move mid-save: pane A's save is running, pane B (another editor
  //    instance of the same note) saves — it must wait and use A's result.
  {
    const id = "note-move";
    const server = makeServer("h0");
    noteLoaded(id, "h0", noteSaveGeneration(id));
    const paneA = server.save(id, "typed in A");
    const paneB = server.save(id, "typed in A, then B");
    void runNoteSave(id, paneA);
    await sleep(5);
    // Pane B loads the note while A's save is still running: a stale stamp.
    const genAtB = noteSaveGeneration(id);
    void runNoteSave(id, paneB);
    noteLoaded(id, "h0", genAtB); // late, pre-commit load result
    await sleep(200);
    check(
      "pane move mid-save: B's save waits for A and does not 409",
      server.log.length === 2 && server.log.every((l) => l.status === 200),
      JSON.stringify(server.log),
    );
    check("pane move mid-save: the stamp is the server's latest", noteBodyHash(id) === server.hash);
  }

  // 4. A load requested BEFORE a save started must not roll the stamp back.
  {
    const id = "note-late-load";
    const server = makeServer("h0");
    noteLoaded(id, "h0", noteSaveGeneration(id));
    const genAtLoad = noteSaveGeneration(id);
    await runNoteSave(id, server.save(id, "saved"));
    noteLoaded(id, "h0", genAtLoad); // the load's (older) answer arrives late
    check("late load does not roll the stamp back", noteBodyHash(id) === server.hash, String(noteBodyHash(id)));
    // …while a load requested AFTER the save is adopted.
    noteLoaded(id, "hX", noteSaveGeneration(id));
    check("a fresh load after the save is adopted", noteBodyHash(id) === "hX");
  }

  // 5. A cache paint seeds an unknown note, never overrides a known stamp.
  {
    const id = "note-cache";
    noteCached(id, "cached-1");
    check("cache paint seeds an unknown note", noteBodyHash(id) === "cached-1");
    noteSaved(id, "fresh-2");
    noteCached(id, "cached-1");
    check("cache paint never rolls a known stamp back", noteBodyHash(id) === "fresh-2");
  }

  // 6. Another device's write is NEVER learned — that 409 stays honest.
  {
    const id = "note-other-device";
    const server = makeServer("h0");
    noteLoaded(id, "h0", noteSaveGeneration(id));
    server.hash = "other-device"; // someone else saved
    await runNoteSave(id, server.save(id, "mine"));
    check(
      "a write from elsewhere still draws a 409",
      server.log.length === 1 && server.log[0].status === 409,
      JSON.stringify(server.log),
    );
  }

  // 7. Keepalive (page unloading) never waits behind the queue.
  {
    const id = "note-keepalive";
    let ranAt = -1;
    const t0 = Date.now();
    void runNoteSave(id, async () => { await sleep(80); });
    await sleep(5);
    await runNoteSave(id, async () => { ranAt = Date.now() - t0; }, { keepalive: true });
    check("keepalive flush leaves at once", ranAt >= 0 && ranAt < 60, `ran at ${ranAt}ms`);
    await sleep(100);
  }

  // 8. A save that throws still releases the queue.
  {
    const id = "note-throws";
    let second = false;
    void runNoteSave(id, async () => { await sleep(20); throw new Error("network"); }).catch(() => {});
    await sleep(5);
    void runNoteSave(id, async () => { second = true; });
    await sleep(80);
    check("a failed save still lets the waiting one run", second);
  }

  // 9. A load requested WHILE a save runs, answered with the pre-save
  //    version, landing AFTER the save finished — must not roll back.
  {
    const id = "note-midsave-load";
    const server = makeServer("h0");
    noteLoaded(id, "h0", noteSaveGeneration(id));
    const saving = runNoteSave(id, server.save(id, "edit"));
    await sleep(5);
    const genMidSave = noteSaveGeneration(id); // requested mid-save
    await saving;
    noteLoaded(id, "h0", genMidSave); // its pre-save answer arrives late
    await runNoteSave(id, server.save(id, "edit more"));
    check(
      "a load asked mid-save, answered late, does not roll back",
      server.log.every((l) => l.status === 200),
      JSON.stringify(server.log),
    );
  }

  // 10. …and one landing while the save is still settling (after the server
  //     answered, before the save released the queue) is ignored too.
  {
    const id = "note-settling-load";
    const server = makeServer("h0");
    noteLoaded(id, "h0", noteSaveGeneration(id));
    let loadDuringSettle = () => {};
    const settling = runNoteSave(id, async () => {
      await server.save(id, "edit")();
      // Stamp updated (noteSaved ran); the save has not released yet.
      loadDuringSettle();
      await sleep(10);
    });
    loadDuringSettle = () => noteLoaded(id, "h0", noteSaveGeneration(id));
    await settling;
    check("a load landing while a save settles is ignored", noteBodyHash(id) === server.hash, String(noteBodyHash(id)));
  }

  if (failures > 0) {
    console.error(`note-save:check — ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("note-save:check — OK (overlap, burst, pane move, late load, mid-save load, settling load, cache seed, other device, keepalive, failure)");
}

void main();
