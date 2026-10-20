"use client";

/**
 * Dev-only floating PR checklist: the open PR for the branch this localhost is
 * serving, with every checkbox in its description. Ticking a box here ticks it
 * on GitHub (via /api/dev/pr-checklist).
 *
 * The description is never seeded or cached — it is fetched live on mount,
 * when the tab regains focus (if the last fetch is >15s old), from the ↻
 * button, and after every toggle (the save returns GitHub's fresh copy).
 *
 * Drag the pill anywhere; its position is remembered per browser. Inline
 * styles for the same reason as the banner: this lands on many branches at
 * divergent design-token states and must render identically on all of them.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

interface Item {
  text: string;
  occurrence: number;
  checked: boolean;
  heading: string;
  isSmoke: boolean;
}

interface Snapshot {
  branch: string | null;
  pr: { number: number; title: string; url: string } | null;
  items: Item[];
  fetchedAt: string;
  error?: string;
}

interface Pos {
  x: number;
  y: number;
}

const ENDPOINT = "/api/dev/pr-checklist";
const POS_KEY = "dg:dev:pr-checklist:pos";
const FOCUS_REFRESH_MS = 15_000;
const PANEL_WIDTH = 420;

const FONT = "ui-sans-serif, system-ui, -apple-system, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const pillStyle: CSSProperties = {
  position: "fixed",
  zIndex: 2147483001, // one above the banner
  padding: "3px 9px",
  borderRadius: 999,
  fontFamily: MONO,
  fontSize: 11,
  lineHeight: 1.5,
  color: "#e4e4e7",
  background: "rgba(24, 24, 27, 0.88)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
  cursor: "grab",
  userSelect: "none",
  touchAction: "none",
  whiteSpace: "nowrap",
};

const panelStyle: CSSProperties = {
  position: "fixed",
  zIndex: 2147483001,
  width: PANEL_WIDTH,
  maxWidth: "calc(100vw - 16px)",
  maxHeight: "min(70vh, 560px)",
  display: "flex",
  flexDirection: "column",
  fontFamily: FONT,
  fontSize: 12.5,
  lineHeight: 1.45,
  color: "#e4e4e7",
  background: "rgba(24, 24, 27, 0.97)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: 10,
  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.45)",
  overflow: "hidden",
};

const iconButton: CSSProperties = {
  background: "none",
  border: "none",
  color: "#a1a1aa",
  cursor: "pointer",
  fontSize: 14,
  padding: "0 4px",
  lineHeight: 1,
};

/** `**bold**`, `` `code` `` and `[text](url)` — enough for checklist lines. */
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ color: "#fafafa" }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} style={{ fontFamily: MONO, fontSize: "0.92em", background: "rgba(255,255,255,0.08)", padding: "0 3px", borderRadius: 3 }}>
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = /^\[([^\]]+)\]\([^)]+\)$/.exec(part);
    return link ? link[1] : part;
  });
}

function ago(fetchedAt: string, now: number): string {
  const s = Math.round((now - Date.parse(fetchedAt)) / 1000);
  if (!now || s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

function readPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    return raw ? (JSON.parse(raw) as Pos) : null;
  } catch {
    return null;
  }
}

function writePos(pos: Pos): void {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    // private window / blocked storage — position just won't persist
  }
}

const PILL_ROOM = 150; // generous pill width, so a clamped pill never runs off-screen

const clamp = (pos: Pos): Pos => ({
  x: Math.min(Math.max(4, pos.x), window.innerWidth - PILL_ROOM),
  y: Math.min(Math.max(4, pos.y), window.innerHeight - 28),
});

export function DevPrChecklist() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [now, setNow] = useState(0);
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const lastFetch = useRef(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(ENDPOINT, { cache: "no-store" });
      const data = (await res.json()) as Snapshot;
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSnap(data);
      setError(null);
      lastFetch.current = Date.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial position + first fetch. Default is bottom-RIGHT: Next's own dev
  // indicator owns the bottom-left corner and would sit on top of the pill.
  useEffect(() => {
    setPos(clamp(readPos() ?? { x: window.innerWidth - PILL_ROOM - 12, y: window.innerHeight - 64 }));
    void refresh();
  }, [refresh]);

  // Refresh on tab focus when stale; tick the "fetched … ago" label.
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastFetch.current > FOCUS_REFRESH_MS) void refresh();
    };
    window.addEventListener("focus", onFocus);
    const tick = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(tick);
    };
  }, [refresh]);

  const toggle = async (item: Item) => {
    if (!snap?.pr) return;
    const checked = !item.checked;
    const flip = (s: Snapshot, value: boolean): Snapshot => ({
      ...s,
      items: s.items.map((it) =>
        it.text === item.text && it.occurrence === item.occurrence ? { ...it, checked: value } : it,
      ),
    });
    setSnap((s) => (s ? flip(s, checked) : s)); // optimistic until GitHub agrees
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: snap.pr.number, text: item.text, occurrence: item.occurrence, checked }),
      });
      const data = (await res.json()) as Snapshot;
      if (data.items) setSnap(data); // 200, and 409 (fresh list after a GitHub-side edit)
      lastFetch.current = Date.now();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setError(null);
    } catch (err) {
      setSnap((s) => (s ? flip(s, item.checked) : s));
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pos) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = clamp({ x: e.clientX - d.dx, y: e.clientY - d.dy });
    if (!d.moved && pos && Math.hypot(next.x - pos.x, next.y - pos.y) < 4) return;
    d.moved = true;
    setPos(next);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved && pos) writePos(pos);
    else setOpen((o) => !o);
  };

  if (!pos) return null;

  const done = snap?.items.filter((i) => i.checked).length ?? 0;
  const total = snap?.items.length ?? 0;
  const pillLabel = error && !snap
    ? "PR checklist · error"
    : !snap
      ? "PR checklist…"
      : snap.pr
        ? `PR #${snap.pr.number} · ${done}/${total}`
        : "no PR";

  // Open the panel away from the nearest screen edge.
  const below = pos.y < window.innerHeight / 2;
  const panelPos: CSSProperties = {
    left: Math.min(pos.x, window.innerWidth - Math.min(PANEL_WIDTH, window.innerWidth - 16) - 8),
    ...(below ? { top: pos.y + 30 } : { bottom: window.innerHeight - pos.y + 6 }),
  };

  const groups: { heading: string; items: Item[] }[] = [];
  for (const item of snap?.items ?? []) {
    const last = groups[groups.length - 1];
    if (last && last.heading === item.heading) last.items.push(item);
    else groups.push({ heading: item.heading, items: [item] });
  }

  return (
    <>
      <div
        role="button"
        aria-label="PR smoke checklist"
        title={snap?.pr ? `${snap.pr.title} — click to open, drag to move` : "Drag to move"}
        style={{ ...pillStyle, left: pos.x, top: pos.y, opacity: snap && !snap.pr ? 0.6 : 1 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {pillLabel}
      </div>

      {open && (
        <div style={{ ...panelStyle, ...panelPos }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {snap?.pr ? (
                <a href={snap.pr.url} target="_blank" rel="noreferrer" style={{ color: "#fafafa", textDecoration: "none", fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  #{snap.pr.number} {snap.pr.title}
                </a>
              ) : (
                <span style={{ fontWeight: 600 }}>No open PR</span>
              )}
              <div style={{ color: "#71717a", fontSize: 11, fontFamily: MONO }}>
                {snap?.branch ?? "…"} · {loading ? "fetching…" : snap ? `fetched ${ago(snap.fetchedAt, now)}` : ""}
              </div>
            </div>
            <button type="button" title="Refresh from GitHub" style={iconButton} disabled={loading} onClick={() => void refresh()}>
              ↻
            </button>
            <button type="button" title="Close" style={iconButton} onClick={() => setOpen(false)}>
              ×
            </button>
          </div>

          <div style={{ overflowY: "auto", padding: "4px 10px 10px" }}>
            {error && <div style={{ color: "#fca5a5", padding: "6px 0" }}>{error}</div>}
            {snap && !snap.pr && (
              <div style={{ color: "#a1a1aa", padding: "8px 0" }}>
                No open PR for <code style={{ fontFamily: MONO }}>{snap.branch ?? "this checkout"}</code>.
              </div>
            )}
            {snap?.pr && total === 0 && <div style={{ color: "#a1a1aa", padding: "8px 0" }}>The PR description has no checkboxes.</div>}
            {groups.map((g, gi) => (
              <div key={gi}>
                {g.heading && (
                  <div style={{ color: "#71717a", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", margin: "10px 0 4px" }}>
                    {g.heading}
                  </div>
                )}
                {g.items.map((item) => (
                  <label
                    key={`${item.text}#${item.occurrence}`}
                    style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 0", cursor: "pointer", color: item.checked ? "#a1a1aa" : "#e4e4e7" }}
                  >
                    <input type="checkbox" checked={item.checked} onChange={() => void toggle(item)} style={{ marginTop: 3, accentColor: item.isSmoke ? "#22c55e" : undefined }} />
                    <span>{renderInline(item.text)}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
