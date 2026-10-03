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

/** The store action that caused a commit, read off the stack. Dev-only names. */
export function traceCaller(): string {
  const stack = new Error().stack ?? "";
  const lines = stack.split("\n").slice(1);
  // Skip our own frames; the first frame outside this module and the commit
  // helper is the action.
  const frame = lines.find(
    (line) =>
      !line.includes("workspace-trace") &&
      !line.includes("commitWorkspace") &&
      !line.includes("traceCaller")
  );
  const match = frame?.match(/at (?:Object\.)?([\w$.<>]+)/);
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
