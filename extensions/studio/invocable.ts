/**
 * Which studio tools are live as chat invocations. Pure data — imported by
 * both the client tiles (enablement) and the server prompt composer
 * (validation), so it must stay free of React and Prisma.
 */

export const CHAT_INVOCABLE_TOOL_IDS = [
  "report",
  "mind-map",
  "glossary",
  "compare",
  "prerequisites",
  "flashcards",
  // Practice shelf (Phase 7) — graded sessions run IN the conversation.
  "quiz",
  "teach-back",
  "oral-exam",
  "study-plan",
] as const;

/** Job tools whose executor is registered in server/runs.ts. */
export const JOB_INVOCABLE_TOOL_IDS = [
  "infographic",
  "audio-overview",
  "slide-deck",
] as const;

export function isChatInvocable(toolId: string): boolean {
  return (CHAT_INVOCABLE_TOOL_IDS as readonly string[]).includes(toolId);
}

export function isJobInvocable(toolId: string): boolean {
  return (JOB_INVOCABLE_TOOL_IDS as readonly string[]).includes(toolId);
}

export function isInvocable(toolId: string): boolean {
  return isChatInvocable(toolId) || isJobInvocable(toolId);
}
