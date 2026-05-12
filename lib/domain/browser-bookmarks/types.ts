import type { ExternalReadingStatus } from "@/lib/database/generated/prisma";

export const BROWSER_BOOKMARKS_API_VERSION = "2026-04-30";
export const BROWSER_BOOKMARKS_SCOPE = "bookmarks:sync";

export type BrowserSyncSourceSystem = "browser" | "app";
export type BrowserSyncNodeKind = "folder" | "bookmark";
export type BrowserSyncMutationType =
  | "create"
  | "update"
  | "move"
  | "delete";
export type BrowserSyncRoutingMode = "rule-engine" | "explicit";
export type BrowserSyncContentType =
  | "folder"
  | "external"
  | "html"
  | "note"
  | "file"
  | "unknown";

export interface BrowserBookmarksCapabilityResponse {
  apiVersion: string;
  extensionId: string;
  supports: {
    tokenAuth: boolean;
    connections: boolean;
    bootstrap: boolean;
    push: boolean;
    pull: boolean;
    readingQueue: boolean;
    preserveHtml: boolean;
    noteText: boolean;
    descriptionField: boolean;
    resourceClassification: boolean;
    optionalSidePanel: boolean;
    trustedInstalls: boolean;
  };
}

export interface BrowserBookmarkPreferences {
  resourceTypes: string[];
  resourceRelationships: string[];
  userIntents: string[];
}

export interface BrowserExtensionTokenRecord {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface BrowserExtensionTokenCreateResponse {
  token: string;
  record: BrowserExtensionTokenRecord;
}

export interface BrowserExtensionInstallRecord {
  id: string;
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
  tokenId: string;
}

export interface BrowserExtensionInstallTrustResponse {
  token: string;
  install: BrowserExtensionInstallRecord;
}

export interface BookmarkSyncConnectionRecord {
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
  lastPulledAt: string | null;
  lastPushedAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalBookmarkMetadata {
  url: string;
  normalizedUrl: string | null;
  canonicalUrl: string | null;
  subtype: string;
  readingStatus: ExternalReadingStatus;
  description: string | null;
  resourceType: string | null;
  resourceRelationship: string | null;
  userIntent: string | null;
  sourceDomain: string | null;
  sourceHostname: string | null;
  faviconUrl: string | null;
  preserveHtml: boolean;
  noteText: string | null;
  tags: string[];
  preview: Record<string, unknown>;
  captureMetadata: Record<string, unknown>;
  matchMetadata: Record<string, unknown>;
  preservedHtmlSnapshot: Record<string, unknown> | null;
  preservedHtmlCapturedAt: string | null;
}

export interface BrowserSyncNodeRecord {
  contentId: string;
  chromeNodeId: string | null;
  parentContentId: string | null;
  parentChromeNodeId: string | null;
  nodeKind: BrowserSyncNodeKind;
  contentType: BrowserSyncContentType;
  payloadShape: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  folder?: {
    childCount: number;
  };
  external?: ExternalBookmarkMetadata;
}

export interface BookmarkSyncBootstrapResponse {
  connection: BookmarkSyncConnectionRecord;
  cursor: string;
  nodes: BrowserSyncNodeRecord[];
}

export interface BrowserSyncMutation {
  mutationType: BrowserSyncMutationType;
  nodeKind: BrowserSyncNodeKind;
  contentType: BrowserSyncContentType;
  payloadShape: string;
  sourceSystem: BrowserSyncSourceSystem;
  observedAt: string;
  connectionId: string;
  routingMode: BrowserSyncRoutingMode;
  chromeNodeId?: string | null;
  parentChromeNodeId?: string | null;
  title?: string | null;
  url?: string | null;
  canonicalUrl?: string | null;
  faviconUrl?: string | null;
  readingStatus?: ExternalReadingStatus | null;
  description?: string | null;
  resourceType?: string | null;
  resourceRelationship?: string | null;
  userIntent?: string | null;
  tags?: string[];
  dedupeEnabled?: boolean;
  domainIntelligenceEnabled?: boolean;
  noteText?: string | null;
  preserveHtml?: boolean;
  preservedHtmlSnapshot?: Record<string, unknown> | null;
  captureMetadata?: Record<string, unknown>;
  matchMetadata?: Record<string, unknown>;
}

export interface BrowserSyncMutationResult {
  mutationType: BrowserSyncMutationType;
  chromeNodeId: string | null;
  contentId: string | null;
  status: "applied" | "skipped" | "errored";
  message?: string;
}

export interface BrowserSyncPushResponse {
  connection: BookmarkSyncConnectionRecord;
  cursor: string;
  results: BrowserSyncMutationResult[];
}

export interface BrowserSyncPullResponse {
  connection: BookmarkSyncConnectionRecord;
  cursor: string;
  deltas: Array<{
    mutationType: BrowserSyncMutationType;
    node: BrowserSyncNodeRecord;
  }>;
}

export interface BrowserReadingQueueItem {
  contentId: string;
  title: string;
  parentId: string | null;
  updatedAt: string;
  external: ExternalBookmarkMetadata;
}

export interface BrowserBookmarksRulesExport {
  version: 1;
  exportedAt: string;
  nativeSaveBehavior: "silent-defaults" | "auto-open-follow-up";
  defaults: Record<string, unknown>;
  dedupeDefaults: Record<string, unknown>;
  routingRules: Array<Record<string, unknown>>;
  connections: Array<{
    name: string;
    chromeRootTitle: string;
  }>;
}
