/**
 * Template interpolation — CLIENT-SAFE and pure. Interpolated config fields
 * reference upstream values as {{input.path}} or {{nodeId.path}} (dot paths,
 * e.g. {{research.json.score}}). Unresolvable paths become empty strings —
 * the interpreter records a warning event rather than failing the run.
 */

const TEMPLATE_PATTERN = /\{\{\s*([a-zA-Z0-9_$.-]+)\s*\}\}/g;

export interface InterpolationScope {
  input: Record<string, unknown>;
  nodes: Record<string, Record<string, unknown>>;
}

export function resolvePath(
  scope: InterpolationScope,
  path: string
): unknown {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) return undefined;
  const [head, ...rest] = segments;
  let current: unknown =
    head === "input" ? scope.input : scope.nodes[head];
  for (const segment of rest) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function renderValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function interpolateString(
  template: string,
  scope: InterpolationScope,
  onMissing?: (path: string) => void
): string {
  return template.replace(TEMPLATE_PATTERN, (_match, path: string) => {
    const value = resolvePath(scope, path);
    if (value === undefined) onMissing?.(path);
    return renderValue(value);
  });
}

/** Interpolate every string field in a config (recursively through plain objects/arrays). */
export function interpolateConfig(
  config: Record<string, unknown>,
  scope: InterpolationScope,
  onMissing?: (path: string) => void
): Record<string, unknown> {
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") {
      return interpolateString(value, scope, onMissing);
    }
    if (Array.isArray(value)) return value.map(walk);
    if (typeof value === "object" && value !== null) {
      const out: Record<string, unknown> = {};
      for (const [key, inner] of Object.entries(value)) out[key] = walk(inner);
      return out;
    }
    return value;
  };
  return walk(config) as Record<string, unknown>;
}
