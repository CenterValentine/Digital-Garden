/**
 * Appearance Settings
 *
 * Theme preference (System / Light / Dark). Instant-apply: selecting an
 * option persists through the settings store immediately.
 */

"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import {
  RadioCardGroup,
  SavedIndicator,
  SettingSection,
  SettingsPage,
  useSaveTracker,
} from "@/components/settings/ui";
import { cn } from "@/lib/core/utils";
import {
  useResolvedTheme,
  useThemePreference,
  type ThemePreference,
} from "@/lib/features/theme";
import { useSettingsStore } from "@/state/settings-store";

const THEME_OPTIONS = [
  {
    value: "system" as ThemePreference,
    title: "System",
    description: "Match your operating system's color scheme automatically.",
    icon: <Monitor className="h-4 w-4" />,
  },
  {
    value: "light" as ThemePreference,
    title: "Light",
    description: "Always use the light theme regardless of OS preference.",
    icon: <Sun className="h-4 w-4" />,
  },
  {
    value: "dark" as ThemePreference,
    title: "Dark",
    description: "Always use the dark theme regardless of OS preference.",
    icon: <Moon className="h-4 w-4" />,
  },
];

export default function AppearanceSettingsPage() {
  const themePreference = useThemePreference();
  const resolvedTheme = useResolvedTheme();
  const setUISettings = useSettingsStore((state) => state.setUISettings);
  const { status, error, track } = useSaveTracker();

  return (
    <SettingsPage
      title="Appearance"
      description="How Digital Garden looks on this account."
    >
      <SettingSection
        title="Theme"
        description="System tracks your operating system and updates live when it changes."
        action={<SavedIndicator status={status} error={error} />}
      >
        <RadioCardGroup
          aria-label="Theme"
          value={themePreference}
          onValueChange={(next) => {
            if (next !== themePreference) {
              void track(setUISettings({ theme: next }));
            }
          }}
          options={THEME_OPTIONS}
        />
        <p className="text-xs text-muted-foreground">
          <span
            className={cn(
              "mr-2 inline-block h-2 w-2 rounded-full",
              resolvedTheme === "dark" ? "bg-indigo-400" : "bg-amber-400"
            )}
          />
          {themePreference === "system"
            ? `Following system — currently ${resolvedTheme}`
            : `Always ${resolvedTheme}`}
        </p>
      </SettingSection>
    </SettingsPage>
  );
}
