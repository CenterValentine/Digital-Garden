/**
 * Block System Type Definitions
 *
 * Core interfaces for the block extension framework.
 * Blocks are interactive TipTap node extensions with typed attributes,
 * shared chrome (drag handles, selection), and a properties panel.
 *
 * Epoch 11 Sprint 43
 */

import type { ZodObject, ZodRawShape } from "zod";
import type { ReactNode } from "react";

/** Block family determines UI grouping in the slash menu and block picker */
export type BlockFamily = "content" | "layout" | "form";

/** Block group for finer-grained organization within a family */
export type BlockGroup =
  | "text"
  | "container"
  | "divider"
  | "input"
  | "selector"
  | "display";

/**
 * Static block definition — registered once in the block registry.
 *
 * Each block type has exactly one definition that describes:
 * - Identity (type, label, description, icon)
 * - Classification (family, group)
 * - ProseMirror content model
 * - Zod schema for attrs (used for Properties Panel + AI JSON Schema)
 * - Default attribute values
 */
export interface BlockDefinition {
  /** Unique block type key (e.g., "sectionHeader", "cardPanel") */
  type: string;
  /** Human-readable label for menus */
  label: string;
  /** Brief description for tooltips and AI */
  description: string;
  /** Lucide icon name */
  iconName: string;
  /** Block family for top-level grouping */
  family: BlockFamily;
  /** Block group for sub-grouping */
  group: BlockGroup;
  /** ProseMirror content expression (e.g., "block+", "inline*", null for atoms) */
  contentModel: string | null;
  /** Whether this block is an atom (no editable content, e.g., form inputs, dividers) */
  atom: boolean;
  /** Zod schema defining the block's attributes */
  attrsSchema: ZodObject<ZodRawShape>;
  /** Default attribute values for new instances */
  defaultAttrs: Record<string, unknown>;
  /** Slash command shortcut (e.g., "/section", "/card") */
  slashCommand?: string;
  /** Search keywords for slash menu filtering */
  searchTerms?: string[];
  /** Attrs managed inline in the editor — hidden from Properties Panel sidebar */
  hiddenFields?: string[];
}

/**
 * Runtime block instance — represents a specific block node in a document.
 * Used by the Properties Panel and block selection system.
 */
export interface BlockInstance {
  /** Unique node ID (ProseMirror node position or blockId attr) */
  blockId: string;
  /** The block's type key — maps to BlockDefinition.type */
  blockType: string;
  /** Current attribute values */
  attrs: Record<string, unknown>;
}

/**
 * Properties field descriptor — auto-generated from Zod schema
 * for rendering the Properties Panel form.
 */
export interface PropertiesField {
  /** Attribute key */
  key: string;
  /** Human-readable label */
  label: string;
  /** Field type for rendering */
  fieldType:
    | "text"
    | "number"
    | "boolean"
    | "select"
    | "color"
    | "range"
    | "array"
    | "icon";
  /** Current value */
  value: unknown;
  /** For select fields: available options */
  options?: { label: string; value: string }[];
  /** For number/range fields */
  min?: number;
  max?: number;
  step?: number;
  /** Field description/tooltip */
  description?: string;
}
