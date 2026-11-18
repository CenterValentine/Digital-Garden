import { BrowserWindow, app, ipcMain, shell, type WebContents } from "electron";
import { isAppOrigin } from "../shared/config";
import {
  DESKTOP_CAPABILITIES,
  IPC_CHANNELS,
  parseWebToNativeMessage,
  type NativeToWebMessage,
} from "../shared/messages";

/**
 * Main-process side of the bridge. The preload's origin gate is defense in
 * depth; THIS check is the authoritative one: every message's sender frame
 * must be the top frame of a page on the app origin.
 */
export function registerBridge(): void {
  ipcMain.on(IPC_CHANNELS.webToNative, (event, raw: unknown) => {
    const frame = event.senderFrame;
    if (!frame || frame.parent !== null || !isAppOrigin(frame.url)) return;

    const message = parseWebToNativeMessage(raw);
    if (!message) return;

    switch (message.type) {
      case "web:open-external-url": {
        // Only web schemes + mail leave via the OS; never file:, smb:, custom handlers.
        if (/^(https?:|mailto:)/i.test(message.url)) void shell.openExternal(message.url);
        return;
      }
      case "web:set-title": {
        BrowserWindow.fromWebContents(event.sender)?.setTitle(message.title);
        return;
      }
    }
  });
}

export function sendToWeb(contents: WebContents, message: NativeToWebMessage): void {
  if (!contents.isDestroyed()) contents.send(IPC_CHANNELS.nativeToWeb, message);
}

/** Announce the shell after each app-origin page load (a full reload re-mounts listeners). */
export function announceReadyOnLoad(contents: WebContents): void {
  contents.on("did-finish-load", () => {
    if (!isAppOrigin(contents.getURL())) return;
    sendToWeb(contents, {
      type: "native:ready",
      shell: "desktop",
      version: app.getVersion(),
      capabilities: DESKTOP_CAPABILITIES,
    });
  });
}
