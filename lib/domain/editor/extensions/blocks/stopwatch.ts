import { Node, mergeAttributes } from "@tiptap/core";
import type { DOMOutputSpec } from "@tiptap/pm/model";
import { z } from "zod";

import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import {
  createBlockNodeView,
  syncAttrsToPanel,
} from "@/lib/domain/blocks/node-view-factory";
import {
  addStopwatchLap,
  createDefaultStopwatchAttrs,
  DEFAULT_STOPWATCH_COLOR,
  formatStopwatchPlainText,
  getStopwatchDisplayParts,
  getStopwatchElapsedMs,
  getStopwatchLapRows,
  normalizeStopwatchAttrs,
  nowIsoTimestamp,
  resetStopwatch,
  startStopwatch,
  stopStopwatch,
  type StopwatchAttrs,
  type StopwatchLap,
} from "@/lib/domain/stopwatch";
import { useBlockStore } from "@/state/block-store";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";

const { schema: stopwatchSchema, defaults: stopwatchDefaults } = createBlockSchema(
  "stopwatch",
  {
    title: z.string().default("Stopwatch").describe("Stopwatch title"),
    styleVariant: z
      .enum(["ios", "minimal", "panel"])
      .default("ios")
      .describe("Visual style"),
    accentColor: z
      .string()
      .default(DEFAULT_STOPWATCH_COLOR)
      .describe("Accent color"),
    showLaps: z.boolean().default(true).describe("Show lap list"),
    showBackground: z.boolean().default(true).describe("Show background fill"),
    showBorder: z.boolean().default(true).describe("Show border"),
    running: z.boolean().default(false).describe("Whether the stopwatch is running"),
    startedAt: z.string().nullable().default(null).describe("Current run start timestamp"),
    accumulatedMs: z.number().default(0).describe("Elapsed time before current run"),
    laps: z.array(z.unknown()).default([]).describe("Captured lap entries"),
  }
);

registerBlock({
  type: "stopwatch",
  label: "Stopwatch",
  description: "Persisted count-up stopwatch with laps and style variants",
  iconName: "TimerReset",
  family: "content",
  group: "display",
  contentModel: null,
  atom: true,
  attrsSchema: stopwatchSchema,
  defaultAttrs: createDefaultStopwatchAttrs() as unknown as Record<string, unknown>,
  slashCommand: "/stopwatch",
  searchTerms: ["stopwatch", "timer", "lap", "elapsed", "clock"],
  hiddenFields: ["running", "startedAt", "accumulatedMs", "laps"],
});

function parseJsonAttribute<T>(
  element: HTMLElement,
  attributeName: string,
  fallback: T
): T {
  const raw = element.getAttribute(attributeName);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function resolveStopwatchAttrs(rawAttrs: Record<string, unknown>): StopwatchAttrs {
  const defaults = stopwatchDefaults() as unknown as Record<string, unknown>;
  return normalizeStopwatchAttrs({
    ...defaults,
    ...rawAttrs,
    blockType: "stopwatch",
  });
}

function dispatchStopwatchAttrChange(blockId: string, key: string, value: unknown) {
  window.dispatchEvent(
    new CustomEvent("block-attrs-change", {
      detail: { blockId, key, value },
    })
  );
}

function dispatchStopwatchAttrs(blockId: string, current: StopwatchAttrs, next: StopwatchAttrs) {
  const keys: Array<keyof StopwatchAttrs> = [
    "title",
    "styleVariant",
    "accentColor",
    "showLaps",
    "showBackground",
    "showBorder",
    "running",
    "startedAt",
    "accumulatedMs",
    "laps",
  ];

  for (const key of keys) {
    const prevValue = current[key];
    const nextValue = next[key];
    const changed =
      Array.isArray(prevValue) || Array.isArray(nextValue)
        ? JSON.stringify(prevValue) !== JSON.stringify(nextValue)
        : prevValue !== nextValue;
    if (changed) {
      dispatchStopwatchAttrChange(blockId, key, nextValue);
    }
  }
}

function openStopwatchSettings(blockId: string, attrs: StopwatchAttrs) {
  useBlockStore.getState().setSelectedBlock(blockId, "stopwatch");
  useBlockStore.getState().openProperties();
  useRightPanelCollapseStore.getState().setCollapsed(false);
  syncAttrsToPanel(blockId, attrs as unknown as Record<string, unknown>);
}

function createControlButton(
  label: string,
  className: string,
  onClick?: () => void
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  if (onClick) {
    button.addEventListener("click", onClick);
  } else {
    button.disabled = true;
  }
  return button;
}

function updateDisplayParts(container: HTMLElement, elapsedMs: number) {
  container.innerHTML = "";
  const parts = getStopwatchDisplayParts(elapsedMs);
  parts.forEach((part, index) => {
    const segment = document.createElement("div");
    segment.className = "stopwatch-segment";

    const value = document.createElement("span");
    value.className = "stopwatch-segment-value";
    value.textContent = part.text;
    segment.appendChild(value);

    const label = document.createElement("span");
    label.className = "stopwatch-segment-label";
    label.textContent = part.label;
    segment.appendChild(label);

    container.appendChild(segment);
    if (index < parts.length - 1) {
      const separator = document.createElement("span");
      separator.className = "stopwatch-separator";
      separator.textContent = ":";
      container.appendChild(separator);
    }
  });
}

function buildLapItem(
  lap: ReturnType<typeof getStopwatchLapRows>["laps"][number],
  variant: "live" | "static"
) {
  const item = document.createElement("div");
  item.className = `stopwatch-lap-row stopwatch-lap-row-${variant}`;

  const label = document.createElement("span");
  label.className = "stopwatch-lap-index";
  label.textContent = `Lap ${lap.number}`;
  item.appendChild(label);

  const lapValue = document.createElement("span");
  lapValue.className = "stopwatch-lap-value";
  lapValue.textContent = lap.lapText;
  item.appendChild(lapValue);

  const splitValue = document.createElement("span");
  splitValue.className = "stopwatch-lap-split";
  splitValue.textContent = lap.splitText;
  item.appendChild(splitValue);

  return item;
}

function renderStopwatchContent(
  node: Parameters<
    Parameters<typeof createBlockNodeView>[0]["renderContent"]
  >[0],
  contentDom: HTMLElement
) {
  const previousCleanup = (contentDom as { __cleanup?: () => void }).__cleanup;
  if (previousCleanup) previousCleanup();

  const attrs = resolveStopwatchAttrs(node.attrs as Record<string, unknown>);
  contentDom.innerHTML = "";
  contentDom.className = "block-content stopwatch-content";
  contentDom.setAttribute("data-background", attrs.showBackground ? "visible" : "hidden");
  contentDom.setAttribute("data-variant", attrs.styleVariant);
  contentDom.style.setProperty("--stopwatch-accent", attrs.accentColor);

  const header = document.createElement("div");
  header.className = "stopwatch-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "stopwatch-title-wrap";

  const title = document.createElement("div");
  title.className = "stopwatch-title";
  title.textContent = attrs.title || "Stopwatch";
  titleWrap.appendChild(title);

  const status = document.createElement("div");
  status.className = "stopwatch-status";
  status.textContent = attrs.running ? "Running" : getStopwatchElapsedMs(attrs) > 0 ? "Paused" : "Ready";
  titleWrap.appendChild(status);

  header.appendChild(titleWrap);

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "stopwatch-edit-btn";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => {
    openStopwatchSettings(attrs.blockId, attrs);
  });
  header.appendChild(editButton);
  contentDom.appendChild(header);

  const display = document.createElement("div");
  display.className = "stopwatch-display";
  contentDom.appendChild(display);

  const meta = document.createElement("div");
  meta.className = "stopwatch-meta";
  contentDom.appendChild(meta);

  const controls = document.createElement("div");
  controls.className = "stopwatch-controls";

  const elapsedMs = getStopwatchElapsedMs(attrs);
  if (attrs.running && attrs.showLaps) {
    controls.appendChild(
      createControlButton("Lap", "stopwatch-control stopwatch-control-secondary", () => {
        const nextAttrs = addStopwatchLap(attrs, nowIsoTimestamp());
        dispatchStopwatchAttrs(attrs.blockId, attrs, nextAttrs);
      })
    );
  } else if (!attrs.running && elapsedMs > 0) {
    controls.appendChild(
      createControlButton("Reset", "stopwatch-control stopwatch-control-secondary", () => {
        const nextAttrs = resetStopwatch(attrs);
        dispatchStopwatchAttrs(attrs.blockId, attrs, nextAttrs);
      })
    );
  } else {
    controls.appendChild(
      createControlButton("Lap", "stopwatch-control stopwatch-control-ghost")
    );
  }

  controls.appendChild(
    createControlButton(
      attrs.running ? "Stop" : "Start",
      `stopwatch-control ${attrs.running ? "stopwatch-control-stop" : "stopwatch-control-start"}`,
      () => {
        const nextAttrs = attrs.running
          ? stopStopwatch(attrs, nowIsoTimestamp())
          : startStopwatch(attrs, nowIsoTimestamp());
        dispatchStopwatchAttrs(attrs.blockId, attrs, nextAttrs);
      }
    )
  );
  contentDom.appendChild(controls);

  const lapsWrap = document.createElement("div");
  lapsWrap.className = "stopwatch-laps";
  contentDom.appendChild(lapsWrap);

  const tick = () => {
    const nowMs = Date.now();
    const nextElapsed = getStopwatchElapsedMs(attrs, nowMs);
    updateDisplayParts(display, nextElapsed);
    meta.textContent =
      attrs.showLaps && attrs.laps.length > 0
        ? `Latest split ${getStopwatchLapRows(attrs, nowMs).laps[attrs.laps.length - 1]?.splitText || formatStopwatchPlainText(nextElapsed)}`
        : attrs.running
          ? "Anchored to the saved start time"
          : nextElapsed > 0
            ? "Stopped and saved"
            : "Ready to start";

    lapsWrap.innerHTML = "";
    if (!attrs.showLaps) return;

    const lapRows = getStopwatchLapRows(attrs, nowMs);
    if (lapRows.laps.length === 0) {
      const empty = document.createElement("div");
      empty.className = "stopwatch-laps-empty";
      empty.textContent = attrs.running
        ? `Current lap ${lapRows.currentLapText}`
        : "No laps yet";
      lapsWrap.appendChild(empty);
      return;
    }

    const headerRow = document.createElement("div");
    headerRow.className = "stopwatch-laps-header";
    headerRow.innerHTML =
      '<span>Lap</span><span>Lap Time</span><span>Split</span>';
    lapsWrap.appendChild(headerRow);

    const list = document.createElement("div");
    list.className = "stopwatch-laps-list";
    [...lapRows.laps]
      .reverse()
      .forEach((lap) => {
        list.appendChild(buildLapItem(lap, "live"));
      });
    lapsWrap.appendChild(list);
  };

  tick();
  let intervalId: ReturnType<typeof setInterval> | null = null;
  if (attrs.running) {
    intervalId = setInterval(tick, 33);
  }

  (contentDom as { __cleanup?: () => void }).__cleanup = () => {
    if (intervalId) clearInterval(intervalId);
  };
}

function buildStaticDisplay(parts: ReturnType<typeof getStopwatchDisplayParts>): DOMOutputSpec {
  return [
    "div",
    { class: "stopwatch-display" },
    ...parts.flatMap<DOMOutputSpec>((part, index) => [
      [
        "div",
        { class: "stopwatch-segment" },
        ["span", { class: "stopwatch-segment-value" }, part.text],
        ["span", { class: "stopwatch-segment-label" }, part.label],
      ],
      ...(index < parts.length - 1
        ? [["span", { class: "stopwatch-separator" }, ":"] satisfies DOMOutputSpec]
        : []),
    ]),
  ];
}

function buildStaticStopwatchContent(attrs: StopwatchAttrs): DOMOutputSpec[] {
  const elapsedMs = getStopwatchElapsedMs(attrs);
  const lapRows = getStopwatchLapRows(attrs);
  const statusText = attrs.running ? "Running" : elapsedMs > 0 ? "Paused" : "Ready";

  return [
    [
      "div",
      { class: "stopwatch-header" },
      [
        "div",
        { class: "stopwatch-title-wrap" },
        ["div", { class: "stopwatch-title" }, attrs.title || "Stopwatch"],
        ["div", { class: "stopwatch-status" }, statusText],
      ],
    ],
    buildStaticDisplay(getStopwatchDisplayParts(elapsedMs)),
    [
      "div",
      { class: "stopwatch-meta" },
      attrs.running
        ? "Anchored to the saved start time"
        : elapsedMs > 0
          ? "Stopped and saved"
          : "Ready to start",
    ],
    ...(attrs.showLaps
      ? [[
          "div",
          { class: "stopwatch-laps" },
          ...(lapRows.laps.length > 0
            ? [
                ["div", { class: "stopwatch-laps-header" }, ["span", {}, "Lap"], ["span", {}, "Lap Time"], ["span", {}, "Split"]] satisfies DOMOutputSpec,
                [
                  "div",
                  { class: "stopwatch-laps-list" },
                  ...[...lapRows.laps].reverse().map<DOMOutputSpec>((lap) => [
                    "div",
                    { class: "stopwatch-lap-row stopwatch-lap-row-static" },
                    ["span", { class: "stopwatch-lap-index" }, `Lap ${lap.number}`],
                    ["span", { class: "stopwatch-lap-value" }, lap.lapText],
                    ["span", { class: "stopwatch-lap-split" }, lap.splitText],
                  ]),
                ] satisfies DOMOutputSpec,
              ]
            : [[
                "div",
                { class: "stopwatch-laps-empty" },
                attrs.running ? `Current lap ${lapRows.currentLapText}` : "No laps yet",
              ] satisfies DOMOutputSpec]),
        ] satisfies DOMOutputSpec]
      : []),
  ];
}

function getSharedAttributes() {
  return {
    blockId: { default: null },
    blockType: { default: "stopwatch" },
    title: {
      default: "Stopwatch",
      parseHTML: (el: HTMLElement) => el.getAttribute("data-title") || "Stopwatch",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-title": attrs.title || "Stopwatch" }),
    },
    styleVariant: {
      default: "ios",
      parseHTML: (el: HTMLElement) => el.getAttribute("data-style-variant") || "ios",
      renderHTML: (attrs: Record<string, unknown>) => ({
        "data-style-variant": attrs.styleVariant || "ios",
      }),
    },
    accentColor: {
      default: DEFAULT_STOPWATCH_COLOR,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-accent-color") || DEFAULT_STOPWATCH_COLOR,
      renderHTML: (attrs: Record<string, unknown>) => ({
        "data-accent-color": attrs.accentColor || DEFAULT_STOPWATCH_COLOR,
      }),
    },
    showLaps: {
      default: true,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-show-laps") !== "false",
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.showLaps === false ? { "data-show-laps": "false" } : {},
    },
    showBackground: {
      default: true,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-show-background") !== "false",
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.showBackground === false ? { "data-show-background": "false" } : {},
    },
    showBorder: {
      default: true,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-show-border") !== "false",
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.showBorder === false ? { "data-show-border": "false" } : {},
    },
    running: {
      default: false,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-running") === "true",
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.running === true ? { "data-running": "true" } : {},
    },
    startedAt: {
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-started-at"),
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.startedAt ? { "data-started-at": String(attrs.startedAt) } : {},
    },
    accumulatedMs: {
      default: 0,
      parseHTML: (el: HTMLElement) => Number(el.getAttribute("data-accumulated-ms") || 0),
      renderHTML: (attrs: Record<string, unknown>) => ({
        "data-accumulated-ms": String(attrs.accumulatedMs || 0),
      }),
    },
    laps: {
      default: [],
      parseHTML: (el: HTMLElement) => parseJsonAttribute(el, "data-laps", [] as StopwatchLap[]),
      renderHTML: (attrs: Record<string, unknown>) => ({
        "data-laps": JSON.stringify(attrs.laps || []),
      }),
    },
  };
}

export const Stopwatch = Node.create({
  name: "stopwatch",
  group: "block",
  atom: true,

  addAttributes() {
    return getSharedAttributes();
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="stopwatch"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-stopwatch",
        "data-block-type": "stopwatch",
      }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "stopwatch",
      label: "Stopwatch",
      iconName: "TimerReset",
      atom: true,
      containerAttr: "showBorder",
      renderContent(node, contentDom) {
        renderStopwatchContent(node, contentDom);
      },
      updateContent(node, contentDom) {
        renderStopwatchContent(node, contentDom);
        return true;
      },
    });
  },
});

export const ServerStopwatch = Node.create({
  name: "stopwatch",
  group: "block",
  atom: true,

  addAttributes() {
    return getSharedAttributes();
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="stopwatch"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = resolveStopwatchAttrs(node.attrs as Record<string, unknown>);
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-stopwatch stopwatch-static",
        "data-block-type": "stopwatch",
        "data-show-background": attrs.showBackground ? "true" : "false",
        "data-variant": attrs.styleVariant,
        style: `--stopwatch-accent: ${attrs.accentColor};`,
      }),
      ...buildStaticStopwatchContent(attrs),
    ];
  },
});

export function getStopwatchMarkdownLines(attrs: StopwatchAttrs): string[] {
  const elapsedMs = getStopwatchElapsedMs(attrs);
  const lines: string[] = [
    `## ${attrs.title || "Stopwatch"}`,
    "",
    `Variant: ${attrs.styleVariant}`,
    `Status: ${attrs.running ? "Running" : elapsedMs > 0 ? "Paused" : "Ready"}`,
    `Elapsed: ${formatStopwatchPlainText(elapsedMs)}`,
  ];

  if (attrs.showLaps) {
    const lapRows = getStopwatchLapRows(attrs);
    lines.push("");
    lines.push("### Laps");
    if (lapRows.laps.length === 0) {
      lines.push("- No laps yet");
    } else {
      for (const lap of lapRows.laps) {
        lines.push(`- Lap ${lap.number}: ${lap.lapText} (split ${lap.splitText})`);
      }
    }
  }

  lines.push("");
  lines.push(
    `<!-- stopwatch:${JSON.stringify({
      styleVariant: attrs.styleVariant,
      accentColor: attrs.accentColor,
      showLaps: attrs.showLaps,
      running: attrs.running,
      startedAt: attrs.startedAt,
      accumulatedMs: attrs.accumulatedMs,
      laps: attrs.laps,
    })} -->`
  );

  return lines;
}

export function getStopwatchPlainText(attrs: StopwatchAttrs): string {
  const elapsedMs = getStopwatchElapsedMs(attrs);
  const lines = [
    attrs.title || "Stopwatch",
    `Variant: ${attrs.styleVariant}`,
    `Status: ${attrs.running ? "Running" : elapsedMs > 0 ? "Paused" : "Ready"}`,
    `Elapsed: ${formatStopwatchPlainText(elapsedMs)}`,
  ];

  if (attrs.showLaps && attrs.laps.length > 0) {
    const lapRows = getStopwatchLapRows(attrs);
    lines.push(
      `Laps: ${lapRows.laps
        .map((lap) => `Lap ${lap.number} ${lap.lapText} (split ${lap.splitText})`)
        .join(", ")}`
    );
  }

  return lines.join("\n");
}
