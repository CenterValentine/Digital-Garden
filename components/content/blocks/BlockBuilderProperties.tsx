/**
 * BlockBuilderProperties
 *
 * Right panel of the block builder modal.
 * Shows editable properties for the selected canvas node.
 * Reuses PropertyFieldRenderer for form controls.
 *
 * Epoch 11 Sprint 44b
 */

"use client";

import { useMemo } from "react";
import { useBlockBuilderStore } from "@/state/block-builder-store";
import { getBlockDefinition } from "@/lib/domain/blocks/registry";
import { schemaToFields } from "@/lib/domain/blocks/properties-renderer";
import { findNode } from "@/lib/domain/blocks/builder-tree";
import { PropertyField } from "./PropertyFieldRenderer";
import { Settings2 } from "lucide-react";

export function BlockBuilderProperties() {
  const nodes = useBlockBuilderStore((s) => s.nodes);
  const selectedNodeId = useBlockBuilderStore((s) => s.selectedNodeId);
  const updateAttrs = useBlockBuilderStore((s) => s.updateAttrs);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    const lookup = findNode(nodes, selectedNodeId);
    return lookup?.node ?? null;
  }, [nodes, selectedNodeId]);

  const definition = useMemo(() => {
    if (!selectedNode) return null;
    return getBlockDefinition(selectedNode.blockType) ?? null;
  }, [selectedNode]);

  const fields = useMemo(() => {
    if (!definition || !selectedNode) return [];
    return schemaToFields(definition.attrsSchema, selectedNode.attrs);
  }, [definition, selectedNode]);

  if (!selectedNode || !definition) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center text-gray-500">
        <Settings2 className="h-6 w-6 mb-2 text-gray-600" />
        <p className="text-xs">Select a part to edit its properties</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2.5 border-b border-white/10">
        <h4 className="text-xs font-medium text-gray-200">{definition.label}</h4>
        <p className="text-[10px] text-gray-500 mt-0.5">
          {definition.description}
        </p>
      </div>

      <div className="px-3 py-3 space-y-3">
        {fields.map((field) => (
          <PropertyField
            key={field.key}
            field={field}
            onChange={(value) => {
              if (selectedNodeId) {
                updateAttrs(selectedNodeId, { [field.key]: value });
              }
            }}
          />
        ))}

        {fields.length === 0 && (
          <p className="text-[10px] text-gray-600">No configurable properties</p>
        )}
      </div>
    </div>
  );
}
