/**
 * AI-context engine settings — the two knobs the refresh engine reads.
 *
 * Identifier-stability wrinkle (plan → D2): the values are STORED under the
 * `settings.studio.*` keys — the layer was incubated in Folder Studio and the
 * settings surface (`/settings/extensions/studio`) still owns the UI. This
 * reader gives the domain layer its own import path so the dependency arrow
 * stays extension → domain. Relocating the storage keys is backlogged.
 *
 * Client-safe (no Prisma). `extensions/studio/settings.ts` remains the full
 * studio normalizer (tool defaults etc.) and re-uses `AutoContextMode` from
 * here.
 */

import type { UserSettings } from "@/lib/features/settings/validation";
import { DEFAULT_SETTINGS } from "@/lib/features/settings/validation";

export type AutoContextMode = "off" | "on-access" | "on-access-sweep";

export interface AiContextSettings {
  autoContextMode: AutoContextMode;
  /** Daily ceiling on auto-context generation calls (engine-enforced). */
  dailyCallCap: number;
}

export const AI_CONTEXT_SETTINGS_DEFAULTS: AiContextSettings = {
  autoContextMode: DEFAULT_SETTINGS.studio?.autoContextMode ?? "on-access",
  dailyCallCap: DEFAULT_SETTINGS.studio?.dailyCallCap ?? 200,
};

export function getAiContextSettings(
  settings: Pick<UserSettings, "studio"> | null | undefined
): AiContextSettings {
  const stored = settings?.studio;
  return {
    autoContextMode:
      stored?.autoContextMode ?? AI_CONTEXT_SETTINGS_DEFAULTS.autoContextMode,
    dailyCallCap:
      stored?.dailyCallCap ?? AI_CONTEXT_SETTINGS_DEFAULTS.dailyCallCap,
  };
}
