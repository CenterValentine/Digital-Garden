// ── URL Strategy Preset System ─────────────────────────────────────────────
// Transforms page URLs before note association lookups, so that e.g.
// github.com/owner/repo/issues/1 and github.com/owner/repo/pulls/2 both
// resolve to the same note (path-depth:2 → github.com/owner/repo).
//
// Strategies (defined in url-presets.json):
//   exact      — full URL, hash stripped, ports normalized (default)
//   path       — strip all query params, keep full path
//   path-depth — keep only first N path segments
//   params     — strip all params except a named whitelist (e.g. YouTube v=)
//   domain     — only the hostname (all pages → one note)
//   ignore     — returns null; overlay should skip fetching for this domain

const STRATEGY_OVERRIDES_KEY = "dgUrlStrategyOverrides";

let _presetCache = null; // { presetMap, overrides } — loaded once per SW/content-script lifetime

export async function loadUrlPresets() {
  if (_presetCache) return _presetCache;
  try {
    const url = chrome.runtime.getURL("url-presets.json");
    const resp = await fetch(url);
    const data = await resp.json();
    const presetMap = {};
    for (const preset of data.presets || []) {
      for (const host of preset.hosts || []) {
        presetMap[host] = preset;
      }
    }
    const overridesResult = await chrome.storage.local.get(STRATEGY_OVERRIDES_KEY);
    const overrides = overridesResult[STRATEGY_OVERRIDES_KEY] || {};
    _presetCache = { presetMap, overrides };
    return _presetCache;
  } catch {
    _presetCache = { presetMap: {}, overrides: {} };
    return _presetCache;
  }
}

// Invalidate the in-memory cache (call after saving a user override).
export function invalidatePresetCache() {
  _presetCache = null;
}

export function resolvePreset(url, presetMap, overrides = {}) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    // User overrides take precedence over presets
    if (overrides[hostname]) return overrides[hostname];
    if (presetMap[hostname]) return presetMap[hostname];
    // Try parent domain (e.g. docs.stripe.com → stripe.com)
    const parts = hostname.split(".");
    if (parts.length > 2) {
      const parent = parts.slice(-2).join(".");
      if (overrides[parent]) return overrides[parent];
      if (presetMap[parent]) return presetMap[parent];
    }
    return null;
  } catch {
    return null;
  }
}

export function applyUrlStrategy(url, preset) {
  try {
    const parsed = new URL(url);
    // Baseline normalization always applied regardless of strategy
    parsed.hash = "";
    if ((parsed.protocol === "https:" && parsed.port === "443") ||
        (parsed.protocol === "http:" && parsed.port === "80")) {
      parsed.port = "";
    }
    const strategy = preset?.strategy ?? "exact";
    switch (strategy) {
      case "ignore":
        return null;
      case "domain":
        return `${parsed.protocol}//${parsed.hostname}`;
      case "path": {
        parsed.search = "";
        parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
        return parsed.toString();
      }
      case "path-depth": {
        const depth = preset.depth ?? 1;
        const segments = parsed.pathname.split("/").filter(Boolean);
        parsed.pathname = segments.length
          ? "/" + segments.slice(0, depth).join("/")
          : "/";
        parsed.search = "";
        return parsed.toString();
      }
      case "params": {
        const keep = new Set(preset.keepParams || []);
        const next = new URLSearchParams();
        for (const [k, v] of parsed.searchParams) {
          if (keep.has(k)) next.set(k, v);
        }
        parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
        parsed.search = next.toString() ? `?${next.toString()}` : "";
        return parsed.toString();
      }
      case "exact":
      default: {
        parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
        return parsed.toString();
      }
    }
  } catch {
    return String(url || "").trim();
  }
}

export async function getStrategyOverrides() {
  const result = await chrome.storage.local.get(STRATEGY_OVERRIDES_KEY);
  return result[STRATEGY_OVERRIDES_KEY] || {};
}

export async function setStrategyOverride(hostname, config) {
  const current = await getStrategyOverrides();
  if (config === null) {
    delete current[hostname];
  } else {
    current[hostname] = config;
  }
  await chrome.storage.local.set({ [STRATEGY_OVERRIDES_KEY]: current });
  invalidatePresetCache();
  return current;
}
