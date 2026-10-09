"use client";

/**
 * Settings → Editor & Files → Text recognition. Which languages OCR reads
 * (⇧⌘V on an image, an image's right-click actions, the assistant's
 * read_image_text). OCR-PASTE-PLAN.md D10.
 *
 * Switches, so each change is in effect at once (fieldset persistence
 * grammar: switch = now). Written through the settings store's own editor
 * setter — the same path every other editor preference uses — so a second
 * writer can never revert it. The engine picks a change up on its next read.
 */
import Link from "next/link";

import { Switch } from "@/components/client/ui/switch";
import { SavedIndicator, SettingRow, SettingSection, useTransientSaved } from "@/components/settings/ui";
import { normalizeOcrLanguages, OCR_BASE_LANGUAGE, OCR_LANGUAGES } from "@/lib/features/ocr/languages";
import { useSettingsStore } from "@/state/settings-store";

export function OcrLanguagesSection() {
  const stored = useSettingsStore((s) => s.editor?.ocrLanguages);
  const setEditorSettings = useSettingsStore((s) => s.setEditorSettings);
  const saved = useTransientSaved();
  const active = new Set(normalizeOcrLanguages(stored));

  const toggle = async (code: string, on: boolean) => {
    const next = new Set(active);
    if (on) next.add(code);
    else next.delete(code);
    saved.markSaving();
    // English is implied; store only the additions.
    await setEditorSettings({ ocrLanguages: normalizeOcrLanguages([...next]).filter((c) => c !== OCR_BASE_LANGUAGE) });
    const error = useSettingsStore.getState().error;
    if (error) saved.markError(typeof error === "string" ? error : undefined);
    else saved.markSaved();
  };

  return (
    <SettingSection
      title="Text recognition"
      description="Languages read from images: pasting with ⇧⌘V, an image's right-click actions, and the assistant. Each language downloads once on first use; more languages make reading a little slower."
      action={<SavedIndicator status={saved.status} error={saved.error} />}
    >
      <div className="space-y-4">
        {OCR_LANGUAGES.map((language) => {
          const id = `ocr-language-${language.code}`;
          const isBase = language.code === OCR_BASE_LANGUAGE;
          return (
            <SettingRow
              key={language.code}
              label={language.label}
              description={isBase ? "Always on." : `${language.sizeMb} MB download on first use.`}
              htmlFor={id}
            >
              <Switch
                id={id}
                checked={active.has(language.code)}
                disabled={isBase}
                onCheckedChange={(on) => void toggle(language.code, on)}
              />
            </SettingRow>
          );
        })}
        <div className="border-t border-black/10 pt-4 dark:border-white/10">
          <SettingRow
            label="Read with AI (⌥⌘V / Ctrl+Alt+V)"
            description="For tables with wrapped cells, icons, handwriting or stylised text. Sends the image to the AI model you choose; ⇧⌘V stays on this device."
          >
            <Link
              href="/settings/ai/feature-routing"
              className="whitespace-nowrap text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Choose model
            </Link>
          </SettingRow>
        </div>
      </div>
    </SettingSection>
  );
}
