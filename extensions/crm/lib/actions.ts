/**
 * CRM operator actions — optimistic where the result is certain, then a
 * refetch so every view settles on what the server stored.
 */

import { toast } from "sonner";
import { crmApi, type CrmEventResult } from "./api";
import { useCrmStore } from "../state/crm-store";

function reload(folderId: string) {
  return useCrmStore.getState().load(folderId);
}

function fail(error: unknown, fallback: string) {
  toast.error(error instanceof Error ? error.message : fallback);
}

/** A field edit through the database's own rows route (gate instructions, notes…). */
export async function commitCrmCell(
  folderId: string,
  tableId: string,
  rowId: string,
  columnKey: string,
  value: unknown
): Promise<boolean> {
  const undo = useCrmStore.getState().patchCell(folderId, tableId, rowId, columnKey, value);
  try {
    await crmApi.writeCell(tableId, rowId, columnKey, value);
    await reload(folderId);
    return true;
  } catch (error) {
    undo();
    fail(error, "The change was not saved");
    return false;
  }
}

export async function changeCrmStage(
  folderId: string,
  input: { opportunityId: string; stageId: string; tableId: string; columnKey: string }
): Promise<void> {
  const undo = useCrmStore
    .getState()
    .patchCell(folderId, input.tableId, input.opportunityId, input.columnKey, input.stageId);
  try {
    await crmApi.setStage(folderId, { opportunityId: input.opportunityId, stageId: input.stageId });
    await reload(folderId);
  } catch (error) {
    undo();
    fail(error, "The stage was not changed");
  }
}

export async function saveCrmDraft(
  folderId: string,
  input: { contactId: string; opportunityId: string | null; body: string }
): Promise<boolean> {
  try {
    await crmApi.saveDraft(folderId, input);
    await reload(folderId);
    toast.success(input.body.trim() ? "Draft saved" : "Draft cleared");
    return true;
  } catch (error) {
    fail(error, "The draft was not saved");
    return false;
  }
}

/** The local simulator's inbound text — the same route n8n will post to. */
export async function simulateIncomingText(
  folderId: string,
  event: { eventId: string; from: string; body: string }
): Promise<CrmEventResult | null> {
  try {
    const result = await crmApi.sendEvent(folderId, { type: "message.received", ...event });
    await reload(folderId);
    return result;
  } catch (error) {
    fail(error, "The simulated text was not delivered");
    return null;
  }
}
