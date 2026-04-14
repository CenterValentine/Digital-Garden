/**
 * Inline Timestamp Extension
 *
 * An inline atom node that flows inside paragraphs like text.
 * Clicking opens a popover (portaled to document.body) to set:
 *   - format  — per-node display format (e.g. "MMMM D, YYYY")
 *   - mode    — frozen | document-date | live
 *
 * Inherits paragraph-level formatting (bold, italic, headings) naturally
 * since it lives inside those nodes. Does NOT use the block factory chrome.
 *
 * upnext branch
 */

import { Node, mergeAttributes, type RawCommands } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { FORMAT_PRESETS, type TimestampFormat, type TimestampMode } from "@/state/timestamp-format-store";

// ─── Date formatting ─────────────────────────────────────────────────────────

const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const pad2 = (n: number) => String(n).padStart(2, "0");

export function formatTimestampDate(isoDate: string, format: TimestampFormat): string {
  if (!isoDate) return "";
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return isoDate;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const mL = MONTHS_LONG[month] ?? "";
  const mS = MONTHS_SHORT[month] ?? "";
  const mN = month + 1;
  switch (format) {
    case "MMMM D, YYYY": return `${mL} ${day}, ${year}`;
    case "MMM D, YYYY":  return `${mS} ${day}, ${year}`;
    case "D MMMM YYYY":  return `${day} ${mL} ${year}`;
    case "MM/DD/YYYY":   return `${pad2(mN)}/${pad2(day)}/${year}`;
    case "DD/MM/YYYY":   return `${pad2(day)}/${pad2(mN)}/${year}`;
    case "YYYY-MM-DD":   return `${year}-${pad2(mN)}-${pad2(day)}`;
    default:             return isoDate;
  }
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// ─── Popover ─────────────────────────────────────────────────────────────────
// Vanilla DOM popover — no React dep in this file so it works alongside
// the ProseMirror plugin lifecycle without hook restrictions.

let activePopover: { destroy: () => void } | null = null;

function destroyActivePopover() {
  if (activePopover) {
    activePopover.destroy();
    activePopover = null;
  }
}

function createTimestampPopover(opts: {
  anchorRect: DOMRect;
  currentFormat: TimestampFormat;
  currentMode: TimestampMode;
  onFormatChange: (f: TimestampFormat) => void;
  onModeChange: (m: TimestampMode) => void;
  onClose: () => void;
}) {
  destroyActivePopover();

  const { anchorRect, currentFormat, currentMode, onFormatChange, onModeChange, onClose } = opts;

  // Portal container
  const portal = document.createElement("div");
  portal.setAttribute("data-inline-timestamp-popover", "");
  portal.style.cssText = `
    position: fixed;
    z-index: 9999;
    background: var(--background, #fff);
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06);
    padding: 12px;
    min-width: 220px;
    font-family: inherit;
    font-size: 13px;
    color: var(--foreground, #1a1a1a);
    display: flex;
    flex-direction: column;
    gap: 10px;
  `;

  // ── Mode row ──
  const modeLabel = document.createElement("div");
  modeLabel.textContent = "Mode";
  modeLabel.style.cssText = "font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted-foreground, #888); margin-bottom: 2px;";

  const modeRow = document.createElement("div");
  modeRow.style.cssText = "display: flex; gap: 6px;";

  // Inline SVG icons — matches the project's server-component icon pattern
  const LOCK_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  const DOC_SVG  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  const LIVE_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

  const MODES: { key: TimestampMode; label: string; icon: string; title: string }[] = [
    { key: "frozen",        label: "Frozen",   icon: LOCK_SVG, title: "Date is set at insertion and never changes" },
    { key: "document-date", label: "Doc date", icon: DOC_SVG,  title: "Resolves to the document's creation date — useful in templates" },
    { key: "live",          label: "Live",     icon: LIVE_SVG, title: "Always shows today's date" },
  ];

  MODES.forEach(({ key, label, icon, title }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = title;
    btn.innerHTML = `${icon}<span style="margin-left:4px">${label}</span>`;
    const isActive = currentMode === key;
    btn.style.cssText = `
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 5px 8px;
      border-radius: 6px;
      border: 1px solid ${isActive ? "var(--gold-primary, #c9a86c)" : "rgba(0,0,0,0.08)"};
      background: ${isActive ? "rgba(201,168,108,0.12)" : "rgba(0,0,0,0.02)"};
      color: ${isActive ? "var(--gold-primary, #c9a86c)" : "var(--muted-foreground, #888)"};
      font-size: 12px;
      font-weight: ${isActive ? "600" : "400"};
      cursor: pointer;
      transition: all 0.1s;
      white-space: nowrap;
      gap: 4px;
    `;
    btn.addEventListener("click", () => {
      onModeChange(key);
      modeRow.querySelectorAll("button").forEach((b, i) => {
        const active = MODES[i].key === key;
        (b as HTMLButtonElement).style.border = `1px solid ${active ? "var(--gold-primary, #c9a86c)" : "rgba(0,0,0,0.08)"}`;
        (b as HTMLButtonElement).style.background = active ? "rgba(201,168,108,0.12)" : "rgba(0,0,0,0.02)";
        (b as HTMLButtonElement).style.color = active ? "var(--gold-primary, #c9a86c)" : "var(--muted-foreground, #888)";
        (b as HTMLButtonElement).style.fontWeight = active ? "600" : "400";
      });
    });
    modeRow.appendChild(btn);
  });

  // ── Format row ──
  const formatLabel = document.createElement("div");
  formatLabel.textContent = "Format";
  formatLabel.style.cssText = "font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted-foreground, #888); margin-bottom: 2px;";

  const formatGrid = document.createElement("div");
  formatGrid.style.cssText = "display: grid; grid-template-columns: 1fr 1fr; gap: 4px;";

  const sampleDate = todayIso();

  FORMAT_PRESETS.forEach((preset) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = formatTimestampDate(sampleDate, preset);
    const isActive = currentFormat === preset;
    btn.style.cssText = `
      padding: 6px 10px;
      border-radius: 6px;
      border: 1px solid ${isActive ? "var(--gold-primary, #c9a86c)" : "rgba(0,0,0,0.08)"};
      background: ${isActive ? "rgba(201,168,108,0.12)" : "rgba(0,0,0,0.02)"};
      color: ${isActive ? "var(--gold-primary, #c9a86c)" : "var(--foreground, #1a1a1a)"};
      font-size: 12px;
      font-weight: ${isActive ? "600" : "400"};
      cursor: pointer;
      transition: all 0.1s;
      text-align: left;
      letter-spacing: -0.01em;
    `;
    btn.addEventListener("mouseenter", () => {
      if (preset !== currentFormat) btn.style.background = "rgba(0,0,0,0.05)";
    });
    btn.addEventListener("mouseleave", () => {
      if (preset !== currentFormat) btn.style.background = "rgba(0,0,0,0.02)";
    });
    btn.addEventListener("click", () => {
      onFormatChange(preset);
      formatGrid.querySelectorAll("button").forEach((b, i) => {
        const active = FORMAT_PRESETS[i] === preset;
        (b as HTMLButtonElement).style.border = `1px solid ${active ? "var(--gold-primary, #c9a86c)" : "rgba(0,0,0,0.08)"}`;
        (b as HTMLButtonElement).style.background = active ? "rgba(201,168,108,0.12)" : "rgba(0,0,0,0.02)";
        (b as HTMLButtonElement).style.color = active ? "var(--gold-primary, #c9a86c)" : "var(--foreground, #1a1a1a)";
        (b as HTMLButtonElement).style.fontWeight = active ? "600" : "400";
      });
    });
    formatGrid.appendChild(btn);
  });

  // ── Divider + Copy date utility ──
  const divider = document.createElement("div");
  divider.style.cssText = "height: 1px; background: rgba(0,0,0,0.06); margin: 2px 0;";

  const COPY_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.innerHTML = `${COPY_SVG}<span style="margin-left:6px">Copy date text</span>`;
  copyBtn.style.cssText = `
    display: inline-flex;
    align-items: center;
    width: 100%;
    padding: 5px 8px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--muted-foreground, #888);
    font-size: 12px;
    cursor: pointer;
    transition: background 0.1s;
    text-align: left;
  `;
  copyBtn.addEventListener("mouseenter", () => { copyBtn.style.background = "rgba(0,0,0,0.04)"; });
  copyBtn.addEventListener("mouseleave", () => { copyBtn.style.background = "transparent"; });
  copyBtn.addEventListener("click", () => {
    const text = formatTimestampDate(sampleDate, currentFormat);
    navigator.clipboard.writeText(text).catch(() => {});
    copyBtn.innerHTML = `${COPY_SVG}<span style="margin-left:6px">Copied!</span>`;
    setTimeout(() => {
      copyBtn.innerHTML = `${COPY_SVG}<span style="margin-left:6px">Copy date text</span>`;
    }, 1500);
  });

  portal.appendChild(modeLabel);
  portal.appendChild(modeRow);
  portal.appendChild(formatLabel);
  portal.appendChild(formatGrid);
  portal.appendChild(divider);
  portal.appendChild(copyBtn);
  document.body.appendChild(portal);

  // ── Position: below anchor, flip up if needed ──
  const pRect = portal.getBoundingClientRect();
  const spaceBelow = window.innerHeight - anchorRect.bottom - 8;
  const top = spaceBelow >= pRect.height
    ? anchorRect.bottom + 6
    : anchorRect.top - pRect.height - 6;
  const left = Math.min(
    anchorRect.left,
    window.innerWidth - pRect.width - 8
  );
  portal.style.top = `${Math.max(8, top)}px`;
  portal.style.left = `${Math.max(8, left)}px`;

  // ── Click-outside to close ──
  function handleOutside(e: MouseEvent) {
    if (!portal.contains(e.target as globalThis.Node)) {
      onClose();
    }
  }
  // Defer so the triggering click doesn't immediately close
  setTimeout(() => document.addEventListener("mousedown", handleOutside), 10);

  function destroy() {
    document.removeEventListener("mousedown", handleOutside);
    portal.remove();
  }

  activePopover = { destroy };
  return { destroy };
}

// ─── TipTap Node ─────────────────────────────────────────────────────────────

export const InlineTimestamp = Node.create({
  name: "inlineTimestamp",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      isoDate: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-iso-date") || "",
        renderHTML: (attrs) => ({ "data-iso-date": attrs.isoDate }),
      },
      format: {
        default: "MMMM D, YYYY" as TimestampFormat,
        parseHTML: (el) => (el.getAttribute("data-format") || "MMMM D, YYYY") as TimestampFormat,
        renderHTML: (attrs) => ({ "data-format": attrs.format }),
      },
      mode: {
        default: "frozen" as TimestampMode,
        parseHTML: (el) => (el.getAttribute("data-mode") || "frozen") as TimestampMode,
        renderHTML: (attrs) => ({ "data-mode": attrs.mode }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'time[data-inline-timestamp]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const isoDate = String(HTMLAttributes["data-iso-date"] || "");
    const format = (HTMLAttributes["data-format"] || "MMMM D, YYYY") as TimestampFormat;
    const mode = (HTMLAttributes["data-mode"] || "frozen") as TimestampMode;
    const resolved = mode === "live" ? todayIso() : isoDate;
    const text = formatTimestampDate(resolved, format);
    return [
      "time",
      mergeAttributes(HTMLAttributes, {
        "data-inline-timestamp": "",
        class: "inline-timestamp",
        datetime: resolved,
        contenteditable: "false",
      }),
      text || resolved,
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("time");
      dom.setAttribute("data-inline-timestamp", "");
      dom.setAttribute("contenteditable", "false");
      dom.className = "inline-timestamp";
      dom.style.cssText = `
        display: inline;
        cursor: pointer;
        border-radius: 4px;
        padding: 1px 4px;
        background: rgba(201,168,108,0.10);
        color: var(--gold-primary, #c9a86c);
        font-size: inherit;
        line-height: inherit;
        transition: background 0.1s;
      `;

      function resolvedDate(): string {
        return node.attrs.mode === "live" ? todayIso() : node.attrs.isoDate;
      }

      function render() {
        dom.setAttribute("datetime", resolvedDate());
        dom.textContent = formatTimestampDate(resolvedDate(), node.attrs.format as TimestampFormat) || resolvedDate();
      }

      render();

      dom.addEventListener("mouseenter", () => {
        dom.style.background = "rgba(201,168,108,0.20)";
      });
      dom.addEventListener("mouseleave", () => {
        dom.style.background = "rgba(201,168,108,0.10)";
      });

      dom.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const anchorRect = dom.getBoundingClientRect();

        createTimestampPopover({
          anchorRect,
          currentFormat: node.attrs.format as TimestampFormat,
          currentMode: node.attrs.mode as TimestampMode,
          onFormatChange: (format) => {
            if (typeof getPos === "function") {
              const pos = getPos() as number;
              editor.chain().focus().command(({ tr }) => {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, format });
                return true;
              }).run();
            }
          },
          onModeChange: (mode) => {
            if (typeof getPos === "function") {
              const pos = getPos() as number;
              const newIso = mode === "live" ? todayIso() : node.attrs.isoDate;
              editor.chain().focus().command(({ tr }) => {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, mode, isoDate: newIso });
                return true;
              }).run();
            }
          },
          onClose: destroyActivePopover,
        });
      });

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== "inlineTimestamp") return false;
          // Keep node ref in sync for click handler closure
          (node as any) = updatedNode;
          render();
          return true;
        },
        destroy() {
          destroyActivePopover();
        },
      };
    };
  },

  addCommands() {
    return {
      insertInlineTimestamp:
        (attrs?: { format?: TimestampFormat; mode?: TimestampMode }) =>
        ({ commands }: { commands: { insertContent: (c: unknown) => boolean } }) => {
          return commands.insertContent({
            type: "inlineTimestamp",
            attrs: {
              isoDate: todayIso(),
              format: attrs?.format ?? "MMMM D, YYYY",
              mode: attrs?.mode ?? "frozen",
            },
          });
        },
    } as Partial<RawCommands>;
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("inlineTimestampEscClose"),
        props: {
          handleKeyDown(_view, event) {
            if (event.key === "Escape") {
              destroyActivePopover();
            }
            return false;
          },
        },
      }),
    ];
  },
});

// ─── Server-safe version ─────────────────────────────────────────────────────

export const ServerInlineTimestamp = Node.create({
  name: "inlineTimestamp",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      isoDate: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-iso-date") || "",
        renderHTML: (attrs) => ({ "data-iso-date": attrs.isoDate }),
      },
      format: {
        default: "MMMM D, YYYY" as TimestampFormat,
        parseHTML: (el) => (el.getAttribute("data-format") || "MMMM D, YYYY") as TimestampFormat,
        renderHTML: (attrs) => ({ "data-format": attrs.format }),
      },
      mode: {
        default: "frozen" as TimestampMode,
        parseHTML: (el) => (el.getAttribute("data-mode") || "frozen") as TimestampMode,
        renderHTML: (attrs) => ({ "data-mode": attrs.mode }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'time[data-inline-timestamp]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const isoDate = String(HTMLAttributes["data-iso-date"] || "");
    const format = (HTMLAttributes["data-format"] || "MMMM D, YYYY") as TimestampFormat;
    const text = formatTimestampDate(isoDate, format);
    return [
      "time",
      mergeAttributes(HTMLAttributes, {
        "data-inline-timestamp": "",
        class: "inline-timestamp",
        datetime: isoDate,
      }),
      text || isoDate,
    ];
  },
});
