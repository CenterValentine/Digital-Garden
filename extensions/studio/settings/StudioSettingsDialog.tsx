"use client";

/**
 * Studio extension settings — mounts on /settings/extensions/studio AND in
 * the Extensions-rail tile dialog (both render the runtime's settingsDialog).
 *
 * Owns BEHAVIOR: auto-context mode + artifact defaults. Deliberately does
 * NOT own model choice — Feature Routing does (Settings → AI), and the two
 * surfaces cross-link instead of duplicating each other. Artifact fields are
 * user defaults; the per-run variant sheets on Studio tool tiles override
 * them for a single invocation.
 */

import Link from "next/link";
import { LampDesk } from "lucide-react";
import { useSettingsStore } from "@/state/settings-store";
import {
  getStudioSettings,
  type AutoContextMode,
  type AudioOverviewLength,
} from "../settings";
import { STUDIO_BUILTIN_TOOLS } from "../builtin-tools";

const MODE_OPTIONS: Array<{
  value: AutoContextMode;
  label: string;
  description: string;
}> = [
  {
    value: "on-access",
    label: "On access (recommended)",
    description:
      "When you open a folder chat, Context tab, or Studio tool, stale or missing AI context in that folder refreshes in the background. Cost scales with what you actually use.",
  },
  {
    value: "on-access-sweep",
    label: "On access + nightly sweep",
    description:
      "Everything from On access, plus a nightly background pass that drains stale context across your whole tree in small batches — folders you haven't opened stay warm too.",
  },
  {
    value: "off",
    label: "Off",
    description:
      "AI context only updates when you press Generate on the Context tab. Edits still get tracked as stale, so switching back on later picks up exactly where things changed.",
  },
];

const AUDIO_LENGTH_OPTIONS: Array<{
  value: AudioOverviewLength;
  label: string;
  description: string;
}> = [
  {
    value: "standard",
    label: "Standard (~3 min)",
    description: "Full single-voice overview near the provider limit.",
  },
  {
    value: "brief",
    label: "Brief (~1 min)",
    description: "Essentials only — a walk-to-the-meeting listen.",
  },
];

// Report variants are a static array on the builtin definition; the
// variants field's lazy-resolver form is for dynamic tools only.
const reportVariants = STUDIO_BUILTIN_TOOLS.find(
  (tool) => tool.id === "report"
)?.variants;
const REPORT_VARIANT_OPTIONS = Array.isArray(reportVariants)
  ? reportVariants
  : [];

export default function StudioSettingsDialog() {
  const stored = useSettingsStore((s) => s.studio);
  const setStudioSettings = useSettingsStore((s) => s.setStudioSettings);
  const studio = getStudioSettings({ studio: stored });

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3">
        <LampDesk className="mt-0.5 h-5 w-5 shrink-0 text-gold-primary" />
        <div className="space-y-1">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Folder Studio turns folders into agentic hubs: grounded chat,
            generated artifacts, and per-note AI context. Configure how
            context stays fresh and the defaults artifacts start from.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Which models power Studio lives in{" "}
            <Link
              href="/settings/ai"
              className="text-gold-primary underline underline-offset-2 hover:text-gold-primary/80"
            >
              AI settings → Feature Routing
            </Link>
            .
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          AI context auto-update
        </h3>
        <div className="space-y-2">
          {MODE_OPTIONS.map((opt) => {
            const selected = studio.autoContextMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  void setStudioSettings({ autoContextMode: opt.value })
                }
                className={[
                  "flex w-full flex-col gap-1 rounded-md border p-3 text-left transition-colors",
                  selected
                    ? "border-gold-primary bg-gold-primary/10 dark:bg-gold-primary/15"
                    : "border-black/10 bg-black/[0.02] hover:bg-black/[0.04] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
                ].join(" ")}
              >
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {opt.label}
                </span>
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {opt.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <label className="block space-y-2 text-sm text-gray-700 dark:text-gray-300">
          Daily auto-update budget ({studio.dailyCallCap} generation calls)
          <input
            type="range"
            min={20}
            max={1000}
            step={20}
            value={studio.dailyCallCap}
            onChange={(e) =>
              void setStudioSettings({ dailyCallCap: Number(e.target.value) })
            }
            className="w-full"
          />
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Hard ceiling on background context updates per day (one call ≈ one
          batch of up to 8 notes, or one folder roll-up). Leftover work stays
          queued and resumes after midnight UTC. The Generate button on a
          single item is never blocked by this.
        </p>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Artifact defaults
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Starting points for Studio tools — the variant sheet on each tool
          tile overrides these per run.
        </p>

        <label className="block space-y-2 text-sm text-gray-700 dark:text-gray-300">
          Default report type
          <select
            value={studio.reportDefaultVariant}
            onChange={(e) =>
              void setStudioSettings({ reportDefaultVariant: e.target.value })
            }
            className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-gray-900 outline-none focus:border-gold-primary dark:border-white/20 dark:bg-gray-900/95 dark:text-gray-100"
          >
            {REPORT_VARIANT_OPTIONS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2 text-sm text-gray-700 dark:text-gray-300">
          Quiz length ({studio.quizQuestionCount} questions)
          <input
            type="range"
            min={3}
            max={25}
            step={1}
            value={studio.quizQuestionCount}
            onChange={(e) =>
              void setStudioSettings({
                quizQuestionCount: Number(e.target.value),
              })
            }
            className="w-full"
          />
        </label>

        <div className="space-y-2">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Audio overview length
          </p>
          <div className="grid grid-cols-2 gap-2">
            {AUDIO_LENGTH_OPTIONS.map((opt) => {
              const selected = studio.audioOverviewLength === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    void setStudioSettings({ audioOverviewLength: opt.value })
                  }
                  className={[
                    "flex flex-col gap-1 rounded-md border p-3 text-left transition-colors",
                    selected
                      ? "border-gold-primary bg-gold-primary/10 dark:bg-gold-primary/15"
                      : "border-black/10 bg-black/[0.02] hover:bg-black/[0.04] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
                  ].join(" ")}
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {opt.label}
                  </span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {opt.description}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Audio overviews use your text-to-speech voice from AI settings.
          </p>
        </div>

        <label className="block space-y-2 text-sm text-gray-700 dark:text-gray-300">
          Slide deck length (~{studio.slideCount} slides)
          <input
            type="range"
            min={4}
            max={15}
            step={1}
            value={studio.slideCount}
            onChange={(e) =>
              void setStudioSettings({ slideCount: Number(e.target.value) })
            }
            className="w-full"
          />
        </label>
      </section>
    </div>
  );
}
