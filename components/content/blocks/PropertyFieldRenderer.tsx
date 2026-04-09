/**
 * PropertyFieldRenderer
 *
 * Shared form field component used by both:
 * - PropertiesPanel (in-editor block properties tab)
 * - BlockBuilderProperties (builder modal properties panel)
 *
 * Extracted from PropertiesPanel.tsx in Sprint 44b.
 * Updated Sprint 44b: icon selector integration.
 */

"use client";

import { useState, useRef } from "react";
import { Info } from "lucide-react";
import type { PropertiesField } from "@/lib/domain/blocks/types";
import { IconSelector } from "@/components/content/IconSelector";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/client/ui/tooltip";

/** Renders a single property field based on its fieldType */
export function PropertyField({
  field,
  onChange,
}: {
  field: PropertiesField;
  onChange: (value: unknown) => void;
}) {
  const [iconSelectorOpen, setIconSelectorOpen] = useState(false);
  const [iconTriggerPos, setIconTriggerPos] = useState({ x: 0, y: 0 });
  const iconBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <label className="text-xs font-medium text-gray-400">{field.label}</label>
        {field.tooltip ? (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-gray-500 transition-colors hover:text-gray-300"
                  aria-label={`${field.label} help`}
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-56 text-xs leading-relaxed">
                {field.tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>

      {field.fieldType === "text" && (
        <input
          type="text"
          value={(field.value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1.5 text-sm rounded-md bg-white/8 border border-white/15 text-gray-200 placeholder:text-gray-600 focus:border-blue-500/50 focus:outline-none"
          placeholder={field.description}
        />
      )}

      {field.fieldType === "number" && (
        <input
          type="number"
          value={(field.value as number) ?? 0}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full px-2 py-1.5 text-sm rounded-md bg-white/8 border border-white/15 text-gray-200 focus:border-blue-500/50 focus:outline-none"
        />
      )}

      {field.fieldType === "boolean" && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!field.value}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded"
          />
          <span className="text-xs text-gray-400">
            {field.description || field.label}
          </span>
        </label>
      )}

      {field.fieldType === "select" && field.options && (
        <select
          value={(field.value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1.5 text-sm rounded-md bg-white/8 border border-white/15 text-gray-200 focus:border-blue-500/50 focus:outline-none"
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {field.fieldType === "icon" && (
        <>
          <button
            ref={iconBtnRef}
            type="button"
            onClick={() => {
              if (iconBtnRef.current) {
                const rect = iconBtnRef.current.getBoundingClientRect();
                setIconTriggerPos({ x: rect.left, y: rect.bottom + 4 });
              }
              setIconSelectorOpen(true);
            }}
            className="w-full px-2 py-1.5 text-sm rounded-md bg-white/8 border border-white/15 text-gray-200 hover:border-blue-500/50 focus:outline-none text-left flex items-center gap-2"
          >
            {field.value ? (
              <span className="truncate">{String(field.value)}</span>
            ) : (
              <span className="text-gray-500">Choose icon...</span>
            )}
          </button>
          <IconSelector
            isOpen={iconSelectorOpen}
            onClose={() => setIconSelectorOpen(false)}
            onSelectIcon={(icon) => onChange(icon)}
            currentIcon={(field.value as string) || null}
            triggerPosition={iconTriggerPos}
          />
        </>
      )}

      {field.fieldType === "array" && (
        <textarea
          value={
            Array.isArray(field.value)
              ? (field.value as string[]).join("\n")
              : ""
          }
          onChange={(e) =>
            onChange(
              e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
          rows={3}
          className="w-full px-2 py-1.5 text-sm rounded-md bg-white/8 border border-white/15 text-gray-200 placeholder:text-gray-600 focus:border-blue-500/50 focus:outline-none font-mono"
          placeholder="One item per line"
        />
      )}
    </div>
  );
}
