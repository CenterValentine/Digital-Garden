/**
 * Trigger node metadata — CLIENT-SAFE. A trigger is the single privileged
 * entry node ("initiating connector"): exactly one per graph, always the
 * entry, `execution: "trigger"`. It declares WHAT starts the workflow and
 * WHAT it deposits into {{input.*}} — the rest of the graph reads that.
 *
 * Firing status per type:
 * - manual / page-capture / called: WIRED (dispatch paths exist)
 * - content-event / schedule / periodic-note / calendar-event /
 *   activity-event: node + config real; automatic FIRING is stubbed while
 *   those source features mature (see BACKLOG). They run fine via manual
 *   dispatch today.
 */

import {
  getNodeTypeMetadata,
  type NodeConfigField,
  type NodeTypeMetadata,
} from "./metadata";

export interface TriggerTypeMetadata extends NodeTypeMetadata {
  execution: "trigger";
  /** Whether automatic firing is wired, or manual-dispatch-only for now. */
  firing: "wired" | "stubbed";
}

/** Activity kinds a workflow may target — curated client-safe subset of the
 * server notification registry (workflow.* excluded to avoid trivial loops). */
export const TARGETABLE_ACTIVITY_KINDS: Array<{ value: string; label: string }> =
  [
    { value: "connection.invite", label: "Connection invite received" },
    { value: "connection.accepted", label: "Connection accepted" },
    { value: "dm.message", label: "Direct message received" },
    { value: "system.announcement", label: "System announcement" },
  ];

const PERIODIC_CADENCES: NodeConfigField["options"] = [
  { value: "daily", label: "Daily note" },
  { value: "weekly", label: "Weekly note" },
  { value: "monthly", label: "Monthly note" },
  { value: "quarterly", label: "Quarterly note" },
  { value: "yearly", label: "Yearly note" },
];

export const TRIGGER_TYPE_METADATA: TriggerTypeMetadata[] = [
  {
    id: "trigger-manual",
    label: "Manual",
    description: "Start on demand from the Run button. Declares the run form.",
    execution: "trigger",
    firing: "wired",
    fields: [
      {
        key: "inputs",
        label: "Input fields",
        kind: "textarea",
        placeholder: "pageUrl\ncompanyName",
        help: "One field name per line. Each becomes a Run-form field and {{input.<name>}}.",
      },
    ],
    outputs: [{ key: "*", description: "Each declared input field" }],
  },
  {
    id: "trigger-page-capture",
    label: "Page Capture",
    description:
      "Start from the browser extension on a matching web page. Auto-routes by URL.",
    execution: "trigger",
    firing: "wired",
    fields: [
      {
        key: "urlPattern",
        label: "URL pattern",
        kind: "text",
        placeholder: "*.greenhouse.io/* , linkedin.com/jobs/*",
        help: "Comma-separated globs. Blank matches any page. The extension routes a capture to the best-matching workflow.",
      },
    ],
    outputs: [
      { key: "pageUrl", description: "Captured page URL" },
      { key: "pageTitle", description: "Page title" },
      { key: "captureNodeId", description: "The stored capture note id" },
    ],
  },
  {
    id: "trigger-called",
    label: "Called by another workflow",
    description: "Runs when a Call Workflow step in another Trellis invokes it.",
    execution: "trigger",
    firing: "wired",
    fields: [],
    outputs: [{ key: "*", description: "Whatever the caller passes" }],
  },
  {
    id: "trigger-content-event",
    label: "Content Event (preview)",
    description:
      "Start when a note is created or updated in a folder. Automatic firing is coming soon.",
    execution: "trigger",
    firing: "stubbed",
    fields: [
      {
        key: "folderId",
        label: "Folder id",
        kind: "text",
        help: "Watch this folder (blank = anywhere).",
      },
      {
        key: "event",
        label: "Event",
        kind: "select",
        options: [
          { value: "created", label: "Note created" },
          { value: "updated", label: "Note updated" },
        ],
      },
    ],
    outputs: [{ key: "contentNodeId", description: "The affected note id" }],
  },
  {
    id: "trigger-schedule",
    label: "Schedule (preview)",
    description: "Start on a cron schedule. Automatic firing is coming soon.",
    execution: "trigger",
    firing: "stubbed",
    fields: [
      {
        key: "cron",
        label: "Cron expression",
        kind: "text",
        placeholder: "0 9 * * 1",
        help: "e.g. 0 9 * * 1 = Mondays 9am.",
      },
    ],
    outputs: [{ key: "firedAt", description: "ISO timestamp" }],
  },
  {
    id: "trigger-periodic-note",
    label: "Periodic Note (preview)",
    description:
      "Start when a daily/weekly note is created. Automatic firing is coming soon.",
    execution: "trigger",
    firing: "stubbed",
    fields: [
      {
        key: "cadence",
        label: "Cadence",
        kind: "select",
        required: true,
        options: PERIODIC_CADENCES,
      },
    ],
    outputs: [
      { key: "noteId", description: "The periodic note id" },
      { key: "periodKey", description: "YYYY-MM-DD period key" },
    ],
  },
  {
    id: "trigger-calendar-event",
    label: "Calendar Event (preview)",
    description:
      "Start relative to a calendar event. Automatic firing is coming soon.",
    execution: "trigger",
    firing: "stubbed",
    fields: [
      {
        key: "leadMinutes",
        label: "Minutes before event",
        kind: "number",
        placeholder: "30",
      },
    ],
    outputs: [
      { key: "eventTitle", description: "Event title" },
      { key: "startsAt", description: "Event start ISO timestamp" },
    ],
  },
  {
    id: "trigger-activity-event",
    label: "Inbox Event (preview)",
    description:
      "Start when something happens in your inbox. Automatic firing is coming soon.",
    execution: "trigger",
    firing: "stubbed",
    fields: [
      {
        key: "kind",
        label: "Event kind",
        kind: "select",
        required: true,
        options: TARGETABLE_ACTIVITY_KINDS,
      },
    ],
    outputs: [
      { key: "actorLabel", description: "Who/what acted" },
      { key: "subjectId", description: "The event subject id" },
    ],
  },
];

export const TRIGGER_TYPE_IDS = TRIGGER_TYPE_METADATA.map((t) => t.id);

export function isTriggerType(typeId: string): boolean {
  return typeId.startsWith("trigger-");
}

export function getTriggerTypeMetadata(
  id: string
): TriggerTypeMetadata | null {
  return TRIGGER_TYPE_METADATA.find((t) => t.id === id) ?? null;
}

/** Parse a Manual trigger's declared input field names. */
export function parseManualInputFields(config: Record<string, unknown>): string[] {
  const raw = typeof config.inputs === "string" ? config.inputs : "";
  return raw
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter((line) => /^[a-zA-Z0-9_]+$/.test(line));
}

/** Resolve either a step or a trigger node's metadata. */
export function getAnyNodeMetadata(
  typeId: string
): NodeTypeMetadata | TriggerTypeMetadata | null {
  return isTriggerType(typeId)
    ? getTriggerTypeMetadata(typeId)
    : getNodeTypeMetadata(typeId);
}
