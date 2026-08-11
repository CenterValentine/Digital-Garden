/**
 * Run Inspector admin API contracts — shared by the route handlers
 * (app/api/admin/ai-runs/) and the admin UI. Types only: client-safe,
 * no Prisma.
 */

import type {
  ConversationDiagnostics,
  InspectorAnomalyKind,
} from "./types";

export const AI_RUNS_PAGE_SIZE = 25;

/** One conversation row in the inspector list view. */
export interface AiRunSummary {
  conversationId: string;
  title?: string;
  ownerEmail?: string;
  createdAt: string;
  updatedAt: string;
  assistantTurns: number;
  /** Distinct "providerId/modelId" stamps seen on assistant turns. */
  models: string[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    requestCount: number;
  };
  findings: { error: number; warning: number };
  /** Unique anomaly kinds present, for badge rendering. */
  findingKinds: InspectorAnomalyKind[];
}

export interface AiRunListData {
  rows: AiRunSummary[];
  page: number;
  pageSize: number;
  /**
   * More conversations exist beyond this page. Computed BEFORE the
   * has-anomaly filter, so with that filter active a further page may
   * turn out empty — acceptable for owner tooling.
   */
  hasMore: boolean;
}

/** Raw persisted message, passed through for the detail view's JSON viewer. */
export interface AiRunRawMessage {
  id: string;
  role: string;
  providerId?: string | null;
  modelId?: string | null;
  createdAt: string;
  isHidden: boolean;
  parts: unknown;
  metadata?: unknown;
}

export interface AiRunDetailData {
  conversation: {
    id: string;
    title?: string;
    ownerEmail?: string;
    createdAt: string;
    updatedAt: string;
    associations: { contentNodeId: string; source: string }[];
  };
  diagnostics: ConversationDiagnostics;
  messages: AiRunRawMessage[];
}
