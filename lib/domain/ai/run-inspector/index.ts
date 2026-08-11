/**
 * Run Inspector — read-side diagnostics over persisted AI conversations.
 * Pure analysis only; the admin API (app/api/admin/ai-runs/) does the data
 * access, the admin UI does the rendering.
 */

export { analyzeConversation, analyzeTurn } from "./analyze";
export { deriveInspectorFindings } from "./anomalies";
export {
  CLIENT_EXECUTED_TOOL_NAMES,
  inferRequestCount,
  isClientExecutedTool,
} from "./segments";
export type {
  AnalyzableMessage,
  ConversationDiagnostics,
  InspectorAnomalyKind,
  InspectorFinding,
  InspectorOnlyAnomalyKind,
  MetadataGeneration,
  StepDiagnostics,
  ToolCallDiagnostics,
  TurnDiagnostics,
  TurnUsage,
} from "./types";
