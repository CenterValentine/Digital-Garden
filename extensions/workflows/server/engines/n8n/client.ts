import { logger } from "@/lib/core/logger";

import type {
  N8nExecutionSummary,
  N8nWorkflow,
  N8nWorkflowSummary,
} from "./types";

/**
 * n8n REST client (public API v1). Server-only. Authenticates with the n8n
 * API key AND, because the n8n instance sits behind Cloudflare Access, a CF
 * Access service token. All four values come from env; the client reports
 * "not configured" (rather than throwing) when the key vars are absent so the
 * engine can be listed-but-disabled until the box is wired up.
 *
 * Env:
 *   N8N_BASE_URL             e.g. https://n8n.davidvalentine.org
 *   N8N_API_KEY              Settings → n8n API → Create API key
 *   CF_ACCESS_CLIENT_ID      Cloudflare Access service token (optional if no Access)
 *   CF_ACCESS_CLIENT_SECRET
 */

export interface N8nClientConfig {
  baseUrl: string;
  apiKey: string;
  cfAccessClientId?: string;
  cfAccessClientSecret?: string;
}

const REQUEST_TIMEOUT_MS = 20_000;

export function readN8nConfig(): N8nClientConfig | null {
  const baseUrl = process.env.N8N_BASE_URL?.trim();
  const apiKey = process.env.N8N_API_KEY?.trim();
  if (!baseUrl || !apiKey) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    cfAccessClientId: process.env.CF_ACCESS_CLIENT_ID?.trim() || undefined,
    cfAccessClientSecret: process.env.CF_ACCESS_CLIENT_SECRET?.trim() || undefined,
  };
}

export function isN8nConfigured(): boolean {
  return readN8nConfig() !== null;
}

export class N8nRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string
  ) {
    super(message);
    this.name = "N8nRequestError";
  }
}

function authHeaders(config: N8nClientConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "X-N8N-API-KEY": config.apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (config.cfAccessClientId && config.cfAccessClientSecret) {
    headers["CF-Access-Client-Id"] = config.cfAccessClientId;
    headers["CF-Access-Client-Secret"] = config.cfAccessClientSecret;
  }
  return headers;
}

async function n8nFetch<T>(
  path: string,
  init: { method: string; body?: unknown }
): Promise<T> {
  const config = readN8nConfig();
  if (!config) {
    throw new Error(
      "n8n is not configured (set N8N_BASE_URL and N8N_API_KEY). See docs/notes-feature/infrastructure/HOME-SERVER.md."
    );
  }

  const url = `${config.baseUrl}/api/v1${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      headers: authHeaders(config),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    logger.error({
      layer: "route",
      event: "n8n_client:network_error",
      summary: error instanceof Error ? error.message : String(error),
      attrs: { path, method: init.method },
    });
    throw new Error(`n8n request failed (network): ${init.method} ${path}`);
  }

  const text = await response.text();
  if (!response.ok) {
    logger.warn({
      layer: "route",
      event: "n8n_client:http_error",
      summary: `${response.status} on ${init.method} ${path}`,
      attrs: { status: response.status },
    });
    throw new N8nRequestError(
      `n8n API ${response.status} on ${init.method} ${path}`,
      response.status,
      text.slice(0, 500)
    );
  }

  return (text ? JSON.parse(text) : {}) as T;
}

/** n8n wraps single-resource responses as `{ data: ... }` on some endpoints. */
function unwrap<T>(payload: T | { data: T }): T {
  return payload && typeof payload === "object" && "data" in payload
    ? (payload as { data: T }).data
    : (payload as T);
}

export async function createN8nWorkflow(
  workflow: N8nWorkflow
): Promise<N8nWorkflowSummary> {
  const result = await n8nFetch<N8nWorkflowSummary | { data: N8nWorkflowSummary }>(
    "/workflows",
    { method: "POST", body: workflow }
  );
  return unwrap(result);
}

export async function updateN8nWorkflow(
  workflowId: string,
  workflow: N8nWorkflow
): Promise<N8nWorkflowSummary> {
  const result = await n8nFetch<N8nWorkflowSummary | { data: N8nWorkflowSummary }>(
    `/workflows/${encodeURIComponent(workflowId)}`,
    { method: "PUT", body: workflow }
  );
  return unwrap(result);
}

export async function getN8nWorkflow(
  workflowId: string
): Promise<N8nWorkflowSummary | null> {
  try {
    const result = await n8nFetch<N8nWorkflowSummary | { data: N8nWorkflowSummary }>(
      `/workflows/${encodeURIComponent(workflowId)}`,
      { method: "GET" }
    );
    return unwrap(result);
  } catch (error) {
    if (error instanceof N8nRequestError && error.status === 404) return null;
    throw error;
  }
}

export async function setN8nWorkflowActive(
  workflowId: string,
  active: boolean
): Promise<void> {
  await n8nFetch(
    `/workflows/${encodeURIComponent(workflowId)}/${active ? "activate" : "deactivate"}`,
    { method: "POST" }
  );
}

export async function deleteN8nWorkflow(workflowId: string): Promise<void> {
  try {
    await n8nFetch(`/workflows/${encodeURIComponent(workflowId)}`, {
      method: "DELETE",
    });
  } catch (error) {
    if (error instanceof N8nRequestError && error.status === 404) return;
    throw error;
  }
}

export async function getN8nExecution(
  executionId: string
): Promise<N8nExecutionSummary | null> {
  try {
    const result = await n8nFetch<
      N8nExecutionSummary | { data: N8nExecutionSummary }
    >(`/executions/${encodeURIComponent(executionId)}`, { method: "GET" });
    return unwrap(result);
  } catch (error) {
    if (error instanceof N8nRequestError && error.status === 404) return null;
    throw error;
  }
}
