// Workspace placement tracer — who moved what, and why.
//
// Enable in the console, then reload:
//     localStorage.setItem("dg:trace:workspace", "1")
// Dump the whole sequence:
//     copy(window.__dgWorkspaceTrace)
// Disable:
//     localStorage.removeItem("dg:trace:workspace")
//
// Dependency-free and window-optional on purpose: content-store imports this
// and content-store must stay loadable under plain Node for
// `workspace:pane-placement:smoke`.

export interface WorkspaceTraceEvent {
  t: number;
  event: string;
  by?: string;
  data: Record<string, unknown>;
}

const RING = 400;
let enabled: boolean | null = null;
let buffer: WorkspaceTraceEvent[] = [];

declare global {
  interface Window {
    __dgWorkspaceTrace?: WorkspaceTraceEvent[];
    __dgTraceWorkspace?: boolean;
  }
}

export function isWorkspaceTraceEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__dgTraceWorkspace) return true;
  if (enabled !== null) return enabled;
  try {
    enabled = window.localStorage.getItem("dg:trace:workspace") === "1";
  } catch {
    enabled = false;
  }
  return enabled;
}

/**
 * The store action that caused a commit, read off the stack.
 *
 * Scans the WHOLE stack for a known action name rather than taking the first
 * foreign frame: under Turbopack's dev bundling the nearest frame is a chunk
 * wrapper ("http", "[project]/…"), which is what the first version reported.
 * Falls back to the nearest foreign frame so an unknown caller still shows
 * something greppable.
 */
const KNOWN_ACTIONS = [
  "restoreWorkspace",
  "restoreContentWorkspace",
  "setSelectedContentId",
  "openContentInPane",
  "focusPane",
  "setLayoutMode",
  "closeContentTab",
  "closeContentTabs",
  "clearAllWorkspaceTabs",
  "moveContentTabToPane",
  "activateContentTab",
  "replaceContentTab",
  "pinContentTab",
  "updateContentTab",
  "backfillTabMeta",
  "activateWorkspace",
  "loadWorkspaces",
  "receiveRefreshedWorkspaces",
  "persistActiveWorkspace",
];

/**
 * The frames above a commit, for the ring buffer only (never the console):
 * `traceCaller` names the innermost store action, which hides WHO called it
 * — a `setSelectedContentId` fired by a tree handler, a sidebar effect or an
 * open path all read the same. Dumped with `copy(window.__dgWorkspaceTrace)`
 * the chain is in `data.stack`.
 */
export function traceStack(depth = 14): string[] {
  const stack = new Error().stack ?? "";
  return stack
    .split("\n")
    .slice(1)
    .filter(
      (line) =>
        !line.includes("workspace-trace") && !line.includes("commitWorkspace"),
    )
    .slice(0, depth)
    .map((line) => line.trim().replace(/^at /, "").replace(/\(?https?:\/\/[^)]*\)?/g, "").trim());
}

export function traceCaller(): string {
  const stack = new Error().stack ?? "";
  const lines = stack.split("\n").slice(1);
  for (const line of lines) {
    const hit = KNOWN_ACTIONS.find((name) => line.includes(name));
    if (hit) return hit;
  }
  const frame = lines.find(
    (line) =>
      !line.includes("workspace-trace") &&
      !line.includes("commitWorkspace") &&
      !line.includes("traceCaller")
  );
  const match = frame?.match(/at (?:Object\.)?([\w$.<>\[\]/-]+)/);
  return match?.[1] ?? "?";
}

export function traceWorkspace(
  event: string,
  data: Record<string, unknown>,
  by?: string
): void {
  if (!isWorkspaceTraceEnabled()) return;
  const entry: WorkspaceTraceEvent = { t: Date.now(), event, by, data };
  buffer.push(entry);
  if (buffer.length > RING) buffer = buffer.slice(-RING);
  window.__dgWorkspaceTrace = buffer;
  // One line per event, greppable, with the structured payload attached.
  // Not routed through clientLogger on purpose: that beacons to the server,
  // and this is a local, flag-gated diagnostic whose output surface IS the
  // console.
  // eslint-disable-next-line no-console -- flag-gated dev tracer; the console is the output
  console.log(
    `%c[ws-trace] ${event}${by ? ` ← ${by}` : ""}`,
    "color:#C9A86C;font-weight:600",
    data
  );
}

/**
 * Everything a reconcile or a user action can change, as one comparable
 * string — the same shape the harness fingerprints.
 */
export function fingerprintPlacement(state: {
  layoutMode: string;
  activePaneId: string;
  selectedContentId: string | null;
  panes: Record<
    string,
    { tabIds: string[]; activeTabId: string | null } | undefined
  >;
  tabs: Record<string, { contentId: string } | undefined>;
}): string {
  const paneIds = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const panes = paneIds
    .map((p) => {
      const pane = state.panes[p];
      const ids = (pane?.tabIds ?? []).map((t) => state.tabs[t]?.contentId ?? t);
      const active = pane?.activeTabId
        ? state.tabs[pane.activeTabId]?.contentId ?? pane.activeTabId
        : "-";
      return `${p}=[${ids.join(",")}]@${active}`;
    })
    .join(" ");
  return `${state.layoutMode} focus=${state.activePaneId} sel=${state.selectedContentId} ${panes}`;
}
