"use client";

import { SettingSection } from "@/components/settings/ui";
import { ConnectionsPanel, ImportPanel } from "../components/IntegrationsPanel";
import { useReaderPreferences, type ReaderFlow, type ReaderTheme } from "../state/reader-store";

const THEMES: ReaderTheme[] = ["system", "light", "sepia", "dark"];
const FLOWS: ReaderFlow[] = ["paginated", "scrolled"];

export default function ReaderSettingsDialog() {
  const fontSizePct = useReaderPreferences((state) => state.fontSizePct);
  const lineHeight = useReaderPreferences((state) => state.lineHeight);
  const theme = useReaderPreferences((state) => state.theme);
  const flow = useReaderPreferences((state) => state.flow);
  const setFontSizePct = useReaderPreferences((state) => state.setFontSizePct);
  const setLineHeight = useReaderPreferences((state) => state.setLineHeight);
  const setTheme = useReaderPreferences((state) => state.setTheme);
  const setFlow = useReaderPreferences((state) => state.setFlow);

  return (
    <div className="space-y-6">
      <SettingSection
        title="Reading defaults"
        description="Typography and layout for books on this device. You can also change these from inside any book."
      >
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <label className="block">
            <span className="text-muted-foreground">Text size — {fontSizePct}%</span>
            <input type="range" min={70} max={200} step={5} value={fontSizePct} onChange={(event) => setFontSizePct(Number(event.target.value))} className="w-full" />
          </label>
          <label className="block">
            <span className="text-muted-foreground">Line spacing — {lineHeight.toFixed(2)}</span>
            <input type="range" min={1.1} max={2.2} step={0.05} value={lineHeight} onChange={(event) => setLineHeight(Number(event.target.value))} className="w-full" />
          </label>
          <div>
            <span className="text-muted-foreground">Theme</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {THEMES.map((option) => (
                <button key={option} type="button" onClick={() => setTheme(option)} className={`rounded border px-3 py-1 text-xs capitalize ${theme === option ? "border-primary" : "border-black/10 dark:border-white/10"}`}>
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Layout</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {FLOWS.map((option) => (
                <button key={option} type="button" onClick={() => setFlow(option)} className={`rounded border px-3 py-1 text-xs capitalize ${flow === option ? "border-primary" : "border-black/10 dark:border-white/10"}`}>
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SettingSection>

      <SettingSection
        title="Connected services"
        description="Bring-your-own tokens, stored encrypted. Kindle, Apple Books and Google Play books are copy-protected and have no reading API — their highlights come in through Readwise or the Kindle clippings file."
      >
        <ConnectionsPanel />
      </SettingSection>

      <SettingSection title="Import highlights">
        <ImportPanel />
      </SettingSection>
    </div>
  );
}
