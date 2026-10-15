/**
 * Appearance Settings
 *
 * Theme preference (System / Light / Dark). Instant-apply: selecting an
 * option persists through the settings store immediately.
 */

"use client";

import {
  ArrowLeftRight,
  Columns2,
  Monitor,
  Moon,
  Square,
  Sun,
} from "lucide-react";

import {
  RadioCardGroup,
  SavedIndicator,
  SettingSection,
  SettingsPage,
  useSaveTracker,
  type RadioCardOption,
} from "@/components/settings/ui";
import { cn } from "@/lib/core/utils";
import {
  useResolvedTheme,
  useThemePreference,
  type ThemePreference,
} from "@/lib/features/theme";
import type { OpenDestinationMode } from "@/state/content-store";
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

/**
 * Where a file-tree click lands when the workspace is split.
 *
 * Only the default is selectable today. The other two are real and covered by
 * `pnpm workspace:pane-placement:smoke` — what is missing is the decision to
 * expose them, so they render disabled rather than being hidden: a preference
 * you can see is a promise, and it tells you what the default is *not* doing.
 * See BACKLOG "Split Pane Placement".
 */
const OPEN_DESTINATION_OPTIONS: RadioCardOption<OpenDestinationMode>[] = [
  {
    value: "fill",
    title: "Beside your work",
    description:
      "Opens in the opposite pane, filling any empty pane before reusing it. What you are reading is never replaced.",
    icon: <Columns2 className="h-4 w-4" />,
  },
  {
    value: "opposite",
    title: "Always opposite",
    description:
      "Always the opposite pane, even when another one is free. Coming soon.",
    icon: <ArrowLeftRight className="h-4 w-4" />,
    disabled: true,
  },
  {
    value: "active",
    title: "In the pane I'm using",
    description:
      "Replaces whatever you are currently reading, as it worked before. Coming soon.",
    icon: <Square className="h-4 w-4" />,
    disabled: true,
  },
];

export default function AppearanceSettingsPage() {
  const themePreference = useThemePreference();
  const resolvedTheme = useResolvedTheme();
  const setUISettings = useSettingsStore((state) => state.setUISettings);
  const { status, error, track } = useSaveTracker();
  const openDestination = useSettingsStore(
    (state) => state.ui?.openDestination ?? "fill",
  );

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

      <SettingSection
        title="Split Pane Placement"
        description="Which pane a file from the tree opens into when the workspace is split."
      >
        <RadioCardGroup
          aria-label="Split pane placement"
          value={openDestination}
          onValueChange={() => {
            // Intentionally inert: every selectable option is the current
            // value. Wiring this up is `setUISettings({ openDestination })`
            // and nothing else — the store, the schema and the resolver all
            // take it already.
          }}
          options={OPEN_DESTINATION_OPTIONS}
        />
        <p className="text-xs text-muted-foreground">
          More placements are on the way. For now content opens beside what you
          are reading, and never takes the pane you are working in.
        </p>
      </SettingSection>
    </SettingsPage>
  );
}
