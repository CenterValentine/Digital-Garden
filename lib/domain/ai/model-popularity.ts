/**
 * Model "Suggested" ordering (owner request 2026-07-17).
 *
 * No gateway exposes real popularity via API (Vercel's ranking lives on
 * their website only), so this is an explicit, maintainable prior that
 * works for EVERY gateway and offline: flagship vendors first, flagship
 * families within a vendor, then recency (version token → date stamp),
 * then name. Client-safe — no Prisma, no server deps.
 *
 * Honest naming: this is "Suggested", not measured popularity. Update the
 * priors as the market moves; they are deliberately coarse (ties fall
 * through to recency, which needs no maintenance).
 */

const VENDOR_PRIOR: Record<string, number> = {
  anthropic: 100,
  openai: 95,
  google: 90,
  xai: 85,
  "x-ai": 85,
  "meta-llama": 75,
  meta: 75,
  deepseek: 72,
  mistral: 70,
  mistralai: 70,
  perplexity: 68,
  moonshotai: 66, // Kimi — post-V3 P0 candidate
  qwen: 60,
  alibaba: 60,
  amazon: 55,
  cohere: 55,
};

const FAMILY_BOOSTS: ReadonlyArray<[RegExp, number]> = [
  [/claude/, 20],
  [/\bgpt/, 18],
  [/gemini/, 16],
  [/\bo\d(\b|-)/, 14], // o1/o3/o4 reasoning family
  [/grok/, 14],
  [/kimi/, 12],
  [/llama/, 10],
  [/deepseek-(r|v)/, 9],
  [/mistral-large|mixtral/, 8],
  [/opus/, 6],
  [/sonnet/, 5],
  [/pro\b/, 4],
  [/haiku|flash|mini/, 3],
  // Sinks: fine-tune bases and embeddings aren't chat picks.
  [/embed|whisper|tts|dall-e|guard|rerank/, -25],
];

function vendorOf(id: string): string {
  const slash = id.indexOf("/");
  return slash > 0 ? id.slice(0, slash).toLowerCase() : "";
}

function vendorPrior(id: string): number {
  return VENDOR_PRIOR[vendorOf(id)] ?? 30;
}

function familyPrior(text: string): number {
  let score = 0;
  for (const [re, boost] of FAMILY_BOOSTS) {
    if (re.test(text)) score += boost;
  }
  return score;
}

/** Largest version-like numeric token (< 100) in the text. */
export function modelVersionScore(text: string): number {
  let best = 0;
  for (const m of text.toLowerCase().matchAll(/(\d+(?:[.-]\d+)?)/g)) {
    const v = parseFloat(m[1].replace("-", "."));
    if (v > 0 && v < 100) best = Math.max(best, v);
  }
  return best;
}

/** 8-digit date stamp (20250514) when present. */
export function modelDateScore(text: string): number {
  const m = text.match(/20\d{6}/);
  return m ? parseInt(m[0], 10) : 0;
}

export interface ModelLike {
  id: string;
  name: string;
}

/** Newer floats, older sinks — version token, then date stamp, then name. */
export function compareModelRecency(a: ModelLike, b: ModelLike): number {
  const at = `${a.id} ${a.name}`;
  const bt = `${b.id} ${b.name}`;
  const version = modelVersionScore(bt) - modelVersionScore(at);
  if (version !== 0) return version;
  const date = modelDateScore(bt) - modelDateScore(at);
  if (date !== 0) return date;
  return a.name.localeCompare(b.name);
}

/**
 * Suggested ordering: vendor prior → family prior → recency. Designed for
 * gateway lists with hundreds of entries — the models a user most likely
 * wants are on the first screen instead of alphabetically under
 * "alibaba/".
 */
export function compareModelsBySuggested(a: ModelLike, b: ModelLike): number {
  const vendor = vendorPrior(b.id) - vendorPrior(a.id);
  if (vendor !== 0) return vendor;
  const at = `${a.id} ${a.name}`.toLowerCase();
  const bt = `${b.id} ${b.name}`.toLowerCase();
  const family = familyPrior(bt) - familyPrior(at);
  if (family !== 0) return family;
  return compareModelRecency(a, b);
}
