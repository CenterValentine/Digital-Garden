import { BrowserWindow, nativeTheme } from "electron";
import { join } from "node:path";
import { SESSION_PARTITION, getAppOrigin, getAppUrl } from "../shared/config";

/**
 * webPreferences shared by every window that hosts app content.
 * contextIsolation + sandbox + no nodeIntegration: the renderer is remote
 * content and gets nothing beyond the preload's narrow bridge (plan §Security).
 */
export function appWebPreferences(): Electron.WebPreferences {
  return {
    partition: SESSION_PARTITION,
    preload: join(__dirname, "../preload/index.js"),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    spellcheck: true,
    // The preload has no Node `require` under sandbox; it learns the trusted
    // origin from argv and exposes the bridge only to that origin.
    additionalArguments: [`--dg-app-origin=${getAppOrigin()}`],
  };
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 880,
    minHeight: 560,
    show: false,
    // Avoid a white flash before the app paints in dark mode.
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0f1115" : "#ffffff",
    webPreferences: appWebPreferences(),
  });

  win.once("ready-to-show", () => win.show());

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // -3 = ERR_ABORTED: fired for superseded navigations (e.g. a redirect); not a failure.
    if (!isMainFrame || errorCode === -3) return;
    void win.loadURL(renderLoadFailurePage(validatedURL, errorDescription));
    win.show();
  });

  void win.loadURL(getAppUrl());
  return win;
}

/**
 * Minimal error page when the app can't be reached (dev server down, offline).
 * A data: URL has origin "null", so the preload never exposes the bridge to it.
 * "Retry" navigates to the app origin, which the navigation policy allows.
 * M3 (progressive offline) replaces this with a real offline workspace.
 */
function renderLoadFailurePage(failedUrl: string, reason: string): string {
  const appUrl = getAppUrl();
  const isLocal = appUrl.startsWith("http://localhost");
  const hint = isLocal
    ? "Is the web app running? Start it from the repo root with <code>pnpm dev</code>."
    : "Check your connection. Offline support arrives in M3.";
  const escape = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Digital Garden</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
  :root { color-scheme: light dark; font-family: -apple-system, system-ui, sans-serif; }
  body { display:grid; place-items:center; min-height:100vh; margin:0; }
  main { max-width: 32rem; padding: 2rem; line-height: 1.5; }
  code { font-size: .9em; } a { color: #3b82f6; } small { opacity:.6; }
</style></head><body><main>
  <h1>Can't reach Digital Garden</h1>
  <p>${hint}</p>
  <p><a href="${escape(appUrl)}">Retry</a></p>
  <small>${escape(failedUrl)} — ${escape(reason)}</small>
</main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
