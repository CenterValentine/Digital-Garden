/**
 * Properties Panel
 *
 * Right sidebar tab that shows editable properties for the currently
 * selected block. Reads block selection from block-store, looks up the
 * BlockDefinition from the registry, and auto-generates a form from
 * the Zod schema.
 *
 * Changes dispatch TipTap updateAttributes commands to the editor.
 *
 * Epoch 11 Sprint 43
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useBlockStore } from "@/state/block-store";
import { getBlockDefinition } from "@/lib/domain/blocks/registry";
import { schemaToFields } from "@/lib/domain/blocks/properties-renderer";
import type { PropertiesField, BlockDefinition } from "@/lib/domain/blocks/types";
import { Settings2 } from "lucide-react";
import { PropertyField } from "./PropertyFieldRenderer";
import { useExtensionActivationStore } from "@/state/extension-activation-store";

export function PropertiesPanel() {
  const selectedBlockId = useBlockStore((s) => s.selectedBlockId);
  const selectedBlockType = useBlockStore((s) => s.selectedBlockType);
  const workplacesEnabled = useExtensionActivationStore((state) =>
    state.isExtensionEnabled("workplaces")
  );

  const [definition, setDefinition] = useState<BlockDefinition | null>(null);
  const [fields, setFields] = useState<PropertiesField[]>([]);
  const [attrs, setAttrs] = useState<Record<string, unknown>>({});

  const filterVisibleFields = useCallback(
    (def: BlockDefinition, allFields: PropertiesField[]) => {
      let visibleFields = def.hiddenFields
        ? allFields.filter((field) => !def.hiddenFields!.includes(field.key))
        : allFields;

      if (
        (selectedBlockType === "dailySummary" ||
          selectedBlockType === "weeklySummary") &&
        !workplacesEnabled
      ) {
        visibleFields = visibleFields.filter(
          (field) => field.key !== "autoBorrowDurationMinutes"
        );
      }

      return visibleFields;
    },
    [selectedBlockType, workplacesEnabled]
  );

  // Look up block definition when selection changes
  useEffect(() => {
    if (!selectedBlockType) {
      setDefinition(null);
      setFields([]);
      setAttrs({});
      return;
    }

    const def = getBlockDefinition(selectedBlockType);
    if (!def) {
      setDefinition(null);
      setFields([]);
      return;
    }

    setDefinition(def);

    // Use default attrs as starting point; editor pushes real values via block-attrs-update.
    const currentAttrs = def.defaultAttrs;
    setAttrs(currentAttrs);
    const allFields = schemaToFields(def.attrsSchema, currentAttrs);
    setFields(filterVisibleFields(def, allFields));
  }, [selectedBlockId, selectedBlockType, filterVisibleFields]);

  // Listen for block attrs updates from the editor
  useEffect(() => {
    const handleAttrsUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.blockId === selectedBlockId && definition) {
        setAttrs(detail.attrs);
        const allFields = schemaToFields(definition.attrsSchema, detail.attrs);
        setFields(filterVisibleFields(definition, allFields));
      }
    };

    window.addEventListener("block-attrs-update", handleAttrsUpdate);
    return () =>
      window.removeEventListener("block-attrs-update", handleAttrsUpdate);
  }, [selectedBlockId, definition, filterVisibleFields]);

  // Dispatch attr change to the editor
  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      if (!selectedBlockId) return;

      const newAttrs = { ...attrs, [key]: value };
      setAttrs(newAttrs);

      if (definition) {
        const allFields = schemaToFields(definition.attrsSchema, newAttrs);
        setFields(filterVisibleFields(definition, allFields));
      }

      // Dispatch to editor via CustomEvent
      window.dispatchEvent(
        new CustomEvent("block-attrs-change", {
          detail: { blockId: selectedBlockId, key, value },
        })
      );
    },
    [selectedBlockId, attrs, definition, filterVisibleFields]
  );

  if (!selectedBlockId || !definition) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center opacity-50">
        <Settings2 className="h-8 w-8 mb-3" />
        <p className="text-sm">Select a block to view its properties</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Block type header */}
      <div className="px-4 py-3 border-b border-white/10">
        <h3 className="text-sm font-medium">{definition.label}</h3>
        <p className="text-xs opacity-50 mt-0.5">{definition.description}</p>
      </div>

      {/* Properties form */}
      <div className="px-4 py-3 space-y-4">
        {fields.map((field) => (
          <PropertyField
            key={field.key}
            field={field}
            onChange={(value) => handleFieldChange(field.key, value)}
          />
        ))}

        {fields.length === 0 && (
          <p className="text-xs opacity-40">No configurable properties</p>
        )}
      </div>
    </div>
  );
}
