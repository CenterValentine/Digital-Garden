/**
 * Inline Timestamp Extension
 *
 * An inline atom node that flows inside paragraphs like text.
 * Clicking opens a popover (portaled to document.body) to set:
 *   - format       — per-node display format (e.g. "MMMM D, YYYY")
 *   - mode         — frozen | document-date | content-updated | custom | live
 *   - customIso    — user-selected date/time (ISO, may include T hh:mm) for custom mode
 *
 * Inherits paragraph-level formatting (bold, italic, headings) naturally
 * since it lives inside those nodes. Does NOT use the block factory chrome.
 *
 * upnext branch
 */

import { Node, mergeAttributes, type RawCommands } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { FORMAT_PRESETS, type TimestampFormat, type TimestampMode } from "@/state/timestamp-format-store";

// ─── Document-level date context ─────────────────────────────────────────────
// Set by MainPanelContent when a document is opened so that
// "Content Creation" and "Content Updated" modes resolve correctly.

let documentCreatedAt = "";
let documentUpdatedAt = "";

/** Called from MainPanelContent whenever a content node is loaded. */
export function setDocumentDates(createdAt: string, updatedAt: string) {
  documentCreatedAt = createdAt;
  documentUpdatedAt = updatedAt;
}

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

/** Format an ISO string with optional time suffix (12h, e.g. "3:45 PM"). */
export function formatTimestampWithTime(iso: string, format: TimestampFormat): string {
  const datePart = formatTimestampDate(iso, format);
  const timeMatch = iso.match(/T(\d{2}):(\d{2})/);
  if (!timeMatch) return datePart;
  const h24 = parseInt(timeMatch[1], 10);
  const mins = timeMatch[2];
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return datePart ? `${datePart}, ${h12}:${mins} ${ampm}` : `${h12}:${mins} ${ampm}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Resolve the effective ISO string based on mode. */
function resolveIso(attrs: { mode: string; isoDate: string; customIso?: string }): string {
  switch (attrs.mode) {
    case "live":            return todayIso();
    case "document-date":   return documentCreatedAt || attrs.isoDate;
    case "content-updated": return documentUpdatedAt || attrs.isoDate;
    case "custom":          return attrs.customIso || attrs.isoDate;
    default:                return attrs.isoDate; // frozen
  }
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
  currentCustomIso: string;
  resolvedIso: string;
  onFormatChange: (f: TimestampFormat) => void;
  onModeChange: (m: TimestampMode) => void;
  onCustomIsoChange: (iso: string) => void;
  onClose: () => void;
}) {
  destroyActivePopover();

  const {
    anchorRect, currentFormat, currentMode, currentCustomIso, resolvedIso,
    onFormatChange, onModeChange, onCustomIsoChange, onClose,
  } = opts;

  // Track mutable state within popover lifetime
  let activeMode = currentMode;
  let activeFormat = currentFormat;
  let activeCustomIso = currentCustomIso || todayIso();

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
    min-width: 240px;
    font-family: inherit;
    font-size: 13px;
    color: var(--foreground, #1a1a1a);
    display: flex;
    flex-direction: column;
    gap: 10px;
  `;

  // ── SVG icons ──
  const LOCK_SVG    = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  const CREATED_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`;
  const UPDATED_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 12 12 15 15"/></svg>`;
  const CUSTOM_SVG  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="12" y1="14" x2="14" y2="14"/></svg>`;
  const LIVE_SVG    = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  const COPY_SVG    = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

  const MODES: { key: TimestampMode; label: string; icon: string; title: string }[] = [
    { key: "frozen",          label: "Frozen",    icon: LOCK_SVG,    title: "Date is set at insertion and never changes" },
    { key: "document-date",   label: "Created",   icon: CREATED_SVG, title: "Resolves to the document's creation date — useful in templates" },
    { key: "content-updated", label: "Updated",   icon: UPDATED_SVG, title: "Resolves to the document's last-saved date" },
    { key: "custom",          label: "Custom",    icon: CUSTOM_SVG,  title: "Pick any date (and optional time)" },
    { key: "live",            label: "Live",      icon: LIVE_SVG,    title: "Always shows today's date" },
  ];

  // ── Mode label ──
  const modeLabel = document.createElement("div");
  modeLabel.textContent = "Mode";
  modeLabel.style.cssText = "font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted-foreground, #888); margin-bottom: 2px;";

  // ── Mode grid (3 columns auto-wrap) ──
  const modeGrid = document.createElement("div");
  modeGrid.style.cssText = "display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;";

  const modeButtons: HTMLButtonElement[] = [];

  function applyModeButtonStyle(btn: HTMLButtonElement, active: boolean) {
    btn.style.border = `1px solid ${active ? "var(--gold-primary, #c9a86c)" : "rgba(0,0,0,0.08)"}`;
    btn.style.background = active ? "rgba(201,168,108,0.12)" : "rgba(0,0,0,0.02)";
    btn.style.color = active ? "var(--gold-primary, #c9a86c)" : "var(--muted-foreground, #888)";
    btn.style.fontWeight = active ? "600" : "400";
  }

  // ── Custom date/time picker (hidden until custom mode active) ──
  const customSection = document.createElement("div");
  customSection.style.cssText = `
    display: ${currentMode === "custom" ? "flex" : "none"};
    flex-direction: column;
    gap: 6px;
  `;

  function parseCustomParts(iso: string): { date: string; time: string } {
    const dateMatch = iso.match(/^(\d{4}-\d{2}-\d{2})/);
    const timeMatch = iso.match(/T(\d{2}:\d{2})/);
    return {
      date: dateMatch ? dateMatch[1] : todayIso(),
      time: timeMatch ? timeMatch[1] : "",
    };
  }

  const parts = parseCustomParts(activeCustomIso);

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = parts.date;
  dateInput.style.cssText = `
    width: 100%;
    padding: 5px 8px;
    border-radius: 6px;
    border: 1px solid rgba(0,0,0,0.12);
    background: rgba(0,0,0,0.02);
    color: var(--foreground, #1a1a1a);
    font-size: 12px;
    font-family: inherit;
    box-sizing: border-box;
    outline: none;
  `;

  const timeRow = document.createElement("div");
  timeRow.style.cssText = "display: flex; align-items: center; gap: 6px;";

  const timeCheckLabel = document.createElement("label");
  timeCheckLabel.style.cssText = "display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--muted-foreground, #888); cursor: pointer; white-space: nowrap;";
  const timeCheckbox = document.createElement("input");
  timeCheckbox.type = "checkbox";
  timeCheckbox.checked = Boolean(parts.time);
  timeCheckbox.style.cssText = "cursor: pointer;";
  timeCheckLabel.appendChild(timeCheckbox);
  timeCheckLabel.appendChild(document.createTextNode("Include time"));

  const timeInput = document.createElement("input");
  timeInput.type = "time";
  timeInput.value = parts.time || "12:00";
  timeInput.style.cssText = `
    flex: 1;
    padding: 5px 8px;
    border-radius: 6px;
    border: 1px solid rgba(0,0,0,0.12);
    background: rgba(0,0,0,0.02);
    color: var(--foreground, #1a1a1a);
    font-size: 12px;
    font-family: inherit;
    display: ${parts.time ? "block" : "none"};
    box-sizing: border-box;
    outline: none;
  `;

  function buildCustomIso(): string {
    const d = dateInput.value || todayIso();
    if (timeCheckbox.checked && timeInput.value) {
      return `${d}T${timeInput.value}`;
    }
    return d;
  }

  function emitCustomChange() {
    const iso = buildCustomIso();
    activeCustomIso = iso;
    onCustomIsoChange(iso);
  }

  timeCheckbox.addEventListener("change", () => {
    timeInput.style.display = timeCheckbox.checked ? "block" : "none";
    emitCustomChange();
  });
  dateInput.addEventListener("change", emitCustomChange);
  timeInput.addEventListener("change", emitCustomChange);

  timeRow.appendChild(timeCheckLabel);
  timeRow.appendChild(timeInput);
  customSection.appendChild(dateInput);
  customSection.appendChild(timeRow);

  MODES.forEach(({ key, label, icon, title }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = title;
    btn.innerHTML = `<span style="display:flex;align-items:center;gap:4px;justify-content:center;">${icon}<span>${label}</span></span>`;
    const isActive = currentMode === key;
    btn.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 5px 6px;
      border-radius: 6px;
      border: 1px solid ${isActive ? "var(--gold-primary, #c9a86c)" : "rgba(0,0,0,0.08)"};
      background: ${isActive ? "rgba(201,168,108,0.12)" : "rgba(0,0,0,0.02)"};
      color: ${isActive ? "var(--gold-primary, #c9a86c)" : "var(--muted-foreground, #888)"};
      font-size: 11px;
      font-weight: ${isActive ? "600" : "400"};
      cursor: pointer;
      transition: all 0.1s;
      white-space: nowrap;
      font-family: inherit;
    `;
    btn.addEventListener("click", () => {
      activeMode = key;
      onModeChange(key);
      modeButtons.forEach((b, i) => applyModeButtonStyle(b, MODES[i].key === key));
      // Show/hide custom section
      customSection.style.display = key === "custom" ? "flex" : "none";
    });
    modeGrid.appendChild(btn);
    modeButtons.push(btn);
  });

  // ── Format label ──
  const formatLabel = document.createElement("div");
  formatLabel.textContent = "Format";
  formatLabel.style.cssText = "font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted-foreground, #888); margin-bottom: 2px;";

  // ── Format grid ──
  const formatGrid = document.createElement("div");
  formatGrid.style.cssText = "display: grid; grid-template-columns: 1fr 1fr; gap: 4px;";

  // Use the resolved ISO so the preview shows the actual date (not just today)
  const previewIso = resolvedIso || todayIso();

  function applyFormatButtonStyle(btn: HTMLButtonElement, active: boolean) {
    btn.style.border = `1px solid ${active ? "var(--gold-primary, #c9a86c)" : "rgba(0,0,0,0.08)"}`;
    btn.style.background = active ? "rgba(201,168,108,0.12)" : "rgba(0,0,0,0.02)";
    btn.style.color = active ? "var(--gold-primary, #c9a86c)" : "var(--foreground, #1a1a1a)";
    btn.style.fontWeight = active ? "600" : "400";
  }

  FORMAT_PRESETS.forEach((preset) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = formatTimestampDate(previewIso, preset);
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
      font-family: inherit;
    `;
    btn.addEventListener("mouseenter", () => {
      if (preset !== activeFormat) btn.style.background = "rgba(0,0,0,0.05)";
    });
    btn.addEventListener("mouseleave", () => {
      if (preset !== activeFormat) btn.style.background = "rgba(0,0,0,0.02)";
    });
    btn.addEventListener("click", () => {
      activeFormat = preset;
      onFormatChange(preset);
      formatGrid.querySelectorAll("button").forEach((b, i) => {
        applyFormatButtonStyle(b as HTMLButtonElement, FORMAT_PRESETS[i] === preset);
      });
    });
    formatGrid.appendChild(btn);
  });

  // ── Divider + Copy date utility ──
  const divider = document.createElement("div");
  divider.style.cssText = "height: 1px; background: rgba(0,0,0,0.06); margin: 2px 0;";

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
    font-family: inherit;
  `;
  copyBtn.addEventListener("mouseenter", () => { copyBtn.style.background = "rgba(0,0,0,0.04)"; });
  copyBtn.addEventListener("mouseleave", () => { copyBtn.style.background = "transparent"; });
  copyBtn.addEventListener("click", () => {
    // Resolve the actual displayed date, not just today
    const iso = resolveIso({ mode: activeMode, isoDate: resolvedIso, customIso: activeCustomIso });
    const text = formatTimestampWithTime(iso, activeFormat);
    navigator.clipboard.writeText(text).catch(() => {});
    copyBtn.innerHTML = `${COPY_SVG}<span style="margin-left:6px">Copied!</span>`;
    setTimeout(() => {
      copyBtn.innerHTML = `${COPY_SVG}<span style="margin-left:6px">Copy date text</span>`;
    }, 1500);
  });

  portal.appendChild(modeLabel);
  portal.appendChild(modeGrid);
  portal.appendChild(customSection);
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
      customIso: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-custom-iso") || "",
        renderHTML: (attrs) => attrs.customIso ? { "data-custom-iso": attrs.customIso } : {},
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
    const customIso = String(HTMLAttributes["data-custom-iso"] || "");
    const resolved = resolveIso({ mode, isoDate, customIso });
    const text = formatTimestampWithTime(resolved, format);
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

      function getResolved(): string {
        return resolveIso({
          mode: node.attrs.mode,
          isoDate: node.attrs.isoDate,
          customIso: node.attrs.customIso,
        });
      }

      function render() {
        const iso = getResolved();
        dom.setAttribute("datetime", iso);
        dom.textContent = formatTimestampWithTime(iso, node.attrs.format as TimestampFormat) || iso;
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
          currentCustomIso: node.attrs.customIso || "",
          resolvedIso: getResolved(),
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
              editor.chain().focus().command(({ tr }) => {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, mode });
                return true;
              }).run();
            }
          },
          onCustomIsoChange: (customIso) => {
            if (typeof getPos === "function") {
              const pos = getPos() as number;
              editor.chain().focus().command(({ tr }) => {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, mode: "custom", customIso });
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
