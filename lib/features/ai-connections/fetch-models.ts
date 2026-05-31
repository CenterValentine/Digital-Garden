/**
 * Fetch the live "available models" list from a Connection's upstream.
 *
 * Most chat providers (OpenAI, xAI, Mistral, Groq, Fireworks, Together)
 * and gateways (Vercel AI Gateway, OpenRouter) expose an OpenAI-shaped
 * `GET /v1/models` endpoint that returns:
 *
 *   { object: "list", data: [{ id: string, ... }, ...] }
 *
 * We resolve the right base URL per adapterKind, hit the endpoint with
 * the Connection's decrypted key, and return a normalized
 * `Array<{ id, name }>` the UI can render directly.
 *
 * Adapters that don't fit the OpenAI shape (Anthropic, Google) are
 * deliberately out of scope for v1 — they have their own list formats
 * we can plug in as follow-ups. The Connection template's
 * `supportsModelFetch` flag gates the UI button so users only see the
 * action when an implementation exists.
 */

import { IMAGE_PROVIDER_CATALOG } from "@/lib/domain/ai/image/catalog";
import type { ConnectionWithKey } from "./types";

export interface FetchedModel {
  id: string;
  name: string;
  /**
   * Free-form metadata returned by the upstream (created date, context
   * window, owner, etc.) — kept opaque here. Callers can render it as
   * a tooltip; we don't pretend to normalize it across providers.
   */
  raw?: Record<string, unknown>;
  /**
   * Optional capability hints. When present, the UI uses these when
   * persisting the model into `Connection.models[]` instead of the
   * generic default. Currently set on catalog-augmented image models
   * so feature routing can discover them as compatible pairs.
   */
  capabilities?: string[];
}

export class ModelFetchError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ModelFetchError";
  }
}

/**
 * Per-adapter request plan: URL + auth flavor + response shape.
 * Returns null for adapters we don't support so callers can short-circuit.
 *
 * Three auth flavors we have to handle:
 *   - `bearer`     — `Authorization: Bearer <key>` (OpenAI shape)
 *   - `x-api-key`  — Anthropic uses an `x-api-key` header + an
 *                    `anthropic-version` header
 *   - `query`      — Google appends `?key=<key>` to the URL
 *
 * Two response shapes we have to handle:
 *   - `openai`     — `{ data: [{ id, ... }] }` or bare `[ ... ]`
 *   - `google`     — `{ models: [{ name: "models/<id>", displayName, ... }] }`
 *                    The `models/` prefix has to be stripped from `name`
 *                    to produce a usable model id.
 */
type AuthFlavor = "bearer" | "x-api-key" | "query";
type ResponseShape = "openai" | "google";

interface AdapterPlan {
  url: string;
  auth: AuthFlavor;
  shape: ResponseShape;
  /** Extra headers required by the upstream (e.g. anthropic-version). */
  extraHeaders?: Record<string, string>;
}

function planForAdapter(
  adapterKind: string,
  baseURL: string | null,
): AdapterPlan | null {
  if (adapterKind === "openai-compat") {
    if (!baseURL) return null;
    return { url: joinUrl(baseURL, "/models"), auth: "bearer", shape: "openai" };
  }
  if (adapterKind === "openai") {
    return { url: "https://api.openai.com/v1/models", auth: "bearer", shape: "openai" };
  }
  if (adapterKind === "xai") {
    return { url: "https://api.x.ai/v1/models", auth: "bearer", shape: "openai" };
  }
  if (adapterKind === "mistral") {
    return { url: "https://api.mistral.ai/v1/models", auth: "bearer", shape: "openai" };
  }
  if (adapterKind === "groq") {
    return { url: "https://api.groq.com/openai/v1/models", auth: "bearer", shape: "openai" };
  }
  if (adapterKind === "vercel-gateway") {
    return { url: "https://ai-gateway.vercel.sh/v1/models", auth: "bearer", shape: "openai" };
  }
  if (adapterKind === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/models",
      auth: "x-api-key",
      shape: "openai",
      extraHeaders: { "anthropic-version": "2023-06-01" },
    };
  }
  if (adapterKind === "google") {
    // Key is appended at fetch time; just declare auth=query so the
    // request builder knows not to add a header.
    return {
      url: "https://generativelanguage.googleapis.com/v1beta/models",
      auth: "query",
      shape: "google",
    };
  }
  return null;
}

/** Concatenate base + path without double-slashes or missing slashes. */
function joinUrl(base: string, path: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/** Pull a friendly display name from upstream metadata when present. */
function inferName(id: string, raw: unknown): string {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (typeof r.name === "string" && r.name.length > 0) return r.name;
    if (typeof r.display_name === "string" && r.display_name.length > 0)
      return r.display_name;
  }
  return id;
}

/**
 * Fetch and normalize the upstream models list.
 *
 * Throws `ModelFetchError` on any failure (network, auth, malformed
 * response). Callers should catch and surface to the UI.
 */
export async function fetchUpstreamModels(
  conn: ConnectionWithKey,
): Promise<FetchedModel[]> {
  const plan = planForAdapter(conn.adapterKind, conn.baseURL);
  if (!plan) {
    throw new ModelFetchError(
      `No model-list endpoint configured for adapter "${conn.adapterKind}".`,
    );
  }

  // Build request URL + headers per the adapter plan.
  let finalUrl = plan.url;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(plan.extraHeaders ?? {}),
  };
  if (plan.auth === "bearer") {
    headers.Authorization = `Bearer ${conn.apiKey}`;
  } else if (plan.auth === "x-api-key") {
    headers["x-api-key"] = conn.apiKey;
  } else if (plan.auth === "query") {
    const sep = plan.url.includes("?") ? "&" : "?";
    finalUrl = `${plan.url}${sep}key=${encodeURIComponent(conn.apiKey)}`;
  }

  let response: Response;
  try {
    response = await fetch(finalUrl, { method: "GET", headers });
  } catch (e) {
    throw new ModelFetchError(
      e instanceof Error ? `Network error: ${e.message}` : "Network error",
    );
  }

  if (!response.ok) {
    let body: string;
    try {
      body = await response.text();
    } catch {
      body = `(no body)`;
    }
    throw new ModelFetchError(
      `Upstream returned ${response.status}: ${body.slice(0, 200)}`,
      response.status,
    );
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (e) {
    throw new ModelFetchError(
      e instanceof Error ? `Malformed JSON: ${e.message}` : "Malformed JSON",
    );
  }

  const items =
    plan.shape === "google"
      ? extractGoogleList(parsed)
      : extractOpenAIList(parsed);
  if (items === null) {
    throw new ModelFetchError(
      "Upstream response shape not recognized.",
    );
  }

  // Augment with known image-gen models from the static catalog.
  // Provider `/v1/models` endpoints historically don't list image
  // models (OpenAI keeps them under `/v1/images/generations`, Google
  // under a separate Vertex/Generative-Language surface), so users
  // can't pick DALL·E or Imagen through the fetch flow alone. We fold
  // them in here with a `capabilities: ["image-generation"]` hint so
  // feature routing can find them as compatible pairs once the user
  // adds them.
  const existing = new Set(items.map((i) => i.id));
  for (const aug of catalogImageModelsFor(conn.adapterKind)) {
    if (!existing.has(aug.id)) items.push(aug);
  }

  items.sort((a, b) => a.id.localeCompare(b.id));
  return items;
}

/**
 * Return image-gen model entries from `IMAGE_PROVIDER_CATALOG` for
 * this Connection's adapter, normalized to `FetchedModel` with
 * `image-generation` capability set.
 *
 * Two patterns:
 *
 *   1. **Direct adapter** (openai, google, together, fireworks): the
 *      Connection's models[] holds bare ids like `dall-e-3`. The chat
 *      route's direct-match resolver routes by Connection.presetId.
 *
 *   2. **Gateway adapter** (vercel-gateway): the Connection's models[]
 *      holds namespaced ids like `openai/dall-e-3`. The chat route's
 *      namespaced-fallback resolver routes by the prefix. Vercel AI
 *      Gateway proxies image generation for several labs, so we emit
 *      the cartesian: every catalog provider's models, each prefixed
 *      with the provider id.
 *
 * Returns empty for adapters with no image-gen surface (xai, mistral,
 * groq, openai-compat, openrouter).
 */
function catalogImageModelsFor(adapterKind: string): FetchedModel[] {
  // Direct: 1:1 mapping from adapter → image catalog provider id.
  const adapterToCatalog: Record<string, string> = {
    openai: "openai",
    google: "google",
    together: "together",
    fireworks: "fireworks",
  };
  const catalogId = adapterToCatalog[adapterKind];
  if (catalogId) {
    const provider = IMAGE_PROVIDER_CATALOG.find((p) => p.id === catalogId);
    if (!provider) return [];
    return provider.models.map((m) => ({
      id: m.id,
      name: m.name,
      capabilities: ["image-generation"],
    }));
  }

  // Vercel AI Gateway: its image-model catalog is curated and does NOT
  // simply mirror OpenAI's direct list. DALL·E 3 is not proxied (you
  // get gpt-image-1 instead); Google offers Imagen 4 (not Imagen 3);
  // and the gateway adds BFL FLUX, Recraft, Bytedance Seedream, and
  // xAI grok-imagine alongside.
  //
  // The ids below come from `@ai-sdk/gateway`'s `GatewayImageModelId`
  // type (introspected 2026-05-30). Update when the SDK ships an
  // updated catalog. Emitting bogus ids breaks generation downstream
  // because the gateway returns "Model not found" — so we only ship
  // ids the gateway is known to accept.
  if (adapterKind === "vercel-gateway") {
    const VERCEL_GATEWAY_IMAGE_MODELS: Array<{ id: string; name: string }> = [
      // Classical image API (POST /v1/images/generations)
      { id: "openai/gpt-image-1", name: "GPT Image 1" },
      { id: "openai/gpt-image-1-mini", name: "GPT Image 1 Mini" },
      { id: "google/imagen-4.0-generate-001", name: "Imagen 4" },
      { id: "google/imagen-4.0-fast-generate-001", name: "Imagen 4 Fast" },
      { id: "google/imagen-4.0-ultra-generate-001", name: "Imagen 4 Ultra" },
      { id: "bfl/flux-2-pro", name: "FLUX 2 Pro" },
      { id: "bfl/flux-2-max", name: "FLUX 2 Max" },
      { id: "bfl/flux-pro-1.1", name: "FLUX Pro 1.1" },
      { id: "bfl/flux-pro-1.1-ultra", name: "FLUX Pro 1.1 Ultra" },
      { id: "bytedance/seedream-4.0", name: "Seedream 4.0" },
      { id: "recraft/recraft-v3", name: "Recraft v3" },
      { id: "xai/grok-imagine-image", name: "Grok Imagine" },
      // Language-as-image: gateway classifies these as language models
      // but they emit image binaries via /v1/chat/completions. Route
      // dispatches to `generateText` + `result.files` for these.
      { id: "google/gemini-2.5-flash-image", name: "Nano Banana (Gemini 2.5 Flash Image)" },
      { id: "google/gemini-3-pro-image", name: "Nano Banana Pro (Gemini 3 Pro Image)" },
      { id: "google/gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Image (Preview)" },
    ];
    return VERCEL_GATEWAY_IMAGE_MODELS.map((m) => ({
      ...m,
      capabilities: ["image-generation"],
    }));
  }

  return [];
}

/** Parse OpenAI-shaped responses: `{ data: [...] }` or bare `[...]`. */
function extractOpenAIList(parsed: unknown): FetchedModel[] | null {
  let rawList: unknown[];
  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { data?: unknown }).data)
  ) {
    rawList = (parsed as { data: unknown[] }).data;
  } else {
    return null;
  }
  const out: FetchedModel[] = [];
  for (const entry of rawList) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const id =
      typeof e.id === "string"
        ? e.id
        : typeof e.name === "string"
          ? e.name
          : null;
    if (!id) continue;
    out.push({ id, name: inferName(id, e), raw: e });
  }
  return out;
}

/**
 * Parse Google's Gemini-shaped responses:
 *   `{ models: [{ name: "models/gemini-2.5-pro", displayName, ... }] }`
 *
 * Strip the `models/` prefix from `name` because that's the upstream
 * identifier our request body will eventually carry — it's also what
 * Vercel Gateway and other downstream consumers accept.
 */
function extractGoogleList(parsed: unknown): FetchedModel[] | null {
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as { models?: unknown }).models)
  ) {
    return null;
  }
  const list = (parsed as { models: unknown[] }).models;
  const out: FetchedModel[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const rawName = typeof e.name === "string" ? e.name : null;
    if (!rawName) continue;
    const id = rawName.startsWith("models/") ? rawName.slice(7) : rawName;
    const displayName =
      typeof e.displayName === "string" && e.displayName.length > 0
        ? e.displayName
        : id;
    out.push({ id, name: displayName, raw: e });
  }
  return out;
}
