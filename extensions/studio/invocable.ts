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
] as const;

export function isChatInvocable(toolId: string): boolean {
  return (CHAT_INVOCABLE_TOOL_IDS as readonly string[]).includes(toolId);
}
