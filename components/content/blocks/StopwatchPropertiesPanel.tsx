"use client";

import { useEffect, useMemo, useState } from "react";
import { Settings2 } from "lucide-react";

import { useBlockStore } from "@/state/block-store";
import {
  createDefaultStopwatchAttrs,
  normalizeStopwatchAttrs,
  type StopwatchAttrs,
  type StopwatchStyleVariant,
} from "@/lib/domain/stopwatch";

const STYLE_OPTIONS: Array<{ value: StopwatchStyleVariant; label: string }> = [
  { value: "ios", label: "iPhone" },
  { value: "minimal", label: "Minimal" },
  { value: "panel", label: "Panel" },
];

function dispatchAttrChange(blockId: string, key: string, value: unknown) {
  window.dispatchEvent(
    new CustomEvent("block-attrs-change", {
      detail: { blockId, key, value },
    })
  );
}

function panelInputClassName() {
  return "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none";
}

function SectionLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function StopwatchPropertiesPanel() {
  const selectedBlockId = useBlockStore((state) => state.selectedBlockId);
  const selectedBlockType = useBlockStore((state) => state.selectedBlockType);
  const initialAttrs = useMemo(() => createDefaultStopwatchAttrs(), []);
  const [attrs, setAttrs] = useState<StopwatchAttrs>(initialAttrs);

  useEffect(() => {
    if (selectedBlockType !== "stopwatch") {
      setAttrs(initialAttrs);
    }
  }, [initialAttrs, selectedBlockType]);

  useEffect(() => {
    const handleAttrsUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        blockId?: string;
        attrs?: StopwatchAttrs;
      };
      if (detail.blockId !== selectedBlockId || !detail.attrs) return;
      setAttrs(
        normalizeStopwatchAttrs(detail.attrs as unknown as Record<string, unknown>)
      );
    };

    window.addEventListener("block-attrs-update", handleAttrsUpdate);
    return () => {
      window.removeEventListener("block-attrs-update", handleAttrsUpdate);
    };
  }, [selectedBlockId]);

  if (!selectedBlockId || selectedBlockType !== "stopwatch") {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center opacity-50">
        <Settings2 className="mb-3 h-8 w-8" />
        <p className="text-sm">Select a stopwatch to edit its settings</p>
      </div>
    );
  }

  const updateAttr = <K extends keyof StopwatchAttrs>(key: K, value: StopwatchAttrs[K]) => {
    setAttrs((current) => ({ ...current, [key]: value }));
    dispatchAttrChange(selectedBlockId, key as string, value);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-medium">Stopwatch</h3>
        <p className="mt-0.5 text-xs opacity-50">Persisted stopwatch with laps and style variants</p>
      </div>

      <div className="space-y-4 px-4 py-4">
        <SectionLabel label="Title">
          <input
            className={panelInputClassName()}
            type="text"
            value={attrs.title}
            onChange={(event) => updateAttr("title", event.target.value)}
          />
        </SectionLabel>

        <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-3">
          <SectionLabel label="Style">
            <select
              className={panelInputClassName()}
              value={attrs.styleVariant}
              onChange={(event) =>
                updateAttr("styleVariant", event.target.value as StopwatchStyleVariant)
              }
            >
              {STYLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </SectionLabel>

          <SectionLabel label="Accent">
            <input
              className="h-9 w-full cursor-pointer appearance-none rounded-md border border-slate-300 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-md [&::-moz-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-md"
              type="color"
              value={attrs.accentColor}
              onChange={(event) => updateAttr("accentColor", event.target.value)}
            />
          </SectionLabel>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Display
          </div>
          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                checked={attrs.showLaps}
                type="checkbox"
                onChange={(event) => updateAttr("showLaps", event.target.checked)}
              />
              Show laps
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                checked={attrs.showBackground}
                type="checkbox"
                onChange={(event) => updateAttr("showBackground", event.target.checked)}
              />
              Show background
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                checked={attrs.showBorder}
                type="checkbox"
                onChange={(event) => updateAttr("showBorder", event.target.checked)}
              />
              Show border
            </label>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <div>Status: {attrs.running ? "Running" : attrs.accumulatedMs > 0 ? "Paused" : "Ready"}</div>
          <div className="mt-1">
            Start, stop, reset, and lap actions are saved through block attributes so the stopwatch
            resumes from its recorded start time.
          </div>
        </div>
      </div>
    </div>
  );
}
