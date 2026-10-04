/**
 * A browser-ish `window` for the workspace harnesses, installed as an IMPORT
 * SIDE EFFECT — import it FIRST.
 *
 * The workspace store registers a subscriber at module load, only `if (typeof
 * window !== "undefined")`: the one that clears pending open/close intents when
 * the active workspace changes. ES imports are hoisted above a script's own
 * statements, so a shim defined in the script body arrives too late and that
 * subscriber silently never exists in Node — stale intents then survive a
 * switch and re-add tabs that the real app would have dropped. Evaluating this
 * module before the stores are imported puts the harness on the same wiring as
 * the browser.
 *
 * The URL is mutable: `syncWorkspaceUrl` and the content store both rewrite it,
 * and `restoreContentWorkspace` reads `?content=` back from it.
 */

const storage = new Map<string, string>();
export const memoryStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
};

let href = "http://localhost/content";
export const setHref = (next: string) => {
  href = next;
};
export const getHref = () => href;

(globalThis as { window?: unknown }).window = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  get location() {
    const u = new URL(href);
    return { pathname: u.pathname, href, search: u.search };
  },
  history: {
    replaceState: (_state: unknown, _title: unknown, url: URL | string) => {
      href = String(url);
    },
  },
  innerWidth: 1440,
  innerHeight: 900,
  addEventListener: () => undefined,
  localStorage: memoryStorage,
};
// Node 25's built-in localStorage is inert without --localstorage-file.
Object.defineProperty(globalThis, "localStorage", { value: memoryStorage, configurable: true });
// Without `onLine`, persist treats the surface as offline and never writes.
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
