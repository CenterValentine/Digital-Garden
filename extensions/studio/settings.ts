/**
 * Studio settings normalization — client-safe (no Prisma).
 *
 * Mirrors the periodic-notes pattern: the zod schema keeps every field
 * optional, DEFAULT_SETTINGS carries the canonical defaults, and this
 * normalizer is the single place both the dialog UI and the server-side
 * consumers (refresh engine, run executors, prompt composer) resolve a
 * complete settings object from a possibly-partial stored one.
 */

import type { UserSettings } from "@/lib/features/settings/validation";
import { DEFAULT_SETTINGS } from "@/lib/features/settings/validation";

export type AutoContextMode = "off" | "on-access" | "on-access-sweep";
export type AudioOverviewLength = "brief" | "standard";

export interface StudioSettings {
  autoContextMode: AutoContextMode;
  reportDefaultVariant: string;
  quizQuestionCount: number;
  audioOverviewLength: AudioOverviewLength;
  slideCount: number;
}

export const STUDIO_SETTINGS_DEFAULTS: StudioSettings = {
  autoContextMode: DEFAULT_SETTINGS.studio?.autoContextMode ?? "on-access",
  reportDefaultVariant:
    DEFAULT_SETTINGS.studio?.reportDefaultVariant ?? "study-guide",
  quizQuestionCount: DEFAULT_SETTINGS.studio?.quizQuestionCount ?? 8,
  audioOverviewLength:
    DEFAULT_SETTINGS.studio?.audioOverviewLength ?? "standard",
  slideCount: DEFAULT_SETTINGS.studio?.slideCount ?? 12,
};

export function getStudioSettings(
  settings: Pick<UserSettings, "studio"> | null | undefined
): StudioSettings {
  const stored = settings?.studio;
  return {
    autoContextMode:
      stored?.autoContextMode ?? STUDIO_SETTINGS_DEFAULTS.autoContextMode,
    reportDefaultVariant:
      stored?.reportDefaultVariant?.trim() ||
      STUDIO_SETTINGS_DEFAULTS.reportDefaultVariant,
    quizQuestionCount:
      stored?.quizQuestionCount ?? STUDIO_SETTINGS_DEFAULTS.quizQuestionCount,
    audioOverviewLength:
      stored?.audioOverviewLength ??
      STUDIO_SETTINGS_DEFAULTS.audioOverviewLength,
    slideCount: stored?.slideCount ?? STUDIO_SETTINGS_DEFAULTS.slideCount,
  };
}
