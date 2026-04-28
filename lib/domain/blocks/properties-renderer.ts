/**
 * Properties Renderer
 *
 * Walks a Zod v4 schema and generates PropertiesField descriptors
 * for the Properties Panel form. Each field maps to a form control type.
 *
 * Epoch 11 Sprint 43
 */

import { z } from "zod";
import type { PropertiesField } from "./types";

type ZodCheckDef = {
  _zod?: {
    def?: {
      check?: string;
      value?: number;
    };
  };
};

type ZodInternalDef = {
  type?: string;
  innerType?: z.ZodTypeAny;
  description?: string;
  checks?: ZodCheckDef[];
  entries?: Record<string, string>;
};

type ZodInspectable = z.ZodTypeAny & {
  description?: string;
  options?: string[];
  _zod?: {
    def?: ZodInternalDef;
  };
};

/**
 * Extract renderable field descriptors from a Zod object schema.
 * Skips internal fields (blockId, blockType).
 */
export function schemaToFields(
  schema: z.ZodObject<z.ZodRawShape>,
  values: Record<string, unknown>
): PropertiesField[] {
  const shape = schema.shape;
  const fields: PropertiesField[] = [];

  for (const [key, rawDef] of Object.entries(shape)) {
    // Skip internal block fields
    if (key === "blockId" || key === "blockType") continue;

    const rawType = rawDef as z.ZodTypeAny;
    const def = unwrapZodType(rawType);
    const field = zodToField(
      key,
      def,
      values[key],
      getZodDescription(rawType) || getZodDescription(def)
    );
    if (field) {
      fields.push(field);
    }
  }

  return fields;
}

/**
 * Unwrap wrapper types (default, optional, nullable) to get the core type.
 * Zod v4 uses _zod.def.type and _zod.def.innerType.
 */
function unwrapZodType(def: z.ZodTypeAny): z.ZodTypeAny {
  const typeName = getZodTypeName(def);
  if (
    typeName === "default" ||
    typeName === "optional" ||
    typeName === "nullable"
  ) {
    const inner = (def as ZodInspectable)._zod?.def?.innerType;
    if (inner) return unwrapZodType(inner);
  }
  return def;
}

/** Get the Zod v4 type name from a type's internal def */
function getZodTypeName(def: z.ZodTypeAny): string {
  return (def as ZodInspectable)._zod?.def?.type || "";
}

function getZodDescription(def: z.ZodTypeAny): string | undefined {
  const inspectable = def as ZodInspectable;
  return inspectable.description || inspectable._zod?.def?.description;
}

/** Convert a Zod type to a PropertiesField descriptor */
function zodToField(
  key: string,
  def: z.ZodTypeAny,
  value: unknown,
  description?: string
): PropertiesField | null {
  const label = humanize(key);
  const tooltip =
    key === "openBehavior" ||
    key === "workdayCutoffHour" ||
    key === "autoBorrowDurationMinutes" ||
    key === "pathOrder" ||
    key === "templateDateMode" ||
    key === "summaryDate" ||
    key === "weekStartDate"
      ? description
      : undefined;
  const typeName = getZodTypeName(def);

  // String — detect icon fields by key name
  if (typeName === "string") {
    if (key === "icon" || key.endsWith("Icon") || key === "customIcon") {
      return { key, label, fieldType: "icon", value: value ?? "", description, tooltip };
    }
    return { key, label, fieldType: "text", value: value ?? "", description, tooltip };
  }

  // Number
  if (typeName === "number") {
    const checks = (def as ZodInspectable)._zod?.def?.checks || [];
    let min: number | undefined;
    let max: number | undefined;

    for (const check of checks) {
      const checkType = check._zod?.def?.check;
      if (checkType === "greater_than") min = check._zod?.def?.value;
      if (checkType === "less_than") max = check._zod?.def?.value;
    }

    return {
      key,
      label,
      fieldType: "number",
      value: value ?? 0,
      min,
      max,
      description,
      tooltip,
    };
  }

  // Boolean
  if (typeName === "boolean") {
    return {
      key,
      label,
      fieldType: "boolean",
      value: value ?? false,
      description,
      tooltip,
    };
  }

  // Enum (renders as select)
  if (typeName === "enum") {
    const inspectable = def as ZodInspectable;
    const entries = inspectable._zod?.def?.entries;
    const optionValues = entries
      ? Object.values(entries) as string[]
      : inspectable.options || [];
    const options = optionValues.map((v: string) => ({
      label: humanize(v),
      value: v,
    }));
    return {
      key,
      label,
      fieldType: "select",
      value: value ?? options[0]?.value,
      options,
      description,
      tooltip,
    };
  }

  // Array
  if (typeName === "array") {
    return {
      key,
      label,
      fieldType: "array",
      value: value ?? [],
      description,
      tooltip,
    };
  }

  // Fallback: render as text
  return { key, label, fieldType: "text", value: value ?? "", description, tooltip };
}

/** Convert camelCase to "Camel Case" */
function humanize(key: string): string {
  if (key === "showContainer" || key === "showBorder") return "Border";
  if (key === "openBehavior") return "Expand/Collapse Default";
  if (key === "summaryDate") return "Date";
  if (key === "weekStartDate") return "Week Start";
  if (key === "templateDateMode") return "Template Date";
  if (key === "workdayCutoffHour") return "Day Cutoff";
  if (key === "autoBorrowDurationMinutes") return "Auto-borrow Duration";
  if (key === "pathOrder") return "Path Order";
  if (key === "showBackground") return "Background";
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
