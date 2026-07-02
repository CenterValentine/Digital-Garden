/**
 * ReadAloudMiniPlayer — floating transport for "read aloud" (Audio subsystem).
 *
 * Mounted once globally (content layout). Subscribes to the shared TTS store and
 * appears only while a read is loading/playing/paused (or errored). Controls the
 * one active playback regardless of which surface started it (toolbar, bubble
 * menu, …).
 *
 * Scrubbing + duration are cloud-only (Web Speech can't seek) — the slider hides
 * when `canSeek` is false. An engine badge shows whether the HD cloud voice or
 * the offline Web Speech fallback is playing.
 */

"use client";

import { Loader2, Pause, Play, Square, Volume2, WifiOff } from "lucide-react";
import { useTextToSpeech } from "@/lib/features/tts";

const RATE_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
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

  return (
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
        <div className="flex min-w-[8rem] max-w-[18rem] flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs">
            {tts.engine === "webspeech" ? (
              <WifiOff className="h-3 w-3 text-amber-300" aria-hidden />
            ) : (
              <Volume2 className="h-3 w-3 text-white/60" aria-hidden />
            )}
            <span className="truncate text-white/80">
              {isError
                ? (tts.error ?? "Playback error")
                : (tts.sourceLabel ?? "Reading…")}
            </span>
          </div>

          {tts.canSeek && tts.duration > 0 && (
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={tts.duration}
                step={0.1}
                value={Math.min(tts.currentTime, tts.duration)}
                onChange={(e) => tts.seek(Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer accent-white"
                aria-label="Seek"
              />
              <span className="shrink-0 tabular-nums text-[10px] text-white/50">
                {formatTime(tts.currentTime)} / {formatTime(tts.duration)}
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
  );
}
