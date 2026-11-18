import { BrowserWindow, app, session, shell } from "electron";
import { SESSION_PARTITION, getAppOrigin, isAppOrigin } from "../shared/config";
import { announceReadyOnLoad, registerBridge } from "./bridge";
import { classifyNavigation } from "./navigation";
import { appWebPreferences, createMainWindow } from "./windows";

/**
 * Permissions the web app may use, and only from its own origin:
 *   media                      — microphone for speech-to-text (lib/domain/ai/transcribe)
 *   clipboard-sanitized-write  — copy buttons (navigator.clipboard.writeText)
 *   clipboard-read             — paste-from-clipboard actions in the editor
 *   notifications              — web Notifications until M2's native `web:notify`
 *   fullscreen                 — reader / presentation modes
 * Everything else (geolocation, camera-only capture, HID, serial, midi …) is denied.
 */
const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set([
  "media",
  "clipboard-sanitized-write",
  "clipboard-read",
  "notifications",
  "fullscreen",
]);

let mainWindow: BrowserWindow | null = null;

function hardenSession(): void {
  const garden = session.fromPartition(SESSION_PARTITION);
  garden.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(ALLOWED_PERMISSIONS.has(permission) && isAppOrigin(details.requestingUrl));
  });
  garden.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    return ALLOWED_PERMISSIONS.has(permission) && requestingOrigin === getAppOrigin();
  });
}

/** Applies the navigation policy to EVERY webContents, including popups. */
function hardenWebContents(): void {
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (event) => event.preventDefault());

    contents.on("will-navigate", (event, url) => {
      const target = classifyNavigation(url, getAppOrigin(), "navigate");
      if (target === "stay") return;
      event.preventDefault();
      if (target === "system-browser") void shell.openExternal(url);
    });

    contents.setWindowOpenHandler(({ url }) => {
      const target = classifyNavigation(url, getAppOrigin(), "window-open");
      if (target === "app-window") {
        return { action: "allow", overrideBrowserWindowOptions: { webPreferences: appWebPreferences() } };
      }
      if (target === "system-browser") void shell.openExternal(url);
      return { action: "deny" };
    });

    announceReadyOnLoad(contents);
  });
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
    mainWindow.on("closed", () => (mainWindow = null));
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

// One running instance owns the session partition and (in M1) the deep-link scheme.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showMainWindow);

  app.whenReady().then(() => {
    hardenSession();
    hardenWebContents();
    registerBridge();
    showMainWindow();

    // macOS: clicking the Dock icon with no windows open reopens the app.
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) showMainWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
