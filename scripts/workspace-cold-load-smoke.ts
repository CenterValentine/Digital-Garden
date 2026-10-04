/**
 * Smoke test for WHICH workspace opens, and WHOSE tabs it shows, on a load.
 *
 * Two owner reports (2026-10-02), one family of cause:
 *
 *  1. "Leaving and coming back to a session takes the user to the Main
 *     workspace instead of whatever workspace they were last at."
 *     `loadWorkspaces` resolved its candidates with `getWorkspace`, which falls
 *     back to Main when the id is missing — so the middle candidate was always
 *     truthy and the persisted last-workspace below it was dead code.
 *
 *  2. "A Main workspace tab carries over to a new workspace that has been
 *     opened (in split panes too)." `loadWorkspaces` skipped applying the
 *     snapshot whenever ANY tabs were open — never asking whose they were. A
 *     navigation that re-ran it for workspace B while the store still held
 *     Main's tabs left Main's tabs on screen; the debounced persist then
 *     published them into B.
 *
 * Pure client state again: the real stores in Node, a stubbed fetch, and a
 * window shim whose URL is mutable (`syncWorkspaceUrl` and the content store
 * both rewrite it, and `restoreContentWorkspace` reads `?content=` from it).
 *
 * Run: pnpm workspace:cold-load:smoke
 */

import { memoryStorage, setHref } from "./_workspace-window-shim";
import {
  useContentStore,
  clearPendingWorkspaceIntents,
  markLocalOpenIntents,
} from "../state/content-store";
import {
  useWorkspaceStore,
  __resetContentStoreOwnerForTests,
} from "../extensions/workplaces/state/workspace-store";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `  ${ok ? "✓" : "✖"} ${label}${
      ok ? "" : `\n      got:  ${JSON.stringify(actual)}\n      want: ${JSON.stringify(expected)}`
    }`,
  );
}

const storage = { delete: (k: string) => memoryStorage.removeItem(k), set: (k: string, v: string) => memoryStorage.setItem(k, v) };

type Panes = Record<string, string[]>;
function workspace(id: string, name: string, isMain: boolean, panes: Panes, layoutMode = "single") {
  return {
    id, name, slug: name, isMain, isLocked: false, isView: false,
    viewRootContentId: null, viewRoot: null, parentWorkspaceId: null,
    status: "active", expiresAt: null, archivedAt: null,
    layoutMode, activePaneId: "top-left",
    paneState: {
      layoutMode, activePaneId: "top-left",
      activeContentId: Object.values(panes).flat()[0] ?? null,
      paneTabContentIds: Object.fromEntries(
        Object.entries(panes).map(([p, ids]) => [p, { contentIds: ids, activeContentId: ids[0] ?? null }]),
      ),
    },
    settings: {}, createdAt: "", updatedAt: "2026-10-04T10:00:00.000Z",
    items: [] as unknown[], contentMeta: {}, membershipContentIds: Object.values(panes).flat(),
  };
}
const MAIN = workspace("main-id", "main", true, { "top-left": ["m1", "m2"] });
const B = workspace("b-id", "B", false, { "top-left": ["b1", "b2"] });
const SPLIT = workspace("s-id", "S", false, { "top-left": ["s1"], "top-right": ["s2"] }, "dual-vertical");
const EMPTY = workspace("e-id", "E", false, {});
const ALL = [MAIN, B, SPLIT, EMPTY];

const calls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push(`${init?.method ?? "GET"} ${url}`);
  if (url.endsWith("/api/content/workspaces")) {
    return new Response(JSON.stringify({ success: true, data: ALL }), { status: 200 });
  }
  if (url.endsWith("/open-intent")) {
    return new Response(
      JSON.stringify({ success: true, data: { allowed: true, alreadyCovered: true, conflict: null } }),
      { status: 200 },
    );
  }
  return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
}) as typeof fetch;

/** pane → content ids, empty panes omitted */
function placement() {
  const s = useContentStore.getState();
  return Object.fromEntries(
    Object.entries(s.panes)
      .filter(([, p]) => p.tabIds.length > 0)
      .map(([id, p]) => [id, p.tabIds.map((t) => s.tabs[t]?.contentId)]),
  );
}
const active = () => useWorkspaceStore.getState().activeWorkspaceId;

/** A fresh page: nothing applied, nothing open, nothing remembered but storage. */
function freshPage(url: string, persistedWorkspace: string | null) {
  useContentStore.getState().clearAllWorkspaceTabs();
  clearPendingWorkspaceIntents();
  useWorkspaceStore.setState({ workspaces: [], activeWorkspaceId: null });
  __resetContentStoreOwnerForTests();
  setHref(url);
  if (persistedWorkspace) storage.set("workspace-active-id", persistedWorkspace);
  else storage.delete("workspace-active-id");
}
/** What MainPanelWorkspace's mount effect does with `tabs_*` / `content=` params. */
function urlRestore(panes: Panes, activeContentId: string, layoutMode: "single" | "dual-vertical" = "single") {
  useContentStore.getState().restoreWorkspace({
    activeContentId,
    paneTabContentIds: panes,
    layoutMode,
    activePaneId: "top-left",
  });
  markLocalOpenIntents(Object.values(panes).flat());
}

(async () => {
  console.log("\nwhich workspace opens on a load (owner bug 1)");
  {
    freshPage("http://localhost/content", "b-id");
    await useWorkspaceStore.getState().loadWorkspaces(null);
    check("a bare /content returns to the LAST workspace, not Main", active(), "b-id");
    check("…and shows its tabs", placement(), { "top-left": ["b1", "b2"] });

    freshPage("http://localhost/content?workspace=s-id", "b-id");
    await useWorkspaceStore.getState().loadWorkspaces("s-id");
    check("an explicit ?workspace= outranks the remembered one", active(), "s-id");

    freshPage("http://localhost/content?workspace=gone-id", "b-id");
    await useWorkspaceStore.getState().loadWorkspaces("gone-id");
    check("a ?workspace= that no longer exists falls back to the remembered one, not Main", active(), "b-id");

    freshPage("http://localhost/content", null);
    await useWorkspaceStore.getState().loadWorkspaces(null);
    check("with nothing remembered, Main is still the fallback", active(), "main-id");

    freshPage("http://localhost/content", "gone-id");
    await useWorkspaceStore.getState().loadWorkspaces(null);
    check("a remembered workspace that no longer exists → Main", active(), "main-id");
  }

  console.log("\nwhose tabs a load shows — cold start (owner bug 2)");
  {
    freshPage("http://localhost/content?tabs_top_left=b1%2Cb2&content=b1", "b-id");
    urlRestore({ "top-left": ["b1", "b2"] }, "b1");
    await useWorkspaceStore.getState().loadWorkspaces(null);
    check("URL tabs with no ?workspace= are replaced by the remembered workspace's own", [active(), placement()], ["b-id", { "top-left": ["b1", "b2"] }]);

    freshPage("http://localhost/content?tabs_top_left=b1%2Cb2&content=b1", null);
    urlRestore({ "top-left": ["b1", "b2"] }, "b1");
    await useWorkspaceStore.getState().loadWorkspaces(null);
    check(
      "…and when Main is what opens, B's URL tabs do NOT leak into it (they would be published there)",
      [active(), Object.values(placement()).flat().filter((id) => id.startsWith("b"))],
      ["main-id", ["b1"]],
    );
    check("…only the deep-linked selection is carried (the rest of the URL's tabs are dropped)", placement(), { "top-left": ["m1", "m2", "b1"] });

    freshPage("http://localhost/content?workspace=b-id&tabs_top_left=b1%2Cb2%2Cb3&content=b1", "b-id");
    // b3 is open but NOT selected, so nothing but ownership can keep it.
    urlRestore({ "top-left": ["b1", "b2", "b3"] }, "b1");
    await useWorkspaceStore.getState().loadWorkspaces("b-id");
    check("URL tabs that name THIS workspace stand (a local, unpublished open is not stomped)", placement(), { "top-left": ["b1", "b2", "b3"] });

    // Kept URL tabs must be RECORDED as this workspace's. The shell controller
    // lives in MainPanelWorkspace, so leaving /content (Settings) and coming
    // back through a bare `/content` link re-runs loadWorkspaces(null). If the
    // keep-path left the owner unset, that second run took the tabs for a
    // stranger's, re-applied the server snapshot, and dropped b3 — opened
    // locally, not yet published.
    setHref("http://localhost/content");
    await useWorkspaceStore.getState().loadWorkspaces(null);
    check(
      "…and a later bare /content remount still treats them as this workspace's",
      [active(), placement()],
      ["b-id", { "top-left": ["b1", "b2", "b3"] }],
    );

    freshPage("http://localhost/content?workspace=gone-id&tabs_top_left=m1%2Cm2&content=m1", "b-id");
    urlRestore({ "top-left": ["m1", "m2"] }, "m1");
    await useWorkspaceStore.getState().loadWorkspaces("gone-id");
    check(
      "URL tabs naming a workspace that did NOT open are replaced — and its selection is not smuggled in as a \"deep link\"",
      [active(), placement()],
      ["b-id", { "top-left": ["b1", "b2"] }],
    );
  }

  console.log("\nwhose tabs a load shows — the store already holds another workspace's (owner bug 2)");
  {
    freshPage("http://localhost/content?workspace=main-id", "main-id");
    await useWorkspaceStore.getState().loadWorkspaces("main-id");
    check("on Main", placement(), { "top-left": ["m1", "m2"] });
    await useWorkspaceStore.getState().loadWorkspaces("b-id");
    check("loading B while Main's tabs are on screen shows B's, not Main's", [active(), placement()], ["b-id", { "top-left": ["b1", "b2"] }]);
    check("…and Main's selection does not follow into B", useContentStore.getState().selectedContentId, "b1");

    freshPage("http://localhost/content?workspace=s-id", "s-id");
    await useWorkspaceStore.getState().loadWorkspaces("s-id");
    check("a split workspace restores both panes", placement(), { "top-left": ["s1"], "top-right": ["s2"] });
    await useWorkspaceStore.getState().loadWorkspaces("main-id");
    check(
      "loading Main from a split replaces EVERY pane — nothing is left in the right one",
      [useContentStore.getState().layoutMode, placement()],
      ["single", { "top-left": ["m1", "m2"] }],
    );
    await useWorkspaceStore.getState().loadWorkspaces("e-id");
    check("loading an empty workspace leaves no tabs behind", placement(), {});

    freshPage("http://localhost/content?workspace=b-id", "b-id");
    await useWorkspaceStore.getState().loadWorkspaces("b-id");
    useContentStore.getState().setSelectedContentId("b3", { pin: true });
    await useWorkspaceStore.getState().loadWorkspaces("b-id");
    check("re-running load for the SAME workspace keeps its local, unpublished tab", placement(), { "top-left": ["b1", "b2", "b3"] });
  }

  console.log("\na deep link to a note survives the snapshot");
  {
    freshPage("http://localhost/content?content=x9&tabs_top_left=x9", "b-id");
    urlRestore({ "top-left": ["x9"] }, "x9");
    calls.length = 0;
    await useWorkspaceStore.getState().loadWorkspaces(null);
    await new Promise((r) => setTimeout(r, 10));
    check(
      "?content=x9 with no workspace opens in the remembered workspace, beside its own tabs",
      [active(), placement()],
      ["b-id", { "top-left": ["b1", "b2", "x9"] }],
    );
    check("…through the workspace-aware open (the claim check ran)", calls.some((c) => c.endsWith("/open-intent")), true);
    check("…and it was agreed, not left provisional behind a conflict dialog", useWorkspaceStore.getState().conflict, null);
  }

  console.log("\na persist re-run never writes another workspace's tabs (self-inflicted by the write coalescing)");
  {
    freshPage("http://localhost/content?workspace=main-id", "main-id");
    await useWorkspaceStore.getState().loadWorkspaces("main-id");
    const patches: Array<{ url: string; panes: string[] }> = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const inner = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/state") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as { paneTabContentIds: Record<string, { contentIds: string[] }> };
        patches.push({ url, panes: Object.values(body.paneTabContentIds).flatMap((p) => p.contentIds) });
        await held;
        return new Response(JSON.stringify({ success: true, data: { ...MAIN, updatedAt: "2026-10-04T10:00:01.000Z" } }), { status: 200 });
      }
      return inner(input, init);
    }) as typeof fetch;

    // A write for Main is on the wire; a second persist call marks it dirty…
    useContentStore.getState().setSelectedContentId("m3", { pin: true });
    const first = useWorkspaceStore.getState().persistActiveWorkspace();
    const second = useWorkspaceStore.getState().persistActiveWorkspace();
    // …then the user switches to B before the first lands.
    await useWorkspaceStore.getState().activateWorkspace("b-id");
    release();
    await Promise.all([first, second]);
    globalThis.fetch = inner;

    const toMain = patches.filter((p) => p.url.includes("/main-id/"));
    check(
      "no write to Main carries B's tabs",
      toMain.some((p) => p.panes.some((id) => id.startsWith("b"))),
      false,
    );
  }

  console.log(`\nworkspace-cold-load smoke: ${failures === 0 ? "PASS" : `FAIL (${failures})`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
