/**
 * Model routing directives (AI 3.4).
 *
 * A playbook phase can declare which model should run it via a structured
 * `model:` line. The declaration is one of three kinds:
 *   - `role`     — a capability-contracted slot (model: scout)
 *   - `class`    — a vendor family, best-interpretation (model: gpt-5 series)
 *   - `explicit` — a specific provider/model (model: anthropic/claude-opus-4)
 *
 * Everything here is DETERMINISTIC and client-safe (no Prisma, no LLM). The
 * module mirrors `output-target.ts`: a directive type, a durable message part
 * so the turn's resolved route survives reload/approval continuations, and a
 * latest-user-turn reader. See AI-V3.4-MODEL-ROUTING-PLAN.md.
 */

/** The six capability-contracted role slots (also FeatureSpec ids `role-<name>`). */
export const MODEL_ROLES = [
  "scout",
  "analyst",
  "writer",
  "coder",
  "reviewer",
  "archivist",
] as const;

export type ModelRole = (typeof MODEL_ROLES)[number];

export function isModelRole(value: string): value is ModelRole {
  return (MODEL_ROLES as readonly string[]).includes(value);
}

/** The FeatureSpec id a role directive resolves through. */
export function roleFeatureId(role: ModelRole): string {
  return `role-${role}`;
}

export type ModelDirective =
  | { kind: "role"; role: ModelRole }
  | { kind: "class"; family: string }
  | { kind: "explicit"; providerId: string; modelId: string };

/** Who decided the model for a turn — surfaced in the inline switch line. */
export type ModelRouteSource =
  | "user" // pinned explicit pick — top of the ladder
  | "playbook-phase" // phase directive
  | "playbook" // standing-rules directive
  | "settings" // role/default mapping
  | "default"; // current conversation model (no routing occurred)

export interface ResolvedModelRoute {
  providerId: string;
  modelId: string;
  connectionId?: string;
  source: ModelRouteSource;
  /** Present when source is a playbook — powers "by playbook X (Phase N)". */
  playbookTitle?: string;
  phaseIndex?: number;
}

// ── directive parsing ────────────────────────────────────────────────────

const CLASS_NOISE = /\b(series|family|models?|class|tier)\b/gi;

/**
 * Parse the raw value after `model:` into a directive. Deterministic string
 * work only — returns null for anything unrecognized (caller falls through
 * the ladder). Precedence: explicit (has `/`) > role keyword > class.
 */
export function parseModelDirective(raw: string): ModelDirective | null {
  const value = raw.trim();
  if (!value) return null;

  // Explicit provider/model — the only form with a slash.
  if (value.includes("/")) {
    const slash = value.indexOf("/");
    const providerId = value.slice(0, slash).trim().toLowerCase();
    const modelId = value.slice(slash + 1).trim();
    if (!providerId || !modelId) return null;
    return { kind: "explicit", providerId, modelId };
  }

  const lower = value.toLowerCase();

  // Role keyword.
  if (isModelRole(lower)) {
    return { kind: "role", role: lower };
  }

  // OpenAI o-series is a family with an irregular name — normalize early so
  // "o-series" / "o series" both survive the generic noise strip below.
  if (/^o[\s-]?series$/.test(lower)) {
    return { kind: "class", family: "o-series" };
  }

  // Class family — strip descriptor noise ("series"/"family"/…), collapse
  // internal whitespace to hyphens so "gpt 5" and "gpt-5" agree with the
  // hyphenated model ids.
  const family = lower
    .replace(CLASS_NOISE, "")
    .trim()
    .replace(/\s+/g, "-");
  if (!family) return null;
  return { kind: "class", family };
}

// ── class matching (deterministic family resolution) ─────────────────────

/** Minimal shape the class matcher needs — a user's connected model. */
export interface RoutableModel {
  connectionId: string;
  modelId: string;
}

/** Strip a `provider/` namespace and lowercase, matching inferCapabilities. */
function normalizeModelId(modelId: string): string {
  const slash = modelId.lastIndexOf("/");
  return (slash >= 0 ? modelId.slice(slash + 1) : modelId).toLowerCase();
}

/**
 * Rank a family expression against a user's connected models. Returns the
 * matches most-specific-first — the returned list IS the fallback chain
 * (caller takes [0], keeps the rest as backups). Empty when nothing matches
 * (a class is advisory; the caller falls through the ladder).
 *
 * Ranking tiers (deterministic, table-tested):
 *   0 — normalized id equals the family exactly
 *   1 — id starts with `family-` or `family.` (a variant of the family)
 *   2 — id otherwise contains the family token
 * Within a tier: shorter id first (base model before variants), then the
 * input order (stable).
 */
export function resolveModelClass(
  family: string,
  models: RoutableModel[],
): RoutableModel[] {
  const fam = family.toLowerCase();
  const isOSeries = fam === "o-series";

  const scored: Array<{ model: RoutableModel; tier: number; index: number }> =
    [];
  models.forEach((model, index) => {
    const id = normalizeModelId(model.modelId);
    let tier = -1;
    if (isOSeries) {
      // o1 / o3 / o3-mini / o4-… — the OpenAI reasoning line.
      if (/^o[0-9]/.test(id)) tier = 0;
    } else if (id === fam) {
      tier = 0;
    } else if (id.startsWith(`${fam}-`) || id.startsWith(`${fam}.`)) {
      tier = 1;
    } else if (id.includes(fam)) {
      tier = 2;
    }
    if (tier >= 0) scored.push({ model, tier, index });
  });

  return scored
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      const lenDiff =
        normalizeModelId(a.model.modelId).length -
        normalizeModelId(b.model.modelId).length;
      if (lenDiff !== 0) return lenDiff;
      return a.index - b.index;
    })
    .map((s) => s.model);
}

// ── durable turn binding (mirror data-output-target) ─────────────────────

/**
 * The turn's resolved route, stamped onto the user message so approval
 * continuations and reloads replay the SAME model instead of re-resolving —
 * the prevention-layer-1 durability contract from the plan (§6), identical in
 * spirit to `data-output-target`.
 */
export interface ModelRouteMessagePart {
  type: "data-model-route";
  data: { route: ResolvedModelRoute };
}

export function createModelRouteMessagePart(
  route: ResolvedModelRoute,
): ModelRouteMessagePart {
  return { type: "data-model-route", data: { route } };
}

const ROUTE_SOURCES: readonly ModelRouteSource[] = [
  "user",
  "playbook-phase",
  "playbook",
  "settings",
  "default",
];

export function parseResolvedModelRoute(
  value: unknown,
): ResolvedModelRoute | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  if (typeof c.providerId !== "string" || typeof c.modelId !== "string") {
    return null;
  }
  if (
    typeof c.source !== "string" ||
    !ROUTE_SOURCES.includes(c.source as ModelRouteSource)
  ) {
    return null;
  }
  const route: ResolvedModelRoute = {
    providerId: c.providerId,
    modelId: c.modelId,
    source: c.source as ModelRouteSource,
  };
  if (typeof c.connectionId === "string") route.connectionId = c.connectionId;
  if (typeof c.playbookTitle === "string") route.playbookTitle = c.playbookTitle;
  if (typeof c.phaseIndex === "number") route.phaseIndex = c.phaseIndex;
  return route;
}

export function parseModelRouteMessagePart(
  part: unknown,
): ResolvedModelRoute | null {
  if (!part || typeof part !== "object") return null;
  const candidate = part as { type?: unknown; data?: { route?: unknown } };
  if (candidate.type !== "data-model-route") return null;
  return parseResolvedModelRoute(candidate.data?.route);
}

/**
 * Read only the latest user turn's stamped route. Falling back to an older
 * turn would make a fresh send inherit a route it never resolved (mirrors
 * getLatestUserMessageOutputTarget).
 */
export function getLatestUserMessageModelRoute(
  messages: unknown[],
): ResolvedModelRoute | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== "object") continue;
    const candidate = message as { role?: unknown; parts?: unknown };
    if (candidate.role !== "user") continue;
    if (!Array.isArray(candidate.parts)) return null;
    for (const part of candidate.parts) {
      const route = parseModelRouteMessagePart(part);
      if (route) return route;
    }
    return null;
  }
  return null;
}

// ── switch-line copy (the inline divider, not a pill) ─────────────────────

/**
 * Read the server-stamped route + fall-through notices off a message's
 * metadata (AI 3.4). Tolerant of legacy messages (no such metadata) — returns
 * a null route + empty notices, so pre-3.4 history renders no divider.
 */
export function readMessageModelRoute(metadata: unknown): {
  route: ResolvedModelRoute | null;
  notices: string[];
} {
  if (!metadata || typeof metadata !== "object") {
    return { route: null, notices: [] };
  }
  const m = metadata as { modelRoute?: unknown; modelRouteNotices?: unknown };
  const notices = Array.isArray(m.modelRouteNotices)
    ? m.modelRouteNotices.filter((n): n is string => typeof n === "string")
    : [];
  return { route: parseResolvedModelRoute(m.modelRoute), notices };
}

/** Compare two routes by executed identity (provider + model). */
export function sameModelIdentity(
  a: ResolvedModelRoute | null,
  b: ResolvedModelRoute | null,
): boolean {
  if (!a || !b) return false;
  return a.providerId === b.providerId && a.modelId === b.modelId;
}

/** Human label for who/what selected the model, for the ModelSwitchDivider. */
export function describeModelRouteSource(route: ResolvedModelRoute): string {
  switch (route.source) {
    case "user":
      return "by you";
    case "playbook-phase":
      return route.playbookTitle
        ? `by playbook "${route.playbookTitle}"${
            typeof route.phaseIndex === "number"
              ? ` (Phase ${route.phaseIndex + 1})`
              : ""
          }`
        : "by playbook";
    case "playbook":
      return route.playbookTitle
        ? `by playbook "${route.playbookTitle}"`
        : "by playbook";
    case "settings":
      return "by settings";
    case "default":
      return "";
  }
}
