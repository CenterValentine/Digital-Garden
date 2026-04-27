import type { JSONContent } from "@tiptap/core";
import { v4 as uuid } from "uuid";

import { getDefaultPeriodicSummaryDate } from "@/lib/domain/periodic-summary";

export type PeriodicSummaryTemplateDateMode = "refresh" | "preserve";

interface InstantiateTemplateContentOptions {
  now?: Date;
  regenerateBlockIds?: boolean;
  periodicSummaryDates?: {
    daily?: string;
    weekly?: string;
  };
}

function instantiateNode(
  node: JSONContent,
  options: InstantiateTemplateContentOptions
): JSONContent {
  const nextNode: JSONContent = {
    ...node,
  };

  if (node.attrs && typeof node.attrs === "object") {
    const attrs = { ...node.attrs } as Record<string, unknown>;

    if (options.regenerateBlockIds && typeof attrs.blockId === "string") {
      attrs.blockId = uuid();
    }

    if (node.type === "dailySummary") {
      const mode =
        attrs.templateDateMode === "preserve" ? "preserve" : "refresh";
      const cutoffHour =
        typeof attrs.workdayCutoffHour === "number"
          ? attrs.workdayCutoffHour
          : Number(attrs.workdayCutoffHour ?? 0);
      if (mode === "refresh") {
        attrs.summaryDate =
          options.periodicSummaryDates?.daily ??
          getDefaultPeriodicSummaryDate("daily", options.now, cutoffHour);
      }
    }

    if (node.type === "weeklySummary") {
      const mode =
        attrs.templateDateMode === "preserve" ? "preserve" : "refresh";
      const cutoffHour =
        typeof attrs.workdayCutoffHour === "number"
          ? attrs.workdayCutoffHour
          : Number(attrs.workdayCutoffHour ?? 0);
      if (mode === "refresh") {
        attrs.weekStartDate =
          options.periodicSummaryDates?.weekly ??
          getDefaultPeriodicSummaryDate("weekly", options.now, cutoffHour);
      }
    }

    nextNode.attrs = attrs;
  }

  if (node.content) {
    nextNode.content = node.content.map((child) =>
      instantiateNode(child, options)
    );
  }

  return nextNode;
}

export function instantiateTemplateContent(
  content: JSONContent,
  options: InstantiateTemplateContentOptions = {}
): JSONContent {
  return instantiateNode(content, {
    now: options.now ?? new Date(),
    regenerateBlockIds: options.regenerateBlockIds ?? true,
    periodicSummaryDates: options.periodicSummaryDates,
  });
}
