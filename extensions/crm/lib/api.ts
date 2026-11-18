/**
 * CRM client fetchers. CRM-specific routes live under /api/crm; plain field
 * edits go to the database's own rows route, exactly as the grid does.
 */

import type { CrmWorkspaceSnapshot } from "@/lib/domain/crm/model";
import type { CrmTerms } from "@/lib/domain/crm/config";

export interface CrmBusinessSummary {
  folderId: string;
  name: string;
  terms: CrmTerms;
}

export interface CrmEventResult {
  duplicate: boolean;
  contactId: string;
  messageId: string;
  opportunityId: string | null;
  matchReason: string;
  paused: boolean;
  automationDetail: string | null;
}

export class CrmApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => null)) as
    | { success: boolean; data?: T; error?: { message?: string } }
    | null;
  if (!res.ok || !body?.success) {
    throw new CrmApiError(body?.error?.message ?? `Request failed (${res.status})`, res.status);
  }
  return body.data as T;
}

export const crmApi = {
  businesses: () => call<CrmBusinessSummary[]>("/api/crm/businesses"),
  createBusiness: (input: { name: string; presetId: string; parentId?: string | null }) =>
    call<{ folderId: string }>("/api/crm/businesses", { method: "POST", body: JSON.stringify(input) }),
  workspace: (folderId: string) => call<CrmWorkspaceSnapshot>(`/api/crm/${folderId}`),
  saveDraft: (folderId: string, input: { contactId: string; opportunityId: string | null; body: string }) =>
    call<{ draftId: string | null }>(`/api/crm/${folderId}/drafts`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  setStage: (folderId: string, input: { opportunityId: string; stageId: string }) =>
    call<{ changed: boolean }>(`/api/crm/${folderId}/stage`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  sendEvent: (
    folderId: string,
    event: { type: "message.received"; eventId: string; from: string; body: string; receivedAt?: string }
  ) =>
    call<CrmEventResult>(`/api/crm/${folderId}/events`, {
      method: "POST",
      body: JSON.stringify(event),
    }),
  /** The database's own cell write — same route and access check as the grid. */
  writeCell: async (tableId: string, rowId: string, columnKey: string, value: unknown) => {
    // Not `call`: a refused write answers success:false with the reason in
    // data.results (400 invalid, 409 stale), not in `error`.
    const res = await fetch(`/api/content/data/${tableId}/rows`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ writes: [{ rowId, columnKey, value }] }),
    });
    const body = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: { results?: Array<{ status: string; message?: string }> };
      error?: { message?: string };
    } | null;
    if (res.ok && body?.success) return;
    const failed = body?.data?.results?.find((r) => r.status !== "applied");
    throw new CrmApiError(
      failed?.status === "stale"
        ? "Someone else changed this field — reload to see their value."
        : (failed?.message ?? body?.error?.message ?? "The value was not saved"),
      res.status
    );
  },
};
