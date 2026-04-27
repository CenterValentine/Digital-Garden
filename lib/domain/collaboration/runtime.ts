"use client";

import { HocuspocusProvider } from "@hocuspocus/provider";
import { TiptapTransformer } from "@hocuspocus/transformer";
import type { JSONContent } from "@tiptap/core";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  hasMeaningfulTipTapContent,
  ydocHasMeaningfulDefaultContent,
  ydocUpdateHasMeaningfulDefaultContent,
} from "@/lib/domain/collaboration/content-safety";
import { getCollaborationServerExtensions } from "@/lib/domain/collaboration/extensions";

export type LocalSurfaceTopology = "singleSurface" | "multiSurface";
export type BrowserSessionTopology = "singleSession" | "multiSession";
export type RemoteCollaborationTopology = "solo" | "remotePresent";
export type PersistenceState = "booting" | "localReady";
export type BootstrapState = "pending" | "ready" | "failed";
export type SyncCapability = "localOnly" | "syncCapable";
export type ConnectionState =
  | "localOnly"
  | "promoting"
  | "connecting"
  | "connected"
  | "synced"
  | "disconnectedButDirty"
  | "coolingDown";
export type PresenceState = "none" | "selfOnly" | "multiUserPresent";
export type NetworkState = "online" | "offline";
export type AuthState = "unknown" | "authorized" | "unauthorized";
export type PromotionReason =
  | "browser-multi-session"
  | "remote-presence"
  | "explicit-live-workflow"
  | "reconnect-after-offline";
export type CollaborationEditPolicyReason =
  | "local-ready"
  | "offline-local-durable"
  | "booting-local-state"
  | "bootstrap-failed"
  | "view-only-permission"
  | "auth-revoked"
  | "known-stale"
  | "unsupported";

export type CollaborativeFieldKind = "tiptapXml" | "text" | "map" | "array" | "viewOnly";

export interface CollaborativeFieldSpec {
  field: "default" | "note" | "primary" | "meta" | "comments";
  kind: CollaborativeFieldKind;
  editable: boolean;
  required: boolean;
}

export interface ContentCollaborationCapability {
  contentType: string;
  syncCapability: SyncCapability;
  defaultEditableField: string | null;
  fields: CollaborativeFieldSpec[];
  promotionAllowed: boolean;
  localPersistence: boolean;
  hocuspocusPersistence: boolean;
}

export interface CollaborationEditPolicy {
  editable: boolean;
  reason: CollaborationEditPolicyReason;
  warning: string | null;
}

export interface RuntimeConsumerDescriptor {
  consumerId: string;
  contentId: string;
  surfaceKind:
    | "workspace-pane"
    | "workspace-tab"
    | "folder-preview"
    | "person-workspace"
    | "right-sidebar"
    | "share-view"
    | "other";
  workspaceId?: string | null;
  paneId?: string | null;
  tabId?: string | null;
  viewInstanceId: string;
  requiresEditableField?: string | null;
  requiresLiveTransport?: boolean;
  mountedAt: number;
}

export interface CollaborationRuntimeState {
  contentId: string;
  documentName: string;
  userId: string;
  browserContextId: string;
  sessionId: string;
  persistenceState: PersistenceState;
  bootstrapState: BootstrapState;
  syncCapability: SyncCapability;
  connectionState: ConnectionState;
  localSurfaceTopology: LocalSurfaceTopology;
  browserSessionTopology: BrowserSessionTopology;
  remoteCollaborationTopology: RemoteCollaborationTopology;
  presenceState: PresenceState;
  networkState: NetworkState;
  authState: AuthState;
  consumerCount: number;
  liveConsumerCount: number;
  lastKnownServerRevision: number | null;
  localDirty: boolean;
  unsyncedUpdateCount: number;
  reconnectIntent: boolean;
  readOnly: boolean;
  warning: string | null;
  editPolicy: CollaborationEditPolicy;
}

export interface CollaborationUser {
  id?: string;
  name: string;
  email?: string | null;
  color: string;
}

export interface CollaborationRuntimeHandle {
  runtimeId: string;
  contentId: string;
  ydoc: Y.Doc;
  provider: HocuspocusProvider | null;
  state: CollaborationRuntimeState;
  capability: ContentCollaborationCapability;
  user: CollaborationUser | null;
  promote: (reason: PromotionReason) => Promise<void>;
  updateConsumer: (patch: Partial<RuntimeConsumerDescriptor>) => void;
  release: () => void;
}

interface CollaborationTokenResponse {
  success: boolean;
  data?: {
    token: string;
    documentName: string;
    readOnly: boolean;
    user?: CollaborationUser;
    revision?: number;
    websocketUrl: string;
  };
  error?: { message?: string };
}

interface CollaborationStateResponse {
  success: boolean;
  data?: {
    documentName: string;
    readOnly: boolean;
    update: string | null;
  };
  error?: { message?: string };
}

type CollaborationAccessVerification =
  | { status: "authorized"; data: NonNullable<CollaborationTokenResponse["data"]> }
  | { status: "unauthorized"; reason: string }
  | { status: "transient"; reason: string };

interface BrowserSessionPresence {
  sessionId: string;
  browserContextId: string;
  surfaceCount: number;
  activePaneIds: string[];
  activeTabIds: string[];
  transportState: ConnectionState;
  lastKnownServerRevision: number | null;
  lastSeenAt: number;
}

interface PresenceHeartbeatPayload {
  contentId: string;
  sessionId: string;
  browserContextId: string;
  surfaceCount: number;
  activePaneIds: string[];
  activeTabIds: string[];
  transportState: ConnectionState;
  lastKnownServerRevision: number | null;
}

interface DocumentRuntimeEntry {
  runtimeId: string;
  contentId: string;
  capability: ContentCollaborationCapability;
  ydoc: Y.Doc;
  indexedDbProvider: IndexeddbPersistence;
  hocuspocusProvider: HocuspocusProvider | null;
  state: CollaborationRuntimeState;
  consumers: Map<string, RuntimeConsumerDescriptor>;
  user: CollaborationUser | null;
  listeners: Set<() => void>;
  cooldownTimer: ReturnType<typeof setTimeout> | null;
  idleEvictionTimer: ReturnType<typeof setTimeout> | null;
  bootstrapSlowTimer: ReturnType<typeof setTimeout> | null;
  bootstrapFallbackTimer: ReturnType<typeof setTimeout> | null;
  bootstrapAbortController: AbortController | null;
  sessionAnnounceTimer: ReturnType<typeof setInterval> | null;
  sessionSweepTimer: ReturnType<typeof setInterval> | null;
  presenceHeartbeatTimer: ReturnType<typeof setTimeout> | null;
  presenceHeartbeatInFlight: boolean;
  presenceEventSource: EventSource | null;
  broadcastChannel: BroadcastChannel | null;
  knownBrowserSessions: Map<string, BrowserSessionPresence>;
  pendingInitialContent: JSONContent | null;
  hasSeededInitialContent: boolean;
  isBootstrappingInitialContent: boolean;
  promotionPromise: Promise<void> | null;
  authVerificationPromise: Promise<void> | null;
  ydocUpdateHandler:
    | ((
        update: Uint8Array,
        origin: unknown,
        doc: Y.Doc,
        transaction: Y.Transaction
      ) => void)
    | null;
  networkOnlineHandler: () => void;
  networkOfflineHandler: () => void;
  visibilityChangeHandler: () => void;
  pageHideHandler: () => void;
  lastActivityAt: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;
}

interface UseCollaborationRuntimeOptions {
  contentId: string | null;
  capability: ContentCollaborationCapability | null;
  descriptor: Omit<RuntimeConsumerDescriptor, "consumerId" | "contentId" | "mountedAt">;
  initialContent?: JSONContent | null;
}

const NOTE_CAPABILITY: ContentCollaborationCapability = {
  contentType: "note",
  syncCapability: "syncCapable",
  defaultEditableField: "default",
  fields: [{ field: "default", kind: "tiptapXml", editable: true, required: true }],
  promotionAllowed: true,
  localPersistence: true,
  hocuspocusPersistence: true,
};

const COLLABORATION_CHANNEL_NAME = "dg-collaboration-runtime";
const SESSION_STALE_AFTER_MS = 6000;
const SESSION_ANNOUNCE_INTERVAL_MS = 2000;
const PRESENCE_HEARTBEAT_INTERVAL_MS = 10_000;
const PRESENCE_HEARTBEAT_IDLE_INTERVAL_MS = 30_000;
const PRESENCE_HEARTBEAT_HIDDEN_INTERVAL_MS = 30_000;
const PRESENCE_IDLE_AFTER_MS = 60_000;
const PROVIDER_RECONNECT_BASE_MS = 1000;
const PROVIDER_RECONNECT_MAX_MS = 30_000;
const BOOTSTRAP_SLOW_WARNING_MS = 10_000;
const BOOTSTRAP_LOCAL_FALLBACK_MS = 25_000;
const COOLDOWN_MS = 120_000;
const IDLE_EVICTION_MS = 300_000;
const LOCAL_CACHE_MANIFEST_KEY = "dg-collab-local-cache-manifest";
const LOCAL_CACHE_PRUNE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

interface LocalCacheManifestEntry {
  contentId: string;
  indexedDbName: string;
  lastAccessedAt: number;
  dirty: boolean;
  unsyncedUpdateCount: number;
}

type LocalCacheManifest = Record<string, LocalCacheManifestEntry>;

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Math.random().toString(36).slice(2)}:${Date.now()}`;
}

function getSessionStorageId(key: string, prefix: string) {
  if (typeof window === "undefined") return createId(prefix);
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next = createId(prefix);
  window.sessionStorage.setItem(key, next);
  return next;
}

function readLocalCacheManifest(): LocalCacheManifest {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_MANIFEST_KEY);
    return raw ? (JSON.parse(raw) as LocalCacheManifest) : {};
  } catch {
    return {};
  }
}

function writeLocalCacheManifest(manifest: LocalCacheManifest) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_CACHE_MANIFEST_KEY, JSON.stringify(manifest));
  } catch {
    // Local cache accounting is advisory; IndexedDB durability is the source of truth.
  }
}

function updateLocalCacheManifest(entry: DocumentRuntimeEntry) {
  const manifest = readLocalCacheManifest();
  manifest[entry.contentId] = {
    contentId: entry.contentId,
    indexedDbName: `dg:content:${entry.contentId}`,
    lastAccessedAt: Date.now(),
    dirty: entry.state.localDirty,
    unsyncedUpdateCount: entry.state.unsyncedUpdateCount,
  };
  writeLocalCacheManifest(manifest);
}

function pruneCleanLocalCacheManifestEntries() {
  if (typeof window === "undefined" || !("indexedDB" in window)) return;
  const manifest = readLocalCacheManifest();
  const now = Date.now();
  let changed = false;

  for (const [contentId, entry] of Object.entries(manifest)) {
    if (entry.dirty || entry.unsyncedUpdateCount > 0) continue;
    if (now - entry.lastAccessedAt < LOCAL_CACHE_PRUNE_AFTER_MS) continue;

    try {
      window.indexedDB.deleteDatabase(entry.indexedDbName);
    } catch {
      // Ignore browser storage errors; the manifest cleanup is best effort.
    }
    delete manifest[contentId];
    changed = true;
  }

  if (changed) {
    writeLocalCacheManifest(manifest);
  }
}

export function getCollaborationBrowserSessionId() {
  return getSessionStorageId("dg-collab-session-id", "session");
}

function createConsumerId(
  descriptor: Omit<RuntimeConsumerDescriptor, "consumerId" | "contentId" | "mountedAt">
) {
  return [
    descriptor.surfaceKind,
    descriptor.workspaceId ?? "workspace",
    descriptor.paneId ?? "pane",
    descriptor.tabId ?? "tab",
    descriptor.viewInstanceId,
  ].join(":");
}

function getEditableFieldNames(capability: ContentCollaborationCapability) {
  return capability.fields.filter((field) => field.editable).map((field) => field.field);
}

function deriveEditPolicy(
  state: CollaborationRuntimeState,
  capability: ContentCollaborationCapability
): CollaborationEditPolicy {
  if (capability.syncCapability !== "syncCapable" || !capability.localPersistence) {
    return {
      editable: false,
      reason: "unsupported",
      warning: "This content type does not support local collaborative editing.",
    };
  }

  if (state.authState === "unauthorized") {
    return {
      editable: false,
      reason: "auth-revoked",
      warning: state.warning || "Editing is blocked because access was revoked.",
    };
  }

  if (state.bootstrapState === "failed") {
    return {
      editable: false,
      reason: "bootstrap-failed",
      warning:
        state.warning ||
        "Collaborative editing could not initialize. Showing saved content read-only to prevent overwrite.",
    };
  }

  if (state.readOnly) {
    return {
      editable: false,
      reason: "view-only-permission",
      warning: state.warning || "You have view-only access to this document.",
    };
  }

  if (state.persistenceState !== "localReady" || state.bootstrapState === "pending") {
    return {
      editable: false,
      reason: "booting-local-state",
      warning: state.warning || "Loading local collaborative state before editing is enabled.",
    };
  }

  if (state.networkState === "offline" || state.connectionState === "disconnectedButDirty") {
    return {
      editable: true,
      reason: "offline-local-durable",
      warning:
        state.warning ||
        "Offline editing is active. Changes are saved locally and will sync when collaboration reconnects.",
    };
  }

  return {
    editable: true,
    reason: "local-ready",
    warning: state.warning,
  };
}

function sameEditPolicy(left: CollaborationEditPolicy, right: CollaborationEditPolicy) {
  return (
    left.editable === right.editable &&
    left.reason === right.reason &&
    left.warning === right.warning
  );
}

function base64ToUint8Array(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function getContentCollaborationCapability(
  contentType: string | null | undefined
): ContentCollaborationCapability | null {
  if (contentType === "note") return NOTE_CAPABILITY;
  return null;
}

class CollaborationRuntimeManager {
  private entries = new Map<string, DocumentRuntimeEntry>();
  private browserContextId = getSessionStorageId("dg-collab-browser-context-id", "browser");
  private sessionId = getSessionStorageId("dg-collab-session-id", "session");

  acquire(
    contentId: string,
    capability: ContentCollaborationCapability,
    descriptor: Omit<RuntimeConsumerDescriptor, "consumerId" | "contentId" | "mountedAt">,
    initialContent?: JSONContent | null
  ): CollaborationRuntimeHandle {
    const entry = this.getOrCreateEntry(contentId, capability);
    const consumerId = createConsumerId(descriptor);

    if (entry.idleEvictionTimer) {
      clearTimeout(entry.idleEvictionTimer);
      entry.idleEvictionTimer = null;
    }

    entry.consumers.set(consumerId, {
      ...descriptor,
      consumerId,
      contentId,
      mountedAt: Date.now(),
    });
    entry.lastActivityAt = Date.now();

    if (initialContent) {
      this.seedInitialContent(entry, initialContent);
    }

    this.recalculateLocalSurfaceTopology(entry);
    this.announceBrowserSession(entry);
    this.syncPresenceTransport(entry);
    this.schedulePresenceHeartbeat(entry, 0);
    this.maybePromoteFromCurrentTopology(entry);
    this.emit(entry);

    return this.createHandle(entry, consumerId);
  }

  subscribe(contentId: string, listener: () => void) {
    const entry = this.entries.get(contentId);
    if (!entry) return () => {};
    entry.listeners.add(listener);
    return () => {
      entry.listeners.delete(listener);
    };
  }

  getHandle(contentId: string, consumerId: string): CollaborationRuntimeHandle | null {
    const entry = this.entries.get(contentId);
    if (!entry || !entry.consumers.has(consumerId)) return null;
    return this.createHandle(entry, consumerId);
  }

  markAllUnauthorized(reason: string) {
    for (const entry of this.entries.values()) {
      this.markUnauthorized(entry, reason);
    }
  }

  seed(contentId: string, content: JSONContent | null | undefined) {
    const entry = this.entries.get(contentId);
    if (!entry || !content) return;
    this.seedInitialContent(entry, content);
  }

  private getOrCreateEntry(
    contentId: string,
    capability: ContentCollaborationCapability
  ): DocumentRuntimeEntry {
    const existing = this.entries.get(contentId);
    if (existing) return existing;

    pruneCleanLocalCacheManifestEntries();
    const ydoc = new Y.Doc();
    const indexedDbProvider = new IndexeddbPersistence(`dg:content:${contentId}`, ydoc);
    const entry: DocumentRuntimeEntry = {
      runtimeId: createId(`runtime:${contentId}`),
      contentId,
      capability,
      ydoc,
      indexedDbProvider,
      hocuspocusProvider: null,
      user: null,
      listeners: new Set(),
      consumers: new Map(),
      cooldownTimer: null,
      idleEvictionTimer: null,
      bootstrapSlowTimer: null,
      bootstrapFallbackTimer: null,
      bootstrapAbortController: null,
      sessionAnnounceTimer: null,
      sessionSweepTimer: null,
      presenceHeartbeatTimer: null,
      presenceHeartbeatInFlight: false,
      presenceEventSource: null,
      broadcastChannel: null,
      knownBrowserSessions: new Map(),
      pendingInitialContent: null,
      hasSeededInitialContent: false,
      isBootstrappingInitialContent: false,
      promotionPromise: null,
      authVerificationPromise: null,
      ydocUpdateHandler: null,
      networkOnlineHandler: () => this.handleNetworkOnline(contentId),
      networkOfflineHandler: () => this.handleNetworkOffline(contentId),
      visibilityChangeHandler: () => this.handleVisibilityChange(contentId),
      pageHideHandler: () => this.handlePageHide(contentId),
      lastActivityAt: Date.now(),
      reconnectTimer: null,
      reconnectAttempts: 0,
      state: {
        contentId,
        documentName: `content:${contentId}`,
        userId: "unknown",
        browserContextId: this.browserContextId,
        sessionId: this.sessionId,
        persistenceState: "booting",
        bootstrapState: "pending",
        syncCapability: capability.syncCapability,
        connectionState: "localOnly",
        localSurfaceTopology: "singleSurface",
        browserSessionTopology: "singleSession",
        remoteCollaborationTopology: "solo",
        presenceState: "none",
        networkState:
          typeof navigator === "undefined" || navigator.onLine ? "online" : "offline",
        authState: "unknown",
        consumerCount: 0,
        liveConsumerCount: 0,
        lastKnownServerRevision: null,
        localDirty: false,
        unsyncedUpdateCount: 0,
        reconnectIntent: false,
        readOnly: false,
        warning: null,
        editPolicy: {
          editable: false,
          reason: "booting-local-state",
          warning: "Loading local collaborative state before editing is enabled.",
        },
      },
    };

    entry.ydocUpdateHandler = (_update, _origin, _doc, transaction) => {
      if (!transaction.local || entry.isBootstrappingInitialContent) return;
      if (entry.state.persistenceState !== "localReady") return;

      entry.lastActivityAt = Date.now();
      if (
        entry.state.networkState === "offline" ||
        entry.state.connectionState === "disconnectedButDirty"
      ) {
        entry.state.localDirty = true;
        entry.state.unsyncedUpdateCount = Math.max(entry.state.unsyncedUpdateCount, 1);
        entry.state.reconnectIntent = true;
        entry.state.connectionState = "disconnectedButDirty";
        entry.state.warning =
          "Offline editing is active. Changes are saved locally and will sync when collaboration reconnects.";
        this.emit(entry);
      }
    };
    entry.ydoc.on("update", entry.ydocUpdateHandler);

    indexedDbProvider.whenSynced
      .then(() => {
        entry.state.persistenceState = "localReady";
        void this.bootstrapInitialContent(entry);
        this.emit(entry);
      })
      .catch((error) => {
        this.markBootstrapFailed(
          entry,
          "Local collaborative storage could not be initialized. Editing is blocked to avoid data loss."
        );
        if (process.env.NODE_ENV === "development") {
          console.error(
            "[collaboration] failed to initialize local persistence",
            error instanceof Error ? error.message : error
          );
        }
      });

    this.startBrowserSessionDetection(entry);
    this.startRemotePresenceDetection(entry);
    window.addEventListener("online", entry.networkOnlineHandler);
    window.addEventListener("offline", entry.networkOfflineHandler);
    document.addEventListener("visibilitychange", entry.visibilityChangeHandler);
    window.addEventListener("pagehide", entry.pageHideHandler);
    this.entries.set(contentId, entry);
    updateLocalCacheManifest(entry);
    return entry;
  }

  private seedInitialContent(entry: DocumentRuntimeEntry, content: JSONContent | null | undefined) {
    if (!content || entry.hasSeededInitialContent) return;
    entry.pendingInitialContent = content;
    if (!hasMeaningfulTipTapContent(content)) {
      this.clearBootstrapWatch(entry);
      entry.hasSeededInitialContent = true;
      entry.state.bootstrapState = "ready";
      entry.state.warning = null;
      this.emit(entry);
      return;
    }
    this.startBootstrapWatch(entry);
    if (entry.state.persistenceState !== "localReady") return;
    void this.bootstrapInitialContent(entry);
  }

  private async bootstrapInitialContent(entry: DocumentRuntimeEntry) {
    if (
      entry.hasSeededInitialContent ||
      entry.isBootstrappingInitialContent ||
      entry.state.persistenceState !== "localReady"
    ) {
      return;
    }

    const pendingContentIsMeaningful = hasMeaningfulTipTapContent(
      entry.pendingInitialContent
    );
    const localYdocIsMeaningful = ydocHasMeaningfulDefaultContent(entry.ydoc);

    if (
      localYdocIsMeaningful ||
      (entry.ydoc.getXmlFragment("default").length > 0 && !pendingContentIsMeaningful)
    ) {
      this.clearBootstrapWatch(entry);
      entry.hasSeededInitialContent = true;
      entry.state.bootstrapState = "ready";
      entry.state.warning = null;
      return;
    }

    if (!entry.pendingInitialContent || !pendingContentIsMeaningful) {
      this.clearBootstrapWatch(entry);
      entry.hasSeededInitialContent = true;
      entry.state.bootstrapState = "ready";
      entry.state.warning = null;
      this.emit(entry);
      return;
    }

    entry.isBootstrappingInitialContent = true;
    this.startBootstrapWatch(entry);
    const abortController =
      typeof AbortController === "undefined" ? null : new AbortController();
    entry.bootstrapAbortController = abortController;
    try {
      const canonicalState = await this.fetchCanonicalYDocState(
        entry.contentId,
        abortController?.signal
      );
      if (entry.hasSeededInitialContent) return;

      if (canonicalState.update) {
        if (
          pendingContentIsMeaningful &&
          !ydocUpdateHasMeaningfulDefaultContent(canonicalState.update)
        ) {
          this.markBootstrapFailed(
            entry,
            "Canonical collaboration state is inconsistent with the saved note content. Editing is blocked until the collaboration state is repaired."
          );
          return;
        }
        Y.applyUpdate(entry.ydoc, canonicalState.update);
      } else if (pendingContentIsMeaningful) {
        this.markBootstrapFailed(
          entry,
          "Canonical collaboration state is empty while saved note content exists. Editing is blocked until the collaboration state is repaired."
        );
        return;
      }

      this.clearBootstrapWatch(entry);
      entry.state.documentName = canonicalState.documentName;
      entry.state.readOnly = canonicalState.readOnly;
      entry.hasSeededInitialContent = true;
      entry.state.bootstrapState = "ready";
      entry.state.warning = null;
      return;
    } catch (error) {
      if (entry.hasSeededInitialContent || abortController?.signal.aborted) {
        return;
      }
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[collaboration] using local-only bootstrap fallback",
          error instanceof Error ? error.message : error
        );
      }
      this.bootstrapFromSavedContent(
        entry,
        "Live collaboration bootstrap is unavailable. Editing is using saved local content, but collaboration exclusivity and remote sync are not guaranteed until collaboration reconnects."
      );
    } finally {
      if (entry.bootstrapAbortController === abortController) {
        entry.bootstrapAbortController = null;
      }
      entry.isBootstrappingInitialContent = false;
      this.emit(entry);
    }
  }

  private clearBootstrapWatch(entry: DocumentRuntimeEntry) {
    if (entry.bootstrapSlowTimer) {
      clearTimeout(entry.bootstrapSlowTimer);
      entry.bootstrapSlowTimer = null;
    }
    if (entry.bootstrapFallbackTimer) {
      clearTimeout(entry.bootstrapFallbackTimer);
      entry.bootstrapFallbackTimer = null;
    }
  }

  private startBootstrapWatch(entry: DocumentRuntimeEntry) {
    if (entry.bootstrapSlowTimer || entry.bootstrapFallbackTimer) return;

    entry.bootstrapSlowTimer = setTimeout(() => {
      entry.bootstrapSlowTimer = null;
      if (entry.hasSeededInitialContent || entry.state.bootstrapState !== "pending") {
        return;
      }
      entry.state.warning =
        entry.state.persistenceState === "localReady"
          ? "Collaboration bootstrap is taking longer than expected. Waiting for canonical state before editing is enabled."
          : "Loading local collaborative state is taking longer than expected. Editing remains blocked until local persistence is ready.";
      this.emit(entry);
    }, BOOTSTRAP_SLOW_WARNING_MS);

    entry.bootstrapFallbackTimer = setTimeout(() => {
      entry.bootstrapFallbackTimer = null;
      if (entry.hasSeededInitialContent || entry.state.bootstrapState !== "pending") {
        return;
      }

      if (entry.state.persistenceState !== "localReady") {
        entry.state.warning =
          "Local collaborative persistence is still loading. Editing remains blocked until durable local state is ready.";
        this.emit(entry);
        return;
      }

      if (!entry.pendingInitialContent || !hasMeaningfulTipTapContent(entry.pendingInitialContent)) {
        entry.state.warning =
          "Collaboration bootstrap is still validating document state. Editing remains blocked until the document can be loaded safely.";
        this.emit(entry);
        return;
      }

      entry.bootstrapAbortController?.abort();
      this.bootstrapFromSavedContent(
        entry,
        "Live collaboration bootstrap is taking longer than expected. Editing is using saved local content, but collaboration exclusivity and remote sync are not guaranteed until collaboration reconnects."
      );
    }, BOOTSTRAP_LOCAL_FALLBACK_MS);
  }

  private markBootstrapFailed(entry: DocumentRuntimeEntry, warning: string) {
    this.clearBootstrapWatch(entry);
    entry.state.bootstrapState = "failed";
    entry.state.warning = warning;
    entry.hasSeededInitialContent = false;
    entry.isBootstrappingInitialContent = false;
    this.emit(entry);
  }

  private bootstrapFromSavedContent(entry: DocumentRuntimeEntry, warning: string) {
    if (entry.state.persistenceState !== "localReady") {
      this.markBootstrapFailed(
        entry,
        "Local collaborative persistence is unavailable. Editing is blocked to avoid data loss."
      );
      return;
    }

    const pendingContent = entry.pendingInitialContent;
    if (!pendingContent || !hasMeaningfulTipTapContent(pendingContent)) {
      this.clearBootstrapWatch(entry);
      entry.hasSeededInitialContent = true;
      entry.state.bootstrapState = "ready";
      entry.state.warning = warning;
      this.emit(entry);
      return;
    }

    try {
      const seededDoc = TiptapTransformer.toYdoc(
        pendingContent,
        "default",
        getCollaborationServerExtensions()
      );
      Y.applyUpdate(entry.ydoc, Y.encodeStateAsUpdate(seededDoc));
      seededDoc.destroy();
      this.clearBootstrapWatch(entry);
      entry.hasSeededInitialContent = true;
      entry.state.bootstrapState = "ready";
      entry.state.warning = warning;
    } catch (error) {
      this.markBootstrapFailed(
        entry,
        "Saved note content could not be safely loaded into collaborative state. Editing is blocked to prevent overwrite."
      );
      if (process.env.NODE_ENV === "development") {
        console.error(
          "[collaboration] failed to bootstrap collaborative document",
          error instanceof Error ? error.message : error
        );
      }
      return;
    }
    this.emit(entry);
  }

  private async fetchCanonicalYDocState(contentId: string, signal?: AbortSignal) {
    const response = await fetch("/api/collaboration/state", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ contentId }),
    });
    const result = (await response.json()) as CollaborationStateResponse;
    if (!response.ok || !result.success || !result.data) {
      throw new Error(result.error?.message || "Failed to load collaboration state");
    }
    return {
      documentName: result.data.documentName,
      readOnly: result.data.readOnly,
      update: result.data.update ? base64ToUint8Array(result.data.update) : null,
    };
  }

  private startBrowserSessionDetection(entry: DocumentRuntimeEntry) {
    const storageKey = `dg-collab-session:${entry.contentId}:${this.sessionId}`;

    if ("BroadcastChannel" in window) {
      entry.broadcastChannel = new BroadcastChannel(COLLABORATION_CHANNEL_NAME);
      entry.broadcastChannel.onmessage = (event) => {
        this.handleBroadcastMessage(entry, event.data);
      };
    }

    const handleStorage = (event: StorageEvent) => {
      if (!event.key?.startsWith(`dg-collab-session:${entry.contentId}:`) || !event.newValue) {
        return;
      }
      try {
        this.handleBroadcastMessage(entry, JSON.parse(event.newValue));
      } catch {
        // Ignore malformed localStorage session payloads.
      }
    };

    window.addEventListener("storage", handleStorage);
    entry.sessionAnnounceTimer = setInterval(
      () => this.announceBrowserSession(entry),
      SESSION_ANNOUNCE_INTERVAL_MS
    );
    entry.sessionSweepTimer = setInterval(() => this.sweepBrowserSessions(entry), 1000);
    this.announceBrowserSession(entry);

    const originalDispose = entry.indexedDbProvider.destroy?.bind(entry.indexedDbProvider);
    const disposeSessionDetection = () => {
      window.removeEventListener("storage", handleStorage);
      if (entry.sessionAnnounceTimer) clearInterval(entry.sessionAnnounceTimer);
      if (entry.sessionSweepTimer) clearInterval(entry.sessionSweepTimer);
      entry.broadcastChannel?.close();
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Ignore storage privacy failures.
      }
      originalDispose?.();
    };
    entry.indexedDbProvider.destroy = disposeSessionDetection as typeof entry.indexedDbProvider.destroy;
  }

  private getSelfPresencePayload(entry: DocumentRuntimeEntry): PresenceHeartbeatPayload {
    const consumers = Array.from(entry.consumers.values());
    return {
      contentId: entry.contentId,
      sessionId: this.sessionId,
      browserContextId: this.browserContextId,
      surfaceCount: entry.consumers.size,
      activePaneIds: consumers.flatMap((consumer) =>
        consumer.paneId ? [consumer.paneId] : []
      ),
      activeTabIds: consumers.flatMap((consumer) =>
        consumer.tabId ? [consumer.tabId] : []
      ),
      transportState: entry.state.connectionState,
      lastKnownServerRevision: entry.state.lastKnownServerRevision,
    };
  }

  private announceBrowserSession(entry: DocumentRuntimeEntry, forceZero = false) {
    const storageKey = `dg-collab-session:${entry.contentId}:${this.sessionId}`;
    const selfPresence = this.getSelfPresencePayload(entry);
    const payload = {
      type: "session-announcement",
      ...selfPresence,
      surfaceCount: forceZero ? 0 : selfPresence.surfaceCount,
      activePaneIds: forceZero ? [] : selfPresence.activePaneIds,
      activeTabIds: forceZero ? [] : selfPresence.activeTabIds,
      timestamp: Date.now(),
    };

    entry.broadcastChannel?.postMessage(payload);
    try {
      if (forceZero || entry.consumers.size === 0) {
        localStorage.setItem(storageKey, JSON.stringify(payload));
        window.setTimeout(() => {
          try {
            localStorage.removeItem(storageKey);
          } catch {
            // Ignore storage privacy failures.
          }
        }, 0);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(payload));
      }
    } catch {
      // Ignore storage quota/privacy failures; BroadcastChannel still covers modern browsers.
    }
  }

  private startRemotePresenceDetection(entry: DocumentRuntimeEntry) {
    this.schedulePresenceHeartbeat(entry, 0);
    this.syncPresenceTransport(entry);
  }

  private openPresenceStream(entry: DocumentRuntimeEntry) {
    if (entry.presenceEventSource || entry.consumers.size === 0) return;
    const streamUrl = `/api/collaboration/presence/stream?contentId=${encodeURIComponent(
      entry.contentId
    )}&sessionId=${encodeURIComponent(this.sessionId)}`;
    entry.presenceEventSource = new EventSource(streamUrl, { withCredentials: true });
    entry.presenceEventSource.addEventListener("presence", (event) => {
      this.handleRemotePresence(entry, event as MessageEvent<string>);
    });
    entry.presenceEventSource.onerror = () => {
      // EventSource reconnects automatically. Keep state unchanged to avoid false warnings.
    };
  }

  private closePresenceStream(entry: DocumentRuntimeEntry) {
    entry.presenceEventSource?.close();
    entry.presenceEventSource = null;
  }

  private syncPresenceTransport(entry: DocumentRuntimeEntry) {
    if (!entry.broadcastChannel || this.isPresenceLeader(entry)) {
      this.openPresenceStream(entry);
    } else {
      this.closePresenceStream(entry);
    }
  }

  private getPresenceHeartbeatDelay(entry: DocumentRuntimeEntry) {
    if (entry.state.networkState === "offline") return PRESENCE_HEARTBEAT_HIDDEN_INTERVAL_MS;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return PRESENCE_HEARTBEAT_HIDDEN_INTERVAL_MS;
    }
    if (Date.now() - entry.lastActivityAt > PRESENCE_IDLE_AFTER_MS) {
      return PRESENCE_HEARTBEAT_IDLE_INTERVAL_MS;
    }
    return PRESENCE_HEARTBEAT_INTERVAL_MS;
  }

  private schedulePresenceHeartbeat(entry: DocumentRuntimeEntry, delay?: number) {
    if (entry.presenceHeartbeatTimer) {
      clearTimeout(entry.presenceHeartbeatTimer);
      entry.presenceHeartbeatTimer = null;
    }

    entry.presenceHeartbeatTimer = setTimeout(() => {
      void this.sendPresenceHeartbeat(entry).finally(() => {
        if (this.entries.get(entry.contentId) === entry) {
          this.schedulePresenceHeartbeat(entry);
        }
      });
    }, delay ?? this.getPresenceHeartbeatDelay(entry));
  }

  private isPresenceLeader(entry: DocumentRuntimeEntry) {
    if (entry.consumers.size === 0) return false;
    const activeSessionIds = [
      this.sessionId,
      ...Array.from(entry.knownBrowserSessions.values())
        .filter((session) => session.surfaceCount > 0)
        .map((session) => session.sessionId),
    ].sort();
    return activeSessionIds[0] === this.sessionId;
  }

  private buildPresenceHeartbeatSessions(
    entry: DocumentRuntimeEntry,
    includeZero = false
  ): PresenceHeartbeatPayload[] {
    const self = this.getSelfPresencePayload(entry);
    if (includeZero) return [self];
    if (entry.consumers.size === 0 || !this.isPresenceLeader(entry)) return [];

    return [
      self,
      ...Array.from(entry.knownBrowserSessions.values())
        .map((session) => ({
          contentId: entry.contentId,
          sessionId: session.sessionId,
          browserContextId: session.browserContextId,
          surfaceCount: session.surfaceCount,
          activePaneIds: session.activePaneIds,
          activeTabIds: session.activeTabIds,
          transportState: session.transportState,
          lastKnownServerRevision: session.lastKnownServerRevision,
        })),
    ];
  }

  private async sendPresenceHeartbeat(entry: DocumentRuntimeEntry, includeZero = false) {
    if (entry.state.networkState === "offline" && !includeZero) return;
    if (entry.presenceHeartbeatInFlight) return;
    const sessions = this.buildPresenceHeartbeatSessions(entry, includeZero);
    if (sessions.length === 0) return;

    entry.presenceHeartbeatInFlight = true;
    try {
      await fetch("/api/collaboration/presence/heartbeat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessions }),
      });
    } catch {
      // Presence is advisory. Transport promotion can still happen via BroadcastChannel.
    } finally {
      entry.presenceHeartbeatInFlight = false;
    }
  }

  private sendPresenceCloseBeacon(entry: DocumentRuntimeEntry) {
    const session = {
      ...this.getSelfPresencePayload(entry),
      surfaceCount: 0,
      activePaneIds: [],
      activeTabIds: [],
      transportState: entry.state.connectionState,
    };
    const payload = JSON.stringify({ sessions: [session] });

    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon("/api/collaboration/presence/heartbeat", blob)) {
        return;
      }
    }

    void fetch("/api/collaboration/presence/heartbeat", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Presence close is advisory; stale records are pruned server-side.
    });
  }

  private handleRemotePresence(entry: DocumentRuntimeEntry, event: MessageEvent<string>) {
    try {
      const payload = JSON.parse(event.data) as {
        sessions?: Array<{ sessionId?: string; userId?: string; surfaceCount?: number }>;
      };
      this.applyRemotePresenceSessions(entry, payload.sessions ?? []);
      entry.broadcastChannel?.postMessage({
        type: "remote-presence-snapshot",
        contentId: entry.contentId,
        sessions: payload.sessions ?? [],
        timestamp: Date.now(),
      });
    } catch {
      // Ignore malformed presence events.
    }
  }

  private handleBroadcastMessage(entry: DocumentRuntimeEntry, payload: unknown) {
    if (!payload || typeof payload !== "object") return;
    const message = payload as { type?: string; contentId?: string };
    if (message.type === "remote-presence-snapshot" && message.contentId === entry.contentId) {
      this.applyRemotePresenceSessions(
        entry,
        (payload as { sessions?: Array<{ sessionId?: string; surfaceCount?: number }> }).sessions ??
          []
      );
      return;
    }

    this.handleSessionAnnouncement(entry, payload);
  }

  private applyRemotePresenceSessions(
    entry: DocumentRuntimeEntry,
    sessions: Array<{ sessionId?: string; surfaceCount?: number }>
  ) {
    const remoteSessions = sessions.filter(
      (session) =>
        session.sessionId &&
        session.sessionId !== this.sessionId &&
        (session.surfaceCount ?? 0) > 0
    );

    const nextTopology = remoteSessions.length > 0 ? "remotePresent" : "solo";
    if (entry.state.remoteCollaborationTopology !== nextTopology) {
      entry.state.remoteCollaborationTopology = nextTopology;
      entry.state.presenceState = remoteSessions.length > 0 ? "multiUserPresent" : "selfOnly";
      this.emit(entry);
    }

    if (nextTopology === "remotePresent") {
      void this.promote(entry, "remote-presence");
    } else {
      this.maybeStartCooldown(entry);
    }
  }

  private handleSessionAnnouncement(entry: DocumentRuntimeEntry, payload: unknown) {
    if (!payload || typeof payload !== "object") return;
    const message = payload as {
      type?: string;
      contentId?: string;
      sessionId?: string;
      browserContextId?: string;
      surfaceCount?: number;
      activePaneIds?: string[];
      activeTabIds?: string[];
      transportState?: ConnectionState;
      lastKnownServerRevision?: number | null;
      timestamp?: number;
    };
    if (
      message.type !== "session-announcement" ||
      message.contentId !== entry.contentId ||
      !message.sessionId ||
      message.sessionId === this.sessionId
    ) {
      return;
    }

    if (message.surfaceCount === 0) {
      entry.knownBrowserSessions.set(message.sessionId, {
        sessionId: message.sessionId,
        browserContextId: message.browserContextId ?? message.sessionId,
        surfaceCount: 0,
        activePaneIds: [],
        activeTabIds: [],
        transportState: message.transportState ?? "localOnly",
        lastKnownServerRevision:
          typeof message.lastKnownServerRevision === "number"
            ? message.lastKnownServerRevision
            : null,
        lastSeenAt: message.timestamp ?? Date.now(),
      });
      this.sweepBrowserSessions(entry);
      this.syncPresenceTransport(entry);
      if (this.isPresenceLeader(entry)) {
        void this.sendPresenceHeartbeat(entry);
      }
      return;
    }

    entry.knownBrowserSessions.set(message.sessionId, {
      sessionId: message.sessionId,
      browserContextId: message.browserContextId ?? message.sessionId,
      surfaceCount: Math.max(0, Number(message.surfaceCount ?? 0)),
      activePaneIds: Array.isArray(message.activePaneIds) ? message.activePaneIds : [],
      activeTabIds: Array.isArray(message.activeTabIds) ? message.activeTabIds : [],
      transportState: message.transportState ?? "localOnly",
      lastKnownServerRevision:
        typeof message.lastKnownServerRevision === "number"
          ? message.lastKnownServerRevision
          : null,
      lastSeenAt: message.timestamp ?? Date.now(),
    });
    if (entry.state.browserSessionTopology !== "multiSession") {
      entry.state.browserSessionTopology = "multiSession";
      this.emit(entry);
    }
    this.syncPresenceTransport(entry);
    this.maybePromoteFromCurrentTopology(entry);
  }

  private sweepBrowserSessions(entry: DocumentRuntimeEntry) {
    const now = Date.now();
    for (const [sessionId, session] of entry.knownBrowserSessions) {
      if (now - session.lastSeenAt > SESSION_STALE_AFTER_MS) {
        entry.knownBrowserSessions.delete(sessionId);
      }
    }

    const nextTopology =
      Array.from(entry.knownBrowserSessions.values()).some(
        (session) => session.surfaceCount > 0
      )
        ? "multiSession"
        : "singleSession";
    if (entry.state.browserSessionTopology !== nextTopology) {
      entry.state.browserSessionTopology = nextTopology;
      this.emit(entry);
      if (nextTopology === "singleSession") {
        this.maybeStartCooldown(entry);
      }
    }
    this.syncPresenceTransport(entry);
  }

  private recalculateLocalSurfaceTopology(entry: DocumentRuntimeEntry) {
    entry.state.consumerCount = entry.consumers.size;
    entry.state.liveConsumerCount = Array.from(entry.consumers.values()).filter(
      (consumer) => consumer.requiresLiveTransport
    ).length;
    entry.state.localSurfaceTopology =
      entry.consumers.size > 1 ? "multiSurface" : "singleSurface";
    entry.hocuspocusProvider?.awareness?.setLocalStateField(
      "activeSurfaceCount",
      entry.consumers.size
    );
  }

  private maybePromoteFromCurrentTopology(entry: DocumentRuntimeEntry) {
    if (
      entry.state.browserSessionTopology === "multiSession" ||
      entry.state.remoteCollaborationTopology === "remotePresent" ||
      entry.state.reconnectIntent ||
      entry.state.liveConsumerCount > 0
    ) {
      void this.promote(entry, "browser-multi-session");
    }
  }

  private async promote(entry: DocumentRuntimeEntry, reason: PromotionReason) {
    if (entry.reconnectTimer && reason !== "explicit-live-workflow") {
      return entry.promotionPromise ?? Promise.resolve();
    }
    if (entry.reconnectTimer && reason === "explicit-live-workflow") {
      this.clearProviderReconnect(entry);
    }

    if (entry.hocuspocusProvider) {
      if (
        entry.state.networkState === "online" &&
        (entry.state.connectionState === "disconnectedButDirty" ||
          entry.state.connectionState === "localOnly")
      ) {
        entry.state.connectionState = "connecting";
        entry.hocuspocusProvider.connect();
        this.emit(entry);
      }
      return entry.promotionPromise ?? Promise.resolve();
    }

    if (entry.promotionPromise) {
      return entry.promotionPromise ?? Promise.resolve();
    }
    if (entry.state.authState === "unauthorized") return;
    if (entry.state.syncCapability !== "syncCapable" || !entry.capability.promotionAllowed) return;

    entry.promotionPromise = this.promoteInternal(entry, reason).finally(() => {
      entry.promotionPromise = null;
    });
    return entry.promotionPromise;
  }

  private async promoteInternal(entry: DocumentRuntimeEntry, reason: PromotionReason) {
    void reason;
    entry.state.connectionState = "promoting";
    entry.state.warning = null;
    this.emit(entry);

    let tokenResponse: { response: Response; result: CollaborationTokenResponse | null };
    try {
      tokenResponse = await this.fetchCollaborationToken(entry);
    } catch (error) {
      this.markTransportUnavailable(
        entry,
        error instanceof Error ? error.message : "Live collaboration is temporarily unavailable."
      );
      return;
    }

    const { response, result } = tokenResponse;
    if (!response.ok || !result?.success || !result.data) {
      const message = result?.error?.message || "Failed to initialize collaboration";
      if (response.status === 401 || response.status === 403) {
        this.markUnauthorized(entry, message);
      } else {
        this.markTransportUnavailable(entry, message);
      }
      return;
    }

    this.applyAuthorizedToken(entry, result.data);
    entry.state.connectionState = "connecting";
    this.emit(entry);

    if (entry.hocuspocusProvider) {
      entry.hocuspocusProvider.connect();
      return;
    }

    entry.hocuspocusProvider = new HocuspocusProvider({
      url: result.data.websocketUrl,
      name: result.data.documentName,
      token: result.data.token,
      document: entry.ydoc,
      onStatus: ({ status }) => {
        if (status === "connecting") {
          entry.state.connectionState = "connecting";
        } else if (status === "connected") {
          entry.state.connectionState = "connected";
        } else if (status === "disconnected") {
          this.handleProviderDisconnected(entry);
        }
        this.emit(entry);
      },
      onSynced: ({ state }) => {
        if (!state) return;
        this.clearProviderReconnect(entry);
        entry.state.connectionState = "synced";
        entry.state.warning = null;
        entry.state.reconnectIntent = false;
        entry.state.localDirty = false;
        entry.state.unsyncedUpdateCount = 0;
        this.emit(entry);
      },
      onUnsyncedChanges: ({ number }) => {
        entry.state.unsyncedUpdateCount = number;
        entry.state.localDirty = number > 0;
        this.emit(entry);
      },
      onAwarenessChange: () => this.updateProviderPresence(entry),
      onAwarenessUpdate: () => this.updateProviderPresence(entry),
      onStateless: ({ payload }) => this.handleServerEvent(entry, payload),
      onAuthenticationFailed: ({ reason }) => this.handleAuthenticationFailed(entry, reason),
      onClose: () => this.handleProviderDisconnected(entry),
    });
    entry.hocuspocusProvider.awareness?.setLocalStateField(
      "activeSurfaceCount",
      entry.consumers.size
    );
    this.emit(entry);
  }

  private async fetchCollaborationToken(entry: DocumentRuntimeEntry) {
    const response = await fetch("/api/collaboration/token", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentId: entry.contentId,
        requestedFields: getEditableFieldNames(entry.capability),
      }),
    });

    return {
      response,
      result: await readJsonResponse<CollaborationTokenResponse>(response),
    };
  }

  private applyAuthorizedToken(
    entry: DocumentRuntimeEntry,
    data: NonNullable<CollaborationTokenResponse["data"]>
  ) {
    entry.user = data.user ?? {
      name: "Collaborator",
      color: "#c4a15a",
    };
    entry.state.authState = "authorized";
    entry.state.readOnly = Boolean(data.readOnly);
    entry.state.documentName = data.documentName;
    entry.state.lastKnownServerRevision = data.revision ?? null;
  }

  private updateProviderPresence(entry: DocumentRuntimeEntry) {
    const states = entry.hocuspocusProvider?.awareness?.getStates();
    const hasRemote = Boolean(
      states && Array.from(states.keys()).some((clientId) => clientId !== entry.ydoc.clientID)
    );
    entry.state.presenceState = hasRemote ? "multiUserPresent" : "selfOnly";
    entry.state.remoteCollaborationTopology = hasRemote ? "remotePresent" : "solo";
    this.emit(entry);
    if (!hasRemote) {
      this.maybeStartCooldown(entry);
    }
  }

  private handleServerEvent(entry: DocumentRuntimeEntry, payload: string) {
    try {
      const message = JSON.parse(payload) as { type?: string; message?: string };
      if (message.type === "collaboration-access-revoked") {
        this.handlePotentialAccessRevocation(
          entry,
          message.message || "Collaboration access may have changed."
        );
      }
    } catch {
      // Ignore unrelated stateless provider messages.
    }
  }

  private handlePotentialAccessRevocation(entry: DocumentRuntimeEntry, reason: string) {
    const browserOffline = typeof navigator !== "undefined" && !navigator.onLine;
    if (entry.state.networkState === "offline" || browserOffline) {
      entry.state.networkState = "offline";
      this.markTransportUnavailable(entry);
      return;
    }

    if (entry.authVerificationPromise) return;

    entry.authVerificationPromise = this.verifyAuthenticationFailure(entry, reason).finally(() => {
      entry.authVerificationPromise = null;
    });
  }

  private markUnauthorized(entry: DocumentRuntimeEntry, reason?: string) {
    this.clearProviderReconnect(entry);
    this.destroyProviderOnly(entry);
    entry.state.authState = "unauthorized";
    entry.state.readOnly = true;
    entry.state.connectionState = "localOnly";
    entry.state.reconnectIntent = false;
    entry.state.warning =
      entry.state.localDirty || entry.state.unsyncedUpdateCount > 0
        ? "Access changed before local edits could sync. Your local collaborative cache is preserved, but remote sync is blocked."
        : reason || "Collaboration access was revoked.";
    this.emit(entry);
  }

  private markTransportUnavailable(entry: DocumentRuntimeEntry, reason?: string) {
    this.destroyProviderOnly(entry);
    entry.state.connectionState = "disconnectedButDirty";
    entry.state.reconnectIntent = true;
    entry.state.warning =
      entry.state.networkState === "offline" ||
      (typeof navigator !== "undefined" && !navigator.onLine)
        ? "Offline editing is active. Changes are saved locally and will sync when collaboration reconnects."
        : reason ||
          "Live collaboration is temporarily unavailable. Local edits are durable and will sync when collaboration reconnects.";
    this.emit(entry);
    this.scheduleProviderReconnect(entry, "reconnect-after-offline");
  }

  private handleAuthenticationFailed(entry: DocumentRuntimeEntry, reason?: string) {
    const browserOffline = typeof navigator !== "undefined" && !navigator.onLine;
    if (entry.state.networkState === "offline" || browserOffline) {
      entry.state.networkState = "offline";
      this.markTransportUnavailable(entry, reason);
      return;
    }

    if (entry.authVerificationPromise) return;

    entry.authVerificationPromise = this.verifyAuthenticationFailure(entry, reason).finally(() => {
      entry.authVerificationPromise = null;
    });
  }

  private async verifyAuthenticationFailure(entry: DocumentRuntimeEntry, reason?: string) {
    const verification = await this.verifyCollaborationAccess(entry, reason);

    if (verification.status === "unauthorized") {
      this.markUnauthorized(entry, verification.reason);
      return;
    }

    if (verification.status === "authorized") {
      this.applyAuthorizedToken(entry, verification.data);
      if (verification.data.readOnly) {
        entry.state.warning = "You have view-only access to this document.";
        this.emit(entry);
        return;
      }
      this.markTransportUnavailable(
        entry,
        "Live collaboration authentication could not be completed. Local edits remain durable and will sync after reconnect."
      );
      return;
    }

    this.markTransportUnavailable(entry, verification.reason);
  }

  private async verifyCollaborationAccess(
    entry: DocumentRuntimeEntry,
    reason?: string
  ): Promise<CollaborationAccessVerification> {
    try {
      const { response, result } = await this.fetchCollaborationToken(entry);
      const serverMessage = result?.error?.message;

      if (response.status === 401 || response.status === 403) {
        return {
          status: "unauthorized",
          reason: serverMessage || reason || "Collaboration access was revoked.",
        };
      }

      if (response.ok && result?.success && result.data) {
        return { status: "authorized", data: result.data };
      }

      return {
        status: "transient",
        reason:
          serverMessage ||
          "Live collaboration authentication could not be verified. Local edits remain durable and will sync after reconnect.",
      };
    } catch (error) {
      return {
        status: "transient",
        reason:
          error instanceof Error
            ? error.message
            : "Live collaboration is temporarily unavailable.",
      };
    }
  }

  private clearProviderReconnect(entry: DocumentRuntimeEntry) {
    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
      entry.reconnectTimer = null;
    }
    entry.reconnectAttempts = 0;
  }

  private shouldReconnectProvider(entry: DocumentRuntimeEntry) {
    return (
      entry.consumers.size > 0 &&
      entry.state.networkState === "online" &&
      entry.state.authState !== "unauthorized" &&
      (entry.state.reconnectIntent ||
        entry.state.browserSessionTopology === "multiSession" ||
        entry.state.remoteCollaborationTopology === "remotePresent" ||
        entry.state.liveConsumerCount > 0)
    );
  }

  private scheduleProviderReconnect(entry: DocumentRuntimeEntry, reason: PromotionReason) {
    if (entry.reconnectTimer || entry.hocuspocusProvider || entry.promotionPromise) return;
    if (!this.shouldReconnectProvider(entry)) return;

    const exponentialDelay = Math.min(
      PROVIDER_RECONNECT_MAX_MS,
      PROVIDER_RECONNECT_BASE_MS * 2 ** entry.reconnectAttempts
    );
    const jitter = Math.floor(Math.random() * Math.min(1000, exponentialDelay));
    entry.reconnectAttempts += 1;
    entry.reconnectTimer = setTimeout(() => {
      entry.reconnectTimer = null;
      if (this.shouldReconnectProvider(entry)) {
        void this.promote(entry, reason);
      }
    }, exponentialDelay + jitter);
  }

  private handleProviderDisconnected(entry: DocumentRuntimeEntry) {
    if (entry.state.localDirty || entry.state.unsyncedUpdateCount > 0) {
      entry.state.connectionState = "disconnectedButDirty";
      entry.state.reconnectIntent = true;
      entry.state.warning =
        "Live collaboration is unavailable. Local edits are durable and will sync when the collaboration server reconnects.";
    } else if (entry.hocuspocusProvider) {
      entry.state.connectionState = "localOnly";
    }
    this.emit(entry);
    this.scheduleProviderReconnect(entry, "reconnect-after-offline");
  }

  private handleNetworkOnline(contentId: string) {
    const entry = this.entries.get(contentId);
    if (!entry) return;
    entry.state.networkState = "online";
    entry.lastActivityAt = Date.now();
    this.schedulePresenceHeartbeat(entry, 0);
    this.syncPresenceTransport(entry);
    this.emit(entry);
    if (
      entry.state.reconnectIntent ||
      entry.state.browserSessionTopology === "multiSession" ||
      entry.state.remoteCollaborationTopology === "remotePresent"
    ) {
      void this.promote(entry, "reconnect-after-offline");
    }
  }

  private handleNetworkOffline(contentId: string) {
    const entry = this.entries.get(contentId);
    if (!entry) return;
    entry.state.networkState = "offline";
    this.clearProviderReconnect(entry);
    this.closePresenceStream(entry);
    this.schedulePresenceHeartbeat(entry);
    if (entry.hocuspocusProvider) {
      entry.state.connectionState = "disconnectedButDirty";
      entry.state.reconnectIntent = true;
      entry.state.warning =
        "Offline editing is active. Changes are saved locally and will sync when collaboration reconnects.";
    }
    this.emit(entry);
  }

  private handleVisibilityChange(contentId: string) {
    const entry = this.entries.get(contentId);
    if (!entry) return;
    this.schedulePresenceHeartbeat(entry);
    this.syncPresenceTransport(entry);
  }

  private handlePageHide(contentId: string) {
    const entry = this.entries.get(contentId);
    if (!entry || entry.consumers.size === 0) return;
    this.announceBrowserSession(entry, true);
    this.sendPresenceCloseBeacon(entry);
  }

  private maybeStartCooldown(entry: DocumentRuntimeEntry) {
    if (!entry.hocuspocusProvider || entry.state.connectionState !== "synced") return;
    if (
      entry.state.remoteCollaborationTopology !== "solo" ||
      entry.state.browserSessionTopology !== "singleSession"
    ) {
      return;
    }

    if (entry.cooldownTimer) clearTimeout(entry.cooldownTimer);
    entry.state.connectionState = "coolingDown";
    this.emit(entry);

    entry.cooldownTimer = setTimeout(() => {
      entry.cooldownTimer = null;
      if (this.canDemoteProvider(entry)) {
        this.destroyProviderOnly(entry);
        entry.state.connectionState = "localOnly";
      } else {
        entry.state.connectionState = entry.hocuspocusProvider ? "synced" : "localOnly";
      }
      this.emit(entry);
    }, COOLDOWN_MS);
  }

  private canDemoteProvider(entry: DocumentRuntimeEntry) {
    return (
      entry.state.remoteCollaborationTopology === "solo" &&
      entry.state.browserSessionTopology === "singleSession" &&
      entry.state.consumerCount === 0 &&
      entry.state.liveConsumerCount === 0 &&
      entry.state.unsyncedUpdateCount === 0 &&
      !entry.state.localDirty &&
      !entry.state.reconnectIntent &&
      entry.state.networkState === "online"
    );
  }

  private release(contentId: string, consumerId: string) {
    const entry = this.entries.get(contentId);
    if (!entry) return;

    entry.consumers.delete(consumerId);
    this.recalculateLocalSurfaceTopology(entry);
    this.announceBrowserSession(entry);
    this.syncPresenceTransport(entry);

    if (entry.consumers.size === 0) {
      void this.sendPresenceHeartbeat(entry, true);
      this.maybeStartCooldown(entry);
      if (entry.idleEvictionTimer) clearTimeout(entry.idleEvictionTimer);
      entry.idleEvictionTimer = setTimeout(() => this.evictIfIdle(contentId), IDLE_EVICTION_MS);
    }

    this.emit(entry);
  }

  private evictIfIdle(contentId: string) {
    const entry = this.entries.get(contentId);
    if (!entry || entry.consumers.size > 0) return;
    if (entry.state.localDirty || entry.state.unsyncedUpdateCount > 0) return;

    this.destroyProviderOnly(entry);
    this.clearBootstrapWatch(entry);
    entry.bootstrapAbortController?.abort();
    entry.bootstrapAbortController = null;
    entry.indexedDbProvider.destroy?.();
    if (entry.presenceHeartbeatTimer) clearTimeout(entry.presenceHeartbeatTimer);
    this.closePresenceStream(entry);
    if (entry.ydocUpdateHandler) {
      entry.ydoc.off("update", entry.ydocUpdateHandler);
    }
    entry.ydoc.destroy();
    window.removeEventListener("online", entry.networkOnlineHandler);
    window.removeEventListener("offline", entry.networkOfflineHandler);
    document.removeEventListener("visibilitychange", entry.visibilityChangeHandler);
    window.removeEventListener("pagehide", entry.pageHideHandler);
    if (entry.cooldownTimer) clearTimeout(entry.cooldownTimer);
    this.clearProviderReconnect(entry);
    this.entries.delete(contentId);
  }

  private destroyProviderOnly(entry: DocumentRuntimeEntry) {
    const provider = entry.hocuspocusProvider;
    entry.hocuspocusProvider = null;
    provider?.destroy();
  }

  private refreshEditPolicy(entry: DocumentRuntimeEntry) {
    const nextPolicy = deriveEditPolicy(entry.state, entry.capability);
    if (!sameEditPolicy(entry.state.editPolicy, nextPolicy)) {
      entry.state.editPolicy = nextPolicy;
    }
  }

  private createHandle(
    entry: DocumentRuntimeEntry,
    consumerId: string
  ): CollaborationRuntimeHandle {
    this.refreshEditPolicy(entry);
    return {
      runtimeId: entry.runtimeId,
      contentId: entry.contentId,
      ydoc: entry.ydoc,
      provider: entry.hocuspocusProvider,
      state: { ...entry.state },
      capability: entry.capability,
      user: entry.user,
      promote: (reason) => this.promote(entry, reason),
      updateConsumer: (patch) => {
        const current = entry.consumers.get(consumerId);
        if (!current) return;
        entry.consumers.set(consumerId, { ...current, ...patch });
        entry.lastActivityAt = Date.now();
        this.recalculateLocalSurfaceTopology(entry);
        this.announceBrowserSession(entry);
        this.syncPresenceTransport(entry);
        this.maybePromoteFromCurrentTopology(entry);
        this.emit(entry);
      },
      release: () => this.release(entry.contentId, consumerId),
    };
  }

  private emit(entry: DocumentRuntimeEntry) {
    this.refreshEditPolicy(entry);
    updateLocalCacheManifest(entry);
    for (const listener of entry.listeners) {
      listener();
    }
  }
}

export const collaborationRuntimeManager = new CollaborationRuntimeManager();

export function useCollaborationRuntime({
  contentId,
  capability,
  descriptor,
  initialContent,
}: UseCollaborationRuntimeOptions) {
  const consumerIdRef = useRef<string | null>(null);
  const [handle, setHandle] = useState<CollaborationRuntimeHandle | null>(null);
  const descriptorKey = useMemo(
    () =>
      [
        descriptor.surfaceKind,
        descriptor.workspaceId ?? "",
        descriptor.paneId ?? "",
        descriptor.tabId ?? "",
        descriptor.viewInstanceId,
        descriptor.requiresEditableField ?? "",
        descriptor.requiresLiveTransport ? "live" : "local",
      ].join("|"),
    [descriptor]
  );

  useEffect(() => {
    if (!contentId || !capability || capability.syncCapability !== "syncCapable") {
      setHandle(null);
      return;
    }

    const acquired = collaborationRuntimeManager.acquire(
      contentId,
      capability,
      descriptor,
      initialContent
    );
    consumerIdRef.current = createConsumerId(descriptor);
    setHandle(acquired);

    const unsubscribe = collaborationRuntimeManager.subscribe(contentId, () => {
      const consumerId = consumerIdRef.current;
      if (!consumerId) return;
      setHandle(collaborationRuntimeManager.getHandle(contentId, consumerId));
    });

    return () => {
      unsubscribe();
      acquired.release();
      consumerIdRef.current = null;
      setHandle(null);
    };
    // descriptorKey intentionally captures the descriptor fields used for consumer identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentId, capability?.contentType, descriptorKey]);

  useEffect(() => {
    if (!contentId || !initialContent) return;
    collaborationRuntimeManager.seed(contentId, initialContent);
  }, [contentId, initialContent]);

  return handle;
}
