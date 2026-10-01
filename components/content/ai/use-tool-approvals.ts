"use client";

/**
 * Per-tool approval toggles (§10 round 6c) — ONE list and ONE write path for
 * both surfaces that show them (Chat controls and Settings → AI), so they
 * cannot drift. Writes `ai.toolConfig[<id>].autoApprove` through the settings
 * store, always as an explicit true/false (the PATCH deep-merges).
 * Semantics live in lib/domain/ai/tools/approval-policy.ts.
 */

import { useSettingsStore } from "@/state/settings-store";
import type { AutoApprovableTool } from "@/lib/domain/ai/tools/approval-policy";

type ToolConfigEntry = { enabled?: boolean; autoApprove?: boolean; routeOverride?: { presetId: string; modelId: string } };

export const TOOL_APPROVAL_ROWS: ReadonlyArray<{ id: AutoApprovableTool; label: string; hint: string }> = [
  {
    id: "create_docx",
    label: "Auto-approve documents",
    hint: "Create Word documents without asking. Rewriting a document this chat made also skips the card; overwriting any file that existed before the chat still asks.",
  },
  {
    id: "create_note",
    label: "Auto-approve notes",
    hint: "Create new notes without asking. Rewrites that would remove most of an existing note still ask.",
  },
  {
    id: "phase_checkpoint",
    label: "Auto-close final checkpoint",
    hint: "A charter's last checkpoint records the run and closes without a pause. Checkpoints between phases still ask — they are where you review before the next phase.",
  },
];

export function useToolApprovals() {
  const toolConfig = (useSettingsStore((state) => state.ai?.toolConfig) ?? {}) as Record<string, ToolConfigEntry | undefined>;
  const setAISettings = useSettingsStore((state) => state.setAISettings);
  const set = (id: AutoApprovableTool, on: boolean) => {
    const next: Record<string, ToolConfigEntry> = {};
    for (const [key, value] of Object.entries(toolConfig)) if (value) next[key] = value;
    // ALWAYS explicit: the settings PATCH deep-merges, and a merge cannot
    // delete a key — removing `autoApprove` to switch it off would leave the
    // stored `true` in place and the toggle could never be turned off (the
    // same trap the tool table's `enabled` hit, 2026-08-28).
    next[id] = { ...(next[id] ?? {}), autoApprove: on };
    return setAISettings({ toolConfig: next });
  };
  return TOOL_APPROVAL_ROWS.map((row) => ({
    ...row,
    checked: toolConfig[row.id]?.autoApprove === true,
    onChange: (on: boolean) => set(row.id, on),
  }));
}
