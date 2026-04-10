import { parse } from "chrono-node";
import type { CalendarQuickAddDraft } from "./types";

const FALLBACK_EVENT_DURATION_MS = 60 * 60 * 1000;

function trimOrNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function parseCalendarQuickAdd(input: {
  text?: string | null;
  linkedContentId?: string | null;
  sourceId?: string | null;
  timezone?: string | null;
}): CalendarQuickAddDraft {
  const text = trimOrNull(input.text) || "";
  const parsed = parse(text, new Date(), {
    forwardDate: true,
  });

  const result = parsed[0];
  const startAt = result?.start?.date() ?? null;
  const endAt = result?.end?.date() ?? (startAt ? new Date(startAt.getTime() + FALLBACK_EVENT_DURATION_MS) : null);

  let title = text;
  if (result) {
    title = text.replace(result.text, "").replace(/\s+/g, " ").trim() || result.text;
  }

  return {
    title: title || "New event",
    startAt: startAt ? startAt.toISOString() : null,
    endAt: endAt ? endAt.toISOString() : null,
    allDay: Boolean(result && !result.start.isCertain("hour")),
    timezone: input.timezone || null,
    description: text || null,
    linkedContentId: input.linkedContentId || null,
    sourceId: input.sourceId || null,
  };
}
