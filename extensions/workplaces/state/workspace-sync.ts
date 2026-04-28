import type { ContentWorkspaceResponse } from "@/extensions/workplaces/server";
import { useWorkspaceStore, registerMutationBroadcast } from "./workspace-store";
import { warmContentSummaryCache } from "@/lib/domain/content/content-summary-cache";

const SYNC_CHANNEL_NAME = "dg-workspace-sync";
const POLL_INTERVAL_MS = 15_000;
const MENU_OPEN_DEBOUNCE_MS = 2_000;

let channel: BroadcastChannel | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let menuOpenTimer: ReturnType<typeof setTimeout> | null = null;
let installed = false;

async function fetchAndApply(): Promise<void> {
  try {
    const response = await fetch("/api/content/workspaces", { credentials: "include" });
    if (!response.ok) return;
    const result = (await response.json()) as {
      success: boolean;
      data?: ContentWorkspaceResponse[];
    };
    if (!result.success || !result.data) return;
    useWorkspaceStore.getState().receiveRefreshedWorkspaces(result.data);
    warmContentSummaryCache(
      result.data.flatMap((ws) => ws.items.map((item) => item.content))
    );
  } catch {
    // silent — background poll; network errors are expected
  }
}

export function triggerMenuOpenSync(): void {
  if (menuOpenTimer) clearTimeout(menuOpenTimer);
  menuOpenTimer = setTimeout(() => {
    void fetchAndApply();
  }, MENU_OPEN_DEBOUNCE_MS);
}

export function installWorkspaceSync(): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (installed) return () => undefined;
  installed = true;

  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
    channel.onmessage = () => {
      void fetchAndApply();
    };
  }

  registerMutationBroadcast(() => broadcastWorkspaceMutation());

  pollTimer = setInterval(() => {
    if (document.visibilityState === "visible") {
      void fetchAndApply();
    }
  }, POLL_INTERVAL_MS);

  const handleOnline = () => {
    void fetchAndApply();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      void fetchAndApply();
    }
  };

  window.addEventListener("online", handleOnline);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    installed = false;
    registerMutationBroadcast(() => undefined);
    channel?.close();
    channel = null;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (menuOpenTimer) {
      clearTimeout(menuOpenTimer);
      menuOpenTimer = null;
    }
    window.removeEventListener("online", handleOnline);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}

export function broadcastWorkspaceMutation(): void {
  channel?.postMessage({ type: "workspace-mutated" });
}
