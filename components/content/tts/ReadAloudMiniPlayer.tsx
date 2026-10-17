/**
 * ReadAloudMiniPlayer — floating transport for "read aloud" (Audio subsystem).
 *
 * Mounted once globally (content layout). Subscribes to the shared TTS store and
 * appears only while a read is loading/playing/paused (or errored). Controls the
 * one active playback regardless of which surface started it (toolbar, bubble
 * menu, …).
 *
 * ── Both engines get a playbar ────────────────────────────────────────────
 * The scrubber binds to `progress` (0–1 of the read's characters), not to
 * seconds, so it works identically on cloud audio and on Web Speech — which has
 * no duration and no seeking, but does report a character offset. Web Speech
 * "seeks" by re-speaking from that offset, which a listener can't distinguish
 * from a real seek. The time readout appears only when a duration is actually
 * known; otherwise the bar reads out a percentage rather than inventing a clock.
 *
 * ── The amber badge explains itself ───────────────────────────────────────
 * A broken-wifi icon with no explanation made an expired key, a rate limit, and
 * an over-long note all look like "you're offline" (GitHub #65). The badge now
 * carries `degradedReason` as a tooltip, and an info icon shows what the read
 * costs.
 */

"use client";

import {
  Info,
  Loader2,
  Pause,
  Play,
  Square,
  Volume2,
  WifiOff,
} from "lucide-react";
import { useTextToSpeech } from "@/lib/features/tts";
import { formatSpeechCost } from "@/lib/domain/ai/speech/pricing";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/client/ui/tooltip";
import type { TtsUsage } from "@/state/tts-store";

const RATE_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;

/** Slider granularity. Integer steps keep the range input from snapping coarsely. */
const SLIDER_STEPS = 1000;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Cost/usage breakdown shown on the info icon.
 *
 * Speech bills per INPUT character, so unlike a chat turn this figure is exact
 * before a single byte of audio exists — the character count IS the bill. The
 * only uncertainty is list-price drift, not output length.
 */
function UsageTooltip({ usage }: { usage: TtsUsage }) {
  const { totalChars, billedChars, estimatedCost, costNote } = usage;
  const cachedChars = Math.max(0, totalChars - billedChars);

  return (
    <div className="max-w-[16rem] space-y-1.5 text-[11px] leading-relaxed">
      <div className="font-medium">
        {estimatedCost === null
          ? "Cost unavailable"
          : `~${formatSpeechCost(estimatedCost)} for this read`}
      </div>

      <div className="space-y-0.5 text-primary-foreground/70">
        <div className="flex justify-between gap-4">
          <span>Characters</span>
          <span className="tabular-nums">{totalChars.toLocaleString()}</span>
        </div>
        {cachedChars > 0 && (
          <>
            <div className="flex justify-between gap-4">
              <span>Billed</span>
              <span className="tabular-nums">
                {billedChars.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Cached (free)</span>
              <span className="tabular-nums">
                {cachedChars.toLocaleString()}
              </span>
            </div>
          </>
        )}
        {usage.chunkCount > 1 && (
          <div className="flex justify-between gap-4">
            <span>Clips</span>
            <span className="tabular-nums">
              {usage.chunkCount}
              {usage.cachedChunks > 0 && ` (${usage.cachedChunks} cached)`}
            </span>
          </div>
        )}
        {usage.modelId && (
          <div className="flex justify-between gap-4">
            <span>Model</span>
            <span className="truncate">{usage.modelId}</span>
          </div>
        )}
      </div>

      {costNote && (
        <div className="border-t border-primary-foreground/15 pt-1 text-primary-foreground/60">
          {costNote}
        </div>
      )}
    </div>
  );
}

export function ReadAloudMiniPlayer() {
  const tts = useTextToSpeech();

  // When idle, the player doesn't vanish — it collapses to a small speaker hint
  // that expands on hover and replays the last read on click. Fully hidden only
  // when nothing has ever been read this session.
  if (tts.status === "idle") {
    if (!tts.lastSourceLabel) return null;
    return (
      <div
        className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2"
        role="region"
        aria-label="Read aloud — replay"
      >
        <button
          type="button"
          onClick={() => tts.replay()}
          className="group flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-2.5 py-2 text-white/80 shadow-lg backdrop-blur-md transition-colors hover:bg-black/80 hover:text-white"
          title={`Replay: ${tts.lastSourceLabel}`}
          aria-label={`Replay ${tts.lastSourceLabel}`}
        >
          <Volume2 className="h-4 w-4 shrink-0" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs opacity-0 transition-all duration-200 group-hover:max-w-[12rem] group-hover:opacity-100">
            Replay “{tts.lastSourceLabel}”
          </span>
        </button>
      </div>
    );
  }

  const isPlaying = tts.status === "playing";
  const isLoading = tts.status === "loading";
  const isError = tts.status === "error";

  // A known duration means cloud audio has reported metadata; Web Speech never
  // will, so it falls back to a percentage rather than a fabricated clock.
  const hasClock = tts.duration > 0;
  const showBar = !isError && tts.canSeek;
  const percent = Math.round(tts.progress * 100);

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2"
        role="region"
        aria-label="Read aloud player"
      >
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/80 px-3 py-2 text-white shadow-xl backdrop-blur-md">
          {/* Play / pause / spinner */}
          {isLoading ? (
            <div className="flex h-8 w-8 items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => (isPlaying ? tts.pause() : tts.resume())}
              disabled={isError}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 disabled:opacity-40"
              title={isPlaying ? "Pause" : "Resume"}
              aria-label={isPlaying ? "Pause" : "Resume"}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </button>
          )}

          {/* Label + engine + scrubber */}
          <div className="flex min-w-[10rem] max-w-[20rem] flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs">
              {tts.engine === "webspeech" ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="shrink-0 cursor-help"
                      aria-label="Using the browser's built-in voice"
                    >
                      <WifiOff className="h-3 w-3 text-amber-300" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="z-[70] max-w-[16rem]">
                    <p className="text-[11px] leading-relaxed">
                      {tts.degradedReason ??
                        "Using the browser's built-in voice."}
                    </p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Volume2 className="h-3 w-3 shrink-0 text-white/60" aria-hidden />
              )}

              <span className="truncate text-white/80">
                {isError
                  ? (tts.error ?? "Playback error")
                  : (tts.sourceLabel ?? "Reading…")}
              </span>

              {/* Cost / usage — the info affordance */}
              {tts.usage && !isError && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="ml-auto shrink-0 cursor-help text-white/40 transition-colors hover:text-white/80"
                      aria-label="Playback cost and usage details"
                    >
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="z-[70]">
                    <UsageTooltip usage={tts.usage} />
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            {showBar && (
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={SLIDER_STEPS}
                  step={1}
                  value={Math.round(tts.progress * SLIDER_STEPS)}
                  onChange={(e) =>
                    tts.seekFraction(Number(e.target.value) / SLIDER_STEPS)
                  }
                  className="h-1 flex-1 cursor-pointer accent-white"
                  aria-label="Seek"
                  aria-valuetext={
                    hasClock
                      ? `${formatTime(tts.currentTime)} of ${formatTime(tts.duration)}`
                      : `${percent} percent`
                  }
                />
                <span className="shrink-0 tabular-nums text-[10px] text-white/50">
                  {hasClock
                    ? `${formatTime(tts.currentTime)} / ${formatTime(tts.duration)}`
                    : `${percent}%`}
                </span>
              </div>
            )}
          </div>

          {/* Speed */}
          <select
            value={tts.rate}
            onChange={(e) => tts.setRate(Number(e.target.value))}
            className="rounded bg-white/10 px-1.5 py-1 text-xs text-white outline-none focus:ring-1 focus:ring-white/30"
            title="Playback speed"
            aria-label="Playback speed"
          >
            {RATE_OPTIONS.map((r) => (
              <option key={r} value={r} className="text-black">
                {r}×
              </option>
            ))}
          </select>

          {/* Stop */}
          <button
            type="button"
            onClick={() => tts.stop()}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            title="Stop"
            aria-label="Stop reading"
          >
            <Square className="h-4 w-4" />
          </button>
        </div>
      </div>
    </TooltipProvider>
  );
}
