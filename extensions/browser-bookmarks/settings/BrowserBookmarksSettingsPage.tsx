"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Folder, MonitorSmartphone, Puzzle } from "lucide-react";
import { toast } from "sonner";
import { getSurfaceStyles } from "@/lib/design/system";

type ConnectionRecord = {
  id: string;
  name: string;
  appRootId: string;
  chromeRootId: string;
  chromeRootTitle: string;
  installCount?: number;
  installs?: Array<{
    installId: string;
    chromeRootId: string | null;
    chromeRootTitle: string;
  }>;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};

type AppFolderNode = {
  id: string;
  title: string;
  contentType: string;
  children?: AppFolderNode[];
};

type AppTreeResponse = {
  tree?: AppFolderNode[];
};

type BrowserFolderNode = {
  id: string;
  title: string;
  children?: BrowserFolderNode[];
};

type ExtensionBridgeInfo = {
  installed: boolean;
  extensionId: string;
  extensionName: string;
  extensionVersion: string;
  installInstanceId: string;
  trustedInstallId?: string | null;
  trustedAt?: string | null;
  tokenPresent?: boolean;
  appBaseUrl?: string;
  browser: {
    name: string;
    version: string | null;
  };
  os: {
    name: string;
    version: string | null;
  };
};

type ExtensionBridgeState =
  | { status: "checking" }
  | { status: "missing" }
  | {
      status: "installed";
      info: ExtensionBridgeInfo;
      folders: BrowserFolderNode[];
    };

type TrustedInstallRecord = {
  id: string;
  tokenId: string;
  installInstanceId: string;
  extensionId: string;
  extensionName: string;
  extensionVersion: string;
  browserName: string;
  browserVersion: string | null;
  osName: string;
  osVersion: string | null;
  trustedAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: {
    message?: string;
  };
};

function flattenFolders(
  nodes: AppFolderNode[] | undefined,
  prefix = ""
): Array<{ id: string; label: string }> {
  const entries: Array<{ id: string; label: string }> = [];

  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (node.contentType !== "folder") continue;
    const title = node.title?.trim() || "Untitled Folder";
    const label = prefix ? `${prefix} / ${title}` : title;
    entries.push({ id: node.id, label });
    entries.push(...flattenFolders(node.children, label));
  }

  return entries;
}

async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error?.message || fallbackMessage);
  }
  return payload.data as T;
}

function dispatchBridgeRequest(type: string, payload?: Record<string, unknown>) {
  window.postMessage(
    {
      source: "dg-browser-bookmarks-app",
      type,
      payload,
    },
    window.location.origin
  );
  document.dispatchEvent(
    new CustomEvent("dg-browser-bookmarks-request", {
      detail: {
        source: "dg-browser-bookmarks-app",
        type,
        payload,
      },
    })
  );
}

async function requestBridgeResponse<T>(
  requestType: string,
  successType: string,
  payload?: Record<string, unknown>
) {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener("message", handleMessage);
      document.removeEventListener(
        "dg-browser-bookmarks-response",
        handleBridgeEvent as EventListener
      );
      window.clearTimeout(timeoutId);
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const inspect = (type: string | undefined, detailPayload: unknown) => {
      if (type === successType) {
        finish(() => resolve(detailPayload as T));
        return true;
      }
      if (type === "bridge-error") {
        finish(() =>
          reject(
            new Error(
              (detailPayload as { message?: string } | undefined)?.message ||
                "Browser bookmark bridge failed"
            )
          )
        );
        return true;
      }
      return false;
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.source !== "dg-browser-bookmarks-extension") return;
      inspect(event.data.type, event.data.payload);
    };

    const handleBridgeEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{
        source?: string;
        type?: string;
        payload?: unknown;
      }>;
      if (customEvent.detail?.source !== "dg-browser-bookmarks-extension") return;
      inspect(customEvent.detail?.type, customEvent.detail?.payload);
    };

    const timeoutId = window.setTimeout(() => {
      finish(() => reject(new Error("Timed out waiting for the browser extension")));
    }, 3000);

    window.addEventListener("message", handleMessage);
    document.addEventListener("dg-browser-bookmarks-response", handleBridgeEvent as EventListener);

    dispatchBridgeRequest(requestType, payload);
  });
}

export default function BrowserBookmarksSettingsPage() {
  const glass0 = getSurfaceStyles("glass-0");

  const [loading, setLoading] = useState(true);
  const [trustedInstalls, setTrustedInstalls] = useState<TrustedInstallRecord[]>([]);
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [folders, setFolders] = useState<Array<{ id: string; label: string }>>([]);
  const [folderSearchQuery, setFolderSearchQuery] = useState("");
  const [connectionName, setConnectionName] = useState("Bookmarks");
  const [appRootId, setAppRootId] = useState("");
  const [chromeRootId, setChromeRootId] = useState("");
  const [chromeRootTitle, setChromeRootTitle] = useState("Bookmarks");
  const [selectedInstallIds, setSelectedInstallIds] = useState<string[]>([]);
  const [bridgeState, setBridgeState] = useState<ExtensionBridgeState>({ status: "checking" });
  const [expandedBrowserFolderIds, setExpandedBrowserFolderIds] = useState<Set<string>>(new Set());
  const hasShownLoadError = useRef(false);
  const hasShownBridgeError = useRef(false);
  const hasAttemptedBridgeRepair = useRef<string | null>(null);

  const currentTrustedInstall = useMemo(() => {
    if (bridgeState.status !== "installed") return null;
    return (
      trustedInstalls.find(
        (install) => install.installInstanceId === bridgeState.info.installInstanceId
      ) ?? null
    );
  }, [bridgeState, trustedInstalls]);

  const selectedBrowserFolder = useMemo(() => {
    if (bridgeState.status !== "installed") return null;

    const queue = [...bridgeState.folders];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.id === chromeRootId) return current;
      queue.push(...(current.children ?? []));
    }

    return null;
  }, [bridgeState, chromeRootId]);

  const trustedInstallNameById = useMemo(
    () =>
      new Map(
        trustedInstalls.map((install) => [
          install.id,
          `${install.browserName}${install.browserVersion ? ` ${install.browserVersion}` : ""}`,
        ])
      ),
    [trustedInstalls]
  );

  const filteredFolders = useMemo(() => {
    const query = folderSearchQuery.trim().toLowerCase();
    if (!query) return folders;
    return folders.filter((folder) => folder.label.toLowerCase().includes(query));
  }, [folderSearchQuery, folders]);

  const visibleFolderOptions = useMemo(() => {
    if (!appRootId) return filteredFolders;
    const selected = folders.find((folder) => folder.id === appRootId);
    if (!selected) return filteredFolders;
    if (filteredFolders.some((folder) => folder.id === appRootId)) return filteredFolders;
    return [selected, ...filteredFolders];
  }, [appRootId, filteredFolders, folders]);

  const otherTrustedInstalls = useMemo(() => {
    if (!currentTrustedInstall) return trustedInstalls;
    return trustedInstalls.filter((install) => install.id !== currentTrustedInstall.id);
  }, [currentTrustedInstall, trustedInstalls]);

  const browserFolderConflict = useMemo(() => {
    if (bridgeState.status !== "installed" || !currentTrustedInstall || !chromeRootId) {
      return null;
    }

    const parentById = new Map<string, string | null>();
    const queue = [...bridgeState.folders];
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (!parentById.has(node.id)) {
        parentById.set(node.id, null);
      }
      for (const child of node.children ?? []) {
        parentById.set(child.id, node.id);
        queue.push(child);
      }
    }

    const isDescendantOf = (candidateId: string, ancestorId: string) => {
      let currentId: string | null = candidateId;
      while (currentId) {
        if (currentId === ancestorId) return true;
        currentId = parentById.get(currentId) ?? null;
      }
      return false;
    };

    const existingRoots = connections
      .filter((connection) =>
        connection.installs?.some((install) => install.installId === currentTrustedInstall.id)
      )
      .map((connection) => ({
        connectionName: connection.name,
        rootId:
          connection.installs?.find((install) => install.installId === currentTrustedInstall.id)
            ?.chromeRootId || connection.chromeRootId,
      }))
      .filter((item): item is { connectionName: string; rootId: string } => Boolean(item.rootId));

    for (const existing of existingRoots) {
      if (existing.rootId === chromeRootId) {
        return `This browser folder is already used by the "${existing.connectionName}" connection.`;
      }
      if (isDescendantOf(chromeRootId, existing.rootId)) {
        return `This browser folder sits inside the "${existing.connectionName}" root. Nested browser roots on the same install are not allowed.`;
      }
      if (isDescendantOf(existing.rootId, chromeRootId)) {
        return `This browser folder would contain the "${existing.connectionName}" root. Nested browser roots on the same install are not allowed.`;
      }
    }

    return null;
  }, [bridgeState, chromeRootId, connections, currentTrustedInstall]);

  const currentInstallNeedsBridgeRepair = useMemo(() => {
    if (bridgeState.status !== "installed" || !currentTrustedInstall) return false;
    return (
      bridgeState.info.trustedInstallId !== currentTrustedInstall.id ||
      !bridgeState.info.tokenPresent ||
      bridgeState.info.appBaseUrl !== window.location.origin
    );
  }, [bridgeState, currentTrustedInstall]);

  const canCreateConnection =
    bridgeState.status === "installed" &&
    Boolean(currentTrustedInstall) &&
    selectedInstallIds.length > 0 &&
    appRootId.length > 0 &&
    chromeRootId.length > 0 &&
    !browserFolderConflict;

  async function loadData() {
    setLoading(true);

    const [installsResult, connectionsResult, treeResult] = await Promise.allSettled([
      (async () => {
        const response = await fetch("/api/integrations/browser-bookmarks/installs");
        return readJsonResponse<TrustedInstallRecord[]>(
          response,
          "Failed to load trusted browser installs"
        );
      })(),
      (async () => {
        const response = await fetch("/api/integrations/browser-bookmarks/connections");
        return readJsonResponse<ConnectionRecord[]>(
          response,
          "Failed to load bookmark sync connections"
        );
      })(),
      (async () => {
        const response = await fetch("/api/content/content/tree");
        const data = await readJsonResponse<AppTreeResponse>(
          response,
          "Failed to load app folders"
        );
        return Array.isArray(data?.tree) ? data.tree : [];
      })(),
    ]);

    try {
      setTrustedInstalls(installsResult.status === "fulfilled" ? installsResult.value ?? [] : []);
      setConnections(connectionsResult.status === "fulfilled" ? connectionsResult.value ?? [] : []);

      if (treeResult.status === "fulfilled") {
        const flattened = flattenFolders(treeResult.value);
        setFolders(flattened);
        setAppRootId((current) => current || flattened[0]?.id || "");
      } else {
        setFolders([]);
      }

      const failures = [installsResult, connectionsResult, treeResult].filter(
        (result) => result.status === "rejected"
      );

      if (failures.length > 0) {
        console.error("[BrowserBookmarksSettings] Partial load failure", failures);
        if (!hasShownLoadError.current) {
          const firstFailure = failures[0] as PromiseRejectedResult;
          toast.error(firstFailure.reason?.message || "Failed to load browser bookmark settings", {
            id: "browser-bookmarks-load-error",
          });
          hasShownLoadError.current = true;
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const parsePresenceNode = (): ExtensionBridgeInfo | null => {
      const node = document.getElementById("dg-browser-bookmarks-extension-presence");
      if (!node) return null;

      return {
        installed: node.getAttribute("data-installed") === "true",
        extensionId: node.getAttribute("data-extension-id") || "",
        extensionName:
          node.getAttribute("data-extension-name") || "Digital Garden Browser Bookmarks",
        extensionVersion: node.getAttribute("data-extension-version") || "",
        installInstanceId: node.getAttribute("data-install-instance-id") || "",
        trustedInstallId: node.getAttribute("data-trusted-install-id") || null,
        trustedAt: node.getAttribute("data-trusted-at") || null,
        tokenPresent: node.getAttribute("data-token-present") === "true",
        appBaseUrl: node.getAttribute("data-app-base-url") || "",
        browser: {
          name: node.getAttribute("data-browser-name") || "Unknown Chromium Browser",
          version: node.getAttribute("data-browser-version") || null,
        },
        os: {
          name: node.getAttribute("data-os-name") || "Unknown OS",
          version: node.getAttribute("data-os-version") || null,
        },
      };
    };

    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        setBridgeState((current) => (current.status === "checking" ? { status: "missing" } : current));
      }
    }, 1200);

    const setInstalledState = (
      info: ExtensionBridgeInfo,
      nextFolders?: BrowserFolderNode[] | null
    ) => {
      setBridgeState((current) => ({
        status: "installed",
        info,
        folders:
          Array.isArray(nextFolders)
            ? nextFolders
            : current.status === "installed"
              ? current.folders
              : [],
      }));
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.source !== "dg-browser-bookmarks-extension") return;

      if (event.data.type === "installed" || event.data.type === "pong") {
        setInstalledState(event.data.payload as ExtensionBridgeInfo);
        return;
      }

      if (event.data.type === "bookmark-folder-tree") {
        const payload = event.data.payload as ExtensionBridgeInfo & { folders?: BrowserFolderNode[] };
        setExpandedBrowserFolderIds(new Set());
        setInstalledState(payload, payload.folders ?? []);
        return;
      }

      if (event.data.type === "trusted-install-saved" || event.data.type === "trusted-install-cleared") {
        setInstalledState(event.data.payload as ExtensionBridgeInfo);
        return;
      }

      if (event.data.type === "bridge-error" && !cancelled && !hasShownBridgeError.current) {
        hasShownBridgeError.current = true;
        toast.error(event.data.payload?.message || "Browser bookmark bridge failed", {
          id: "browser-bookmarks-bridge-error",
        });
      }
    };

    const handleBridgeEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{
        source?: string;
        type?: string;
        payload?: ExtensionBridgeInfo & { folders?: BrowserFolderNode[]; message?: string };
      }>;
      const detail = customEvent.detail;
      if (detail?.source !== "dg-browser-bookmarks-extension") return;

      if (detail.type === "installed" || detail.type === "pong") {
        setInstalledState(detail.payload as ExtensionBridgeInfo);
        return;
      }

      if (detail.type === "bookmark-folder-tree") {
        const payload = detail.payload as ExtensionBridgeInfo & { folders?: BrowserFolderNode[] };
        setExpandedBrowserFolderIds(new Set());
        setInstalledState(payload, payload.folders ?? []);
        return;
      }

      if (detail.type === "trusted-install-saved" || detail.type === "trusted-install-cleared") {
        setInstalledState(detail.payload as ExtensionBridgeInfo);
        return;
      }

      if (detail.type === "bridge-error" && !cancelled && !hasShownBridgeError.current) {
        hasShownBridgeError.current = true;
        toast.error(detail.payload?.message || "Browser bookmark bridge failed", {
          id: "browser-bookmarks-bridge-error",
        });
      }
    };

    window.addEventListener("message", handleMessage);
    document.addEventListener("dg-browser-bookmarks-response", handleBridgeEvent as EventListener);

    const presenceInfo = parsePresenceNode();
    if (presenceInfo) {
      setInstalledState(presenceInfo);
    }

    dispatchBridgeRequest("ping");
    dispatchBridgeRequest("get-bookmark-folder-tree");

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);
      document.removeEventListener("dg-browser-bookmarks-response", handleBridgeEvent as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!currentTrustedInstall) return;

    setSelectedInstallIds((current) => {
      if (current.includes(currentTrustedInstall.id)) return current;
      return [currentTrustedInstall.id, ...current];
    });
  }, [currentTrustedInstall]);

  useEffect(() => {
    if (!currentTrustedInstall || !currentInstallNeedsBridgeRepair) return;
    if (hasAttemptedBridgeRepair.current === currentTrustedInstall.id) return;

    hasAttemptedBridgeRepair.current = currentTrustedInstall.id;
    void handleRefreshTrustedInstall(currentTrustedInstall.id, { silentSuccess: true });
  }, [currentInstallNeedsBridgeRepair, currentTrustedInstall]);

  async function handleTrustCurrentInstall() {
    if (bridgeState.status !== "installed") return;

    try {
      const response = await fetch("/api/integrations/browser-bookmarks/installs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installInstanceId: bridgeState.info.installInstanceId,
          extensionId: bridgeState.info.extensionId,
          extensionName: bridgeState.info.extensionName,
          extensionVersion: bridgeState.info.extensionVersion,
          browserName: bridgeState.info.browser.name,
          browserVersion: bridgeState.info.browser.version,
          osName: bridgeState.info.os.name,
          osVersion: bridgeState.info.os.version,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to trust browser extension");
      }

      await requestBridgeResponse(
        "save-trusted-install",
        "trusted-install-saved",
        {
          trustedInstallId: json.data.install.id,
          appBaseUrl: window.location.origin,
          token: json.data.token,
        }
      );

      toast.success("Browser extension trusted");
      hasShownLoadError.current = false;
      await loadData();
    } catch (error) {
      console.error("[BrowserBookmarksSettings] Trust install failed", error);
      toast.error(error instanceof Error ? error.message : "Failed to trust browser extension", {
        id: "browser-bookmarks-trust-error",
      });
    }
  }

  async function handleRefreshTrustedInstall(
    id: string,
    options?: { silentSuccess?: boolean }
  ) {
    try {
      const response = await fetch(`/api/integrations/browser-bookmarks/installs/${id}`, {
        method: "PATCH",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to refresh trusted browser");
      }

      if (bridgeState.status === "installed" && currentTrustedInstall?.id === id) {
        await requestBridgeResponse(
          "save-trusted-install",
          "trusted-install-saved",
          {
            trustedInstallId: json.data.install.id,
            appBaseUrl: window.location.origin,
            token: json.data.token,
          }
        );
      }

      if (!options?.silentSuccess) {
        toast.success("Trusted browser token refreshed");
      }
      hasShownLoadError.current = false;
      await loadData();
    } catch (error) {
      console.error("[BrowserBookmarksSettings] Refresh install failed", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to refresh trusted browser token",
        { id: "browser-bookmarks-refresh-error" }
      );
    }
  }

  async function handleRevokeTrustedInstall(id: string) {
    const confirmed = window.confirm(
      "Remove trust for this browser extension? Any bookmark sync connections using this browser will stop working until it is trusted again."
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/integrations/browser-bookmarks/installs/${id}`, {
        method: "DELETE",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to revoke trusted browser");
      }

      if (bridgeState.status === "installed" && currentTrustedInstall?.id === id) {
        await requestBridgeResponse("clear-trusted-install", "trusted-install-cleared");
      }

      setSelectedInstallIds((current) => current.filter((value) => value !== id));
      toast.success("Trusted browser removed");
      hasShownLoadError.current = false;
      await loadData();
    } catch (error) {
      console.error("[BrowserBookmarksSettings] Revoke install failed", error);
      toast.error(error instanceof Error ? error.message : "Failed to remove trusted browser", {
        id: "browser-bookmarks-revoke-error",
      });
    }
  }

  async function handleCreateConnection() {
    try {
      const response = await fetch("/api/integrations/browser-bookmarks/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: connectionName,
          tokenId: null,
          appRootId,
          chromeRootId,
          chromeRootTitle,
          installIds: selectedInstallIds,
          currentInstallId: currentTrustedInstall?.id ?? null,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to create connection");
      }

      toast.success("Bookmark sync connection created");
      setChromeRootId("");
      setChromeRootTitle("Bookmarks");
      hasShownLoadError.current = false;
      await loadData();
    } catch (error) {
      console.error("[BrowserBookmarksSettings] Create connection failed", error);
      toast.error("Failed to create connection");
    }
  }

  async function handleDeleteConnection(id: string) {
    try {
      const response = await fetch(`/api/integrations/browser-bookmarks/connections/${id}`, {
        method: "DELETE",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to delete connection");
      }

      toast.success("Bookmark sync connection deleted");
      hasShownLoadError.current = false;
      await loadData();
    } catch (error) {
      console.error("[BrowserBookmarksSettings] Delete connection failed", error);
      toast.error("Failed to delete connection");
    }
  }

  function toggleSelectedInstall(id: string) {
    setSelectedInstallIds((current) => {
      if (current.includes(id)) {
        if (currentTrustedInstall?.id === id) return current;
        return current.filter((value) => value !== id);
      }
      return [...current, id];
    });
  }

  function toggleBrowserFolder(id: string) {
    setExpandedBrowserFolderIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectBrowserFolder(node: BrowserFolderNode) {
    setChromeRootId(node.id);
    setChromeRootTitle(node.title);
    if (connectionName === "Bookmarks" || connectionName === chromeRootTitle) {
      setConnectionName(node.title);
    }
  }

  function renderBrowserFolderRows(nodes: BrowserFolderNode[], depth = 0): ReactNode {
    return nodes.map((node) => {
      const isExpanded = expandedBrowserFolderIds.has(node.id);
      const hasChildren = (node.children?.length ?? 0) > 0;
      const isSelected = chromeRootId === node.id;

      return (
        <div key={node.id}>
          <div
            className={`grid grid-cols-[minmax(0,1fr)_140px] items-center gap-3 rounded-lg px-2 py-2 text-sm ${
              isSelected
                ? "bg-primary/15 text-foreground ring-1 ring-primary/30"
                : "hover:bg-black/5"
            }`}
          >
            <div className="flex min-w-0 items-start gap-2" style={{ marginLeft: depth * 16 }}>
              <button
                type="button"
                onClick={() => (hasChildren ? toggleBrowserFolder(node.id) : selectBrowserFolder(node))}
                className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-black/5"
                aria-label={
                  hasChildren
                    ? isExpanded
                      ? "Collapse folder"
                      : "Expand folder"
                    : "Select folder"
                }
              >
                {hasChildren ? (
                  isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                ) : (
                  <span className="h-4 w-4" />
                )}
              </button>
              <Folder className="mt-0.5 h-4 w-4 text-amber-500" />
              <button
                type="button"
                onClick={() => selectBrowserFolder(node)}
                className="min-w-0 flex-1 truncate text-left"
                title={`${node.title} (${node.id})`}
              >
                {node.title}
              </button>
            </div>
            <div className="text-right text-xs text-muted-foreground">{node.id}</div>
          </div>
          {hasChildren && isExpanded ? renderBrowserFolderRows(node.children ?? [], depth + 1) : null}
        </div>
      );
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Browser Bookmarks</h1>
        <p className="mt-2 text-muted-foreground">
          Trust browser installs, attach them to sync connections, and manage browser bookmark integration
          for Chrome and Vivaldi.
        </p>
      </div>

      <section
        className="space-y-4 rounded-xl border border-white/10 p-6"
        style={{ background: glass0.background, backdropFilter: glass0.backdropFilter }}
      >
        <div className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-black/5 px-4 py-3 transition-all duration-300">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg border border-white/10 bg-black/10 p-2">
              <Puzzle className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="font-medium">Extension Link</div>
              {bridgeState.status === "installed" ? (
                <div className="mt-1 text-sm text-muted-foreground">
                  {bridgeState.info.extensionName} {bridgeState.info.extensionVersion} on{" "}
                  {bridgeState.info.browser.name}
                  {bridgeState.info.browser.version ? ` ${bridgeState.info.browser.version}` : ""} •{" "}
                  {bridgeState.info.os.name}
                  {bridgeState.info.os.version ? ` ${bridgeState.info.os.version}` : ""}
                </div>
              ) : bridgeState.status === "checking" ? (
                <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-muted-foreground" />
                  Checking whether the browser extension is installed in this browser tab.
                </div>
              ) : (
                <div className="mt-1 text-sm text-muted-foreground">
                  The browser extension is not detected in this browser. Sync connection setup is disabled
                  until it is installed.
                </div>
              )}
            </div>
          </div>
          {bridgeState.status === "installed" ? (
            <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
              Connected
            </div>
          ) : (
            <div className="whitespace-nowrap rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
              Not Detected
            </div>
          )}
        </div>

        <div
          className={`overflow-hidden transition-all duration-300 ${
            bridgeState.status === "missing"
              ? "max-h-96 translate-y-0 opacity-100"
              : "max-h-0 -translate-y-1 opacity-0"
          }`}
        >
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm">
            <div className="font-medium text-foreground">Install the browser extension first</div>
            <div className="mt-2 text-muted-foreground">
              This app page cannot read browser bookmarks on its own. Install the Digital Garden Browser
              Bookmarks extension in your Chromium browser, then reload this page.
            </div>
            <div className="mt-3 space-y-1 text-muted-foreground">
              <div>1. Open `chrome://extensions` or `vivaldi://extensions`.</div>
              <div>2. Enable Developer Mode.</div>
              <div>3. Choose Load unpacked.</div>
              <div>
                4. Select `extensions/browser-bookmarks/browser-extension` from the
                `centervalentine/digital-garden` repo.
              </div>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Trusted Browser Installs</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Trusting a browser install creates a hidden sync token that stays inside the extension. Revoking
            trust breaks any bookmark sync connections that use that browser until it is trusted again.
          </p>
        </div>

        {bridgeState.status === "installed" ? (
          <div className="rounded-xl border border-white/10 bg-black/5 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-medium">
                  {bridgeState.info.browser.name}
                  {bridgeState.info.browser.version ? ` ${bridgeState.info.browser.version}` : ""} on{" "}
                  {bridgeState.info.os.name}
                  {bridgeState.info.os.version ? ` ${bridgeState.info.os.version}` : ""}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Install ID {bridgeState.info.installInstanceId}
                </div>
              </div>
              {loading ? (
                <div className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-muted-foreground">
                  Loading…
                </div>
              ) : currentTrustedInstall ? (
                <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                  Trusted
                </div>
              ) : (
                <div className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
                  Untrusted
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {loading ? null : !currentTrustedInstall ? (
                <button
                  onClick={handleTrustCurrentInstall}
                  className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
                >
                  Trust This Browser Extension
                </button>
              ) : (
                <>
                  <button
                    onClick={() => handleRefreshTrustedInstall(currentTrustedInstall.id)}
                    className="rounded-lg border border-white/10 px-4 py-2 text-sm"
                  >
                    Refresh Token
                  </button>
                  <button
                    onClick={() => handleRevokeTrustedInstall(currentTrustedInstall.id)}
                    className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400"
                  >
                    Remove Trust
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-black/5 px-4 py-3 text-sm text-muted-foreground">
            Detect the extension in this browser first to trust it.
          </div>
        )}

        <div className="space-y-3">
          {otherTrustedInstalls.map((install) => (
            <div
              key={install.id}
              className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3"
            >
              <div>
                <div className="font-medium">
                  {install.browserName}
                  {install.browserVersion ? ` ${install.browserVersion}` : ""} • {install.osName}
                  {install.osVersion ? ` ${install.osVersion}` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  {install.extensionName} {install.extensionVersion} • Trusted{" "}
                  {new Date(install.trustedAt).toLocaleString()}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleRefreshTrustedInstall(install.id)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-sm"
                >
                  Refresh
                </button>
                <button
                  onClick={() => handleRevokeTrustedInstall(install.id)}
                  className="rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-400"
                >
                  Revoke
                </button>
              </div>
            </div>
          ))}
          {!loading && otherTrustedInstalls.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {currentTrustedInstall
                ? "No other trusted browser installs yet."
                : "No trusted browser installs yet."}
            </div>
          ) : null}
        </div>
      </section>

      <section
        className="space-y-4 rounded-xl border border-white/10 p-6"
        style={{ background: glass0.background, backdropFilter: glass0.backdropFilter }}
      >
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Sync Connections</h2>
            <button
              type="button"
              title="Choose the Digital Garden destination folder, then choose the browser bookmark folder from the tree below. Additional trusted browsers can be attached to the same connection without exposing raw extension tokens."
              aria-label="Help with sync connections"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-black/10 text-xs text-muted-foreground"
            >
              ?
            </button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Pair one browser bookmark root with one Digital Garden folder. Add more trusted browsers to the
            same connection when you want that connection available across multiple installs.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            App root folder means the destination folder inside Digital Garden where bookmarks from the
            selected browser folder will be created and synced.
          </p>
        </div>

        <div
          className={`space-y-4 ${bridgeState.status !== "installed" ? "pointer-events-none opacity-55" : ""}`}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={connectionName}
              onChange={(event) => setConnectionName(event.target.value)}
              className="rounded-lg border border-white/10 bg-black/10 px-3 py-2"
              placeholder="Connection name"
            />

            <input
              value={chromeRootTitle}
              onChange={(event) => setChromeRootTitle(event.target.value)}
              className="rounded-lg border border-white/10 bg-black/10 px-3 py-2"
              placeholder="Browser root title"
              readOnly={bridgeState.status === "installed"}
            />

            <select
              value={appRootId}
              onChange={(event) => setAppRootId(event.target.value)}
              className="rounded-lg border border-white/10 bg-black/10 px-3 py-2"
              title="Choose the Digital Garden folder that should receive bookmarks from the selected browser folder."
            >
              <option value="">Select app root folder</option>
              {visibleFolderOptions.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.label}
                </option>
              ))}
            </select>

            <div className="rounded-lg border border-white/10 bg-black/5 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Selected Browser Folder</div>
              <div className="mt-1 text-sm">
                {selectedBrowserFolder ? (
                  <>
                    <span className="font-medium">{selectedBrowserFolder.title}</span>
                    <span className="text-muted-foreground"> • {selectedBrowserFolder.id}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Choose a bookmark folder from the browser tree below.
                  </span>
                )}
              </div>
            </div>
          </div>

          <input
            value={folderSearchQuery}
            onChange={(event) => setFolderSearchQuery(event.target.value)}
            className="rounded-lg border border-white/10 bg-black/10 px-3 py-2"
            placeholder="Search Digital Garden folders"
          />

          {folders.length === 0 ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
              No Digital Garden folders are available yet. Create a folder in the app file tree first, then
              return here and select it as the destination for synced bookmarks.
            </div>
          ) : filteredFolders.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-black/5 px-3 py-2 text-xs text-muted-foreground">
              No Digital Garden folders match this search.
            </div>
          ) : null}

          <div className="rounded-xl border border-white/10 bg-black/5 p-4">
            <div className="text-sm font-medium">Trusted Browsers On This Connection</div>
            <p className="mt-1 text-xs text-muted-foreground">
              The current browser is required and stays selected. You can attach additional trusted browsers
              now so the same connection can later be used from those installs too.
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {trustedInstalls.map((install) => {
                const isCurrent = currentTrustedInstall?.id === install.id;
                const isChecked = selectedInstallIds.includes(install.id);
                return (
                  <label
                    key={install.id}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-3 text-sm ${
                      isChecked
                        ? "border-primary/40 bg-primary/10"
                        : "border-white/10 bg-black/5"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isCurrent}
                      onChange={() => toggleSelectedInstall(install.id)}
                      className="mt-1"
                    />
                    <div className="min-w-0">
                      <div className="font-medium">
                        {install.browserName}
                        {install.browserVersion ? ` ${install.browserVersion}` : ""}
                        {isCurrent ? " • current browser" : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {install.osName}
                        {install.osVersion ? ` ${install.osVersion}` : ""} • Trusted{" "}
                        {new Date(install.trustedAt).toLocaleString()}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            {trustedInstalls.length === 0 ? (
              <div className="mt-3 text-xs text-muted-foreground">
                Trust at least one browser install before creating a connection.
              </div>
            ) : null}
          </div>

          {bridgeState.status === "installed" ? (
            <div className="rounded-xl border border-white/10 bg-black/5 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
                Browser Bookmark Folder Tree
              </div>
              <div className="mb-2 grid grid-cols-[minmax(0,1fr)_140px] gap-3 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
                <div>Browser Folder</div>
                <div className="text-right">Bookmark ID</div>
              </div>
              <div className="max-h-80 overflow-auto rounded-lg border border-white/10 bg-white/5 p-2">
                {bridgeState.folders.length > 0 ? (
                  renderBrowserFolderRows(bridgeState.folders)
                ) : (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    The extension is installed, but it did not return any bookmark folders yet.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {browserFolderConflict ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
              {browserFolderConflict}
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 bg-black/5 px-3 py-2 text-xs text-muted-foreground">
              Overlapping browser roots on the same install are blocked because bidirectional sync cannot
              safely infer the correct owner subtree. Across different installs, native bookmark events now
              resolve to the deepest matching browser root.
            </div>
          )}

          {bridgeState.status === "installed" && !currentTrustedInstall ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
              Trust this browser extension first. After that, Digital Garden will establish the hidden sync
              token for this browser automatically.
            </div>
          ) : null}

          <button
            onClick={handleCreateConnection}
            disabled={!canCreateConnection}
            className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create Connection
          </button>
        </div>

        <div className="space-y-3">
          {connections.map((connection) => (
            <div
              key={connection.id}
              className="flex items-start justify-between rounded-lg border border-white/10 px-4 py-3"
            >
              <div>
                <div className="font-medium">{connection.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Browser root: {connection.chromeRootTitle} ({connection.chromeRootId})
                </div>
                <div className="text-xs text-muted-foreground">
                  App root: {connection.appRootId}
                  {connection.lastSyncedAt
                    ? ` • Last synced ${new Date(connection.lastSyncedAt).toLocaleString()}`
                    : " • Not synced yet"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Trusted browsers:{" "}
                  {connection.installs?.length
                    ? connection.installs
                        .map((install) => trustedInstallNameById.get(install.installId) || install.installId)
                        .join(", ")
                    : "None attached"}
                </div>
                {connection.lastSyncError ? (
                  <div className="mt-1 text-xs text-red-400">{connection.lastSyncError}</div>
                ) : null}
              </div>
              <button
                onClick={() => handleDeleteConnection(connection.id)}
                className="rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-400"
              >
                Delete
              </button>
            </div>
          ))}
          {!loading && connections.length === 0 ? (
            <div className="text-sm text-muted-foreground">No connections configured yet.</div>
          ) : null}
        </div>
      </section>

      <section
        className="rounded-xl border border-white/10 p-6"
        style={{ background: glass0.background, backdropFilter: glass0.backdropFilter }}
      >
        <h2 className="text-xl font-semibold">Implementation Notes</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          v1 keeps bookmark notes simple on the extension side while the app contracts already reserve space
          for richer editing, preserve-HTML capture, and more expressive external-reference metadata.
        </p>
      </section>
    </div>
  );
}
