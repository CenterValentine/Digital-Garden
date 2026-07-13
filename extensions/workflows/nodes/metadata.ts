/**
 * Node palette metadata — CLIENT-SAFE (no Prisma, no executors). The builder
 * renders palettes and config forms from these specs; the server registry
 * (nodes/registry.ts) supplies the executors and enforces configs via
 * buildConfigSchema over the same field specs.
 *
 * `execution: "step"` nodes run as retryable WDK steps; `"control"` nodes
 * (gate/delay/branch) are handled at the interpreter's workflow level
 * because they use suspension primitives or pure routing.
 */

export type NodeConfigFieldKind =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "json";

export interface NodeConfigField {
  key: string;
  label: string;
  kind: NodeConfigFieldKind;
  required?: boolean;
  placeholder?: string;
  /** Field accepts {{nodeId.path}} / {{input.path}} templates. */
  interpolated?: boolean;
  options?: Array<{ value: string; label: string }>;
  help?: string;
}

export interface NodeTypeMetadata {
  id: string;
  label: string;
  description: string;
  execution: "step" | "control" | "trigger";
  fields: NodeConfigField[];
  /** Output keys the node contributes to ctx (builder hints + docs). */
  outputs: Array<{ key: string; description: string }>;
}

export const NODE_TYPE_METADATA: NodeTypeMetadata[] = [
  {
    id: "ai-complete",
    label: "AI Complete",
    description:
      "Run a prompt through your configured AI connections (BYOK routing with fallbacks).",
    execution: "step",
    fields: [
      {
        key: "system",
        label: "System prompt",
        kind: "textarea",
        placeholder: "You are a helpful analyst…",
      },
      {
        key: "prompt",
        label: "Prompt",
        kind: "textarea",
        required: true,
        interpolated: true,
        placeholder: "Analyze this listing: {{fetch.text}}",
      },
      {
        key: "expectJson",
        label: "Expect JSON response",
        kind: "boolean",
        help: "Parses the response into the node's `json` output.",
      },
      { key: "maxOutputTokens", label: "Max output tokens", kind: "number" },
    ],
    outputs: [
      { key: "text", description: "Raw model response" },
      { key: "json", description: "Parsed object when Expect JSON is on" },
    ],
  },
  {
    id: "gate",
    label: "Supervision Gate",
    description:
      "Pause until you approve or decline from the inbox or run detail. Free while waiting.",
    execution: "control",
    fields: [
      {
        key: "title",
        label: "Title",
        kind: "text",
        required: true,
        interpolated: true,
        placeholder: "Review ready — {{match.json.score}}% fit",
      },
      {
        key: "body",
        label: "Details",
        kind: "textarea",
        interpolated: true,
      },
    ],
    outputs: [
      { key: "approved", description: "true when approved" },
      { key: "conversationId", description: "Linked chat, when opened in chat" },
    ],
  },
  {
    id: "branch",
    label: "Branch (if/else)",
    description:
      "Route to the true or false edge based on an upstream value. False edge is optional (run ends).",
    execution: "control",
    fields: [
      {
        key: "path",
        label: "Value path",
        kind: "text",
        required: true,
        placeholder: "gate.approved",
        help: "Dot path into a node output or input (no braces).",
      },
      {
        key: "operator",
        label: "Operator",
        kind: "select",
        required: true,
        options: [
          { value: "truthy", label: "is truthy" },
          { value: "equals", label: "equals" },
          { value: "notEquals", label: "does not equal" },
          { value: "gt", label: "greater than" },
          { value: "gte", label: "at least" },
          { value: "lt", label: "less than" },
          { value: "lte", label: "at most" },
          { value: "contains", label: "contains" },
        ],
      },
      {
        key: "value",
        label: "Comparison value",
        kind: "text",
        help: "Ignored for 'is truthy'. Numbers compare numerically.",
      },
    ],
    outputs: [{ key: "result", description: "The evaluated boolean" }],
  },
  {
    id: "delay",
    label: "Delay",
    description: "Suspend the run for a duration. Costs nothing while sleeping.",
    execution: "control",
    fields: [
      {
        key: "duration",
        label: "Duration",
        kind: "text",
        required: true,
        placeholder: "30m, 2h, 1d",
      },
    ],
    outputs: [],
  },
  {
    id: "fetch-url",
    label: "Fetch URL",
    description:
      "Fetch a web page server-side and extract its readable text (15s timeout).",
    execution: "step",
    fields: [
      {
        key: "url",
        label: "URL",
        kind: "text",
        required: true,
        interpolated: true,
        placeholder: "{{input.pageUrl}}",
      },
    ],
    outputs: [{ key: "text", description: "Extracted page text" }],
  },
  {
    id: "http-request",
    label: "HTTP Request",
    description:
      "Call an external API (http/https, 15s timeout, 1MB response cap).",
    execution: "step",
    fields: [
      {
        key: "url",
        label: "URL",
        kind: "text",
        required: true,
        interpolated: true,
      },
      {
        key: "method",
        label: "Method",
        kind: "select",
        required: true,
        options: [
          { value: "GET", label: "GET" },
          { value: "POST", label: "POST" },
          { value: "PUT", label: "PUT" },
          { value: "PATCH", label: "PATCH" },
          { value: "DELETE", label: "DELETE" },
        ],
      },
      { key: "headers", label: "Headers", kind: "json" },
      {
        key: "body",
        label: "Body",
        kind: "textarea",
        interpolated: true,
      },
      { key: "expectJson", label: "Parse JSON response", kind: "boolean" },
    ],
    outputs: [
      { key: "status", description: "HTTP status code" },
      { key: "text", description: "Response body text" },
      { key: "json", description: "Parsed body when Parse JSON is on" },
    ],
  },
  {
    id: "get-content",
    label: "Get Content",
    description: "Read the text of a note in your garden.",
    execution: "step",
    fields: [
      {
        key: "contentNodeId",
        label: "Note",
        kind: "text",
        required: true,
        interpolated: true,
        placeholder: "{{input.captureNodeId}}",
        help: "A ContentNode id (often from the dispatch input).",
      },
    ],
    outputs: [{ key: "text", description: "The note's text" }],
  },
  {
    id: "store-content",
    label: "Store Note",
    description: "Create a note in your Workflows folder from text.",
    execution: "step",
    fields: [
      {
        key: "title",
        label: "Title",
        kind: "text",
        required: true,
        interpolated: true,
      },
      {
        key: "body",
        label: "Body",
        kind: "textarea",
        required: true,
        interpolated: true,
      },
    ],
    outputs: [{ key: "contentNodeId", description: "The created note's id" }],
  },
  {
    id: "export-docx",
    label: "Export Word Document",
    description:
      "Generate a .docx from text and file it in your Workflows folder as a run artifact.",
    execution: "step",
    fields: [
      {
        key: "title",
        label: "Document title",
        kind: "text",
        required: true,
        interpolated: true,
      },
      {
        key: "body",
        label: "Document body",
        kind: "textarea",
        required: true,
        interpolated: true,
        help: "Blank lines split paragraphs; lines starting with # become headings.",
      },
    ],
    outputs: [
      { key: "contentNodeId", description: "The stored document's id" },
      { key: "fileName", description: "The .docx file name" },
    ],
  },
  {
    id: "notify",
    label: "Notify",
    description: "Send yourself an inbox notification.",
    execution: "step",
    fields: [
      {
        key: "title",
        label: "Title",
        kind: "text",
        required: true,
        interpolated: true,
      },
      { key: "body", label: "Body", kind: "textarea", interpolated: true },
    ],
    outputs: [],
  },
  {
    id: "call-workflow",
    label: "Call Workflow",
    description:
      "Run another Trellis workflow (fire-and-forget). It must have a 'Called by another workflow' trigger.",
    execution: "step",
    fields: [
      {
        key: "workflowNodeId",
        label: "Workflow id",
        kind: "text",
        required: true,
        interpolated: true,
        help: "The ContentNode id of the workflow to call.",
      },
      {
        key: "input",
        label: "Input to pass",
        kind: "json",
        help: "Object handed to the called workflow's {{input.*}}.",
      },
    ],
    outputs: [{ key: "childRunId", description: "The started child run id" }],
  },
];

export const NODE_TYPE_IDS = NODE_TYPE_METADATA.map((node) => node.id);

export function getNodeTypeMetadata(id: string): NodeTypeMetadata | null {
  return NODE_TYPE_METADATA.find((node) => node.id === id) ?? null;
}
