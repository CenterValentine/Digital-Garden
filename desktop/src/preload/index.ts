import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  DESKTOP_CAPABILITIES,
  IPC_CHANNELS,
  type NativeToWebMessage,
} from "../shared/messages";

/**
 * Sandboxed preload: exposes `window.dgNative` (the desktop transport for the
 * future lib/native-shell, D4), and ONLY to the trusted app origin's top frame.
 * The main process re-checks the sender frame on every message; this gate just
 * keeps the API out of sight on any other page (error page, popups elsewhere).
 */
const ORIGIN_ARG = "--dg-app-origin=";
const trustedOrigin = process.argv.find((arg) => arg.startsWith(ORIGIN_ARG))?.slice(ORIGIN_ARG.length);

if (trustedOrigin && window.top === window && window.location.origin === trustedOrigin) {
  contextBridge.exposeInMainWorld("dgNative", {
    shell: "desktop" as const,
    /**
     * Static capability list: readable synchronously at any time, so the web
     * app never races the `native:ready` event to learn what the shell can do.
     */
    capabilities: [...DESKTOP_CAPABILITIES],
    postMessage(message: unknown): void {
      ipcRenderer.send(IPC_CHANNELS.webToNative, message);
    },
    /** Subscribe to native→web messages. Returns an unsubscribe function. */
    onMessage(listener: (message: NativeToWebMessage) => void): () => void {
      const handler = (_event: IpcRendererEvent, message: NativeToWebMessage) => listener(message);
      ipcRenderer.on(IPC_CHANNELS.nativeToWeb, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.nativeToWeb, handler);
      };
    },
  });
}
