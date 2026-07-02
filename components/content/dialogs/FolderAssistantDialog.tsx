/**
 * FolderAssistantDialog
 *
 * "✨ Folder assistant" — describe where the selected files should go and an
 * AI agent places them. Behavior (per spec):
 *  - Never moves silently when unsure: returns candidate folders to confirm
 *    unless "I'm feeling lucky" is on (or it accurately recalled a folder).
 *  - May create a new folder when asked (always confirmed unless lucky).
 *  - Success → toast with "Undo & try again", which reverses the move and
 *    reopens this dialog prefilled with the same draft. Anything not undone
 *    counts as success; undo records a failure so the model avoids repeating it.
 *
 * State lives in <Body>, which only mounts while the dialog is open — so each
 * open re-seeds the prompt from the store without a reset effect.
 */

"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/glass/dialog";
import { Button } from "@/components/ui/glass/button";
import { Sparkles, FolderInput, FolderPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useFolderAssistantStore } from "@/state/folder-assistant-store";
import { useFolderMoveStore } from "@/state/folder-move-store";
import type {
  FolderAssistResult,
  FolderCandidate,
  CreateSuggestion,
  UndoPayload,
} from "@/lib/domain/ai/folder-assist/types";

type Phase = "idle" | "thinking" | "confirm";

export function FolderAssistantDialog() {
  const open = useFolderAssistantStore((s) => s.open);
  const fileIds = useFolderAssistantStore((s) => s.fileIds);
  const initialPrompt = useFolderAssistantStore((s) => s.initialPrompt);
  const close = useFolderAssistantStore((s) => s.close);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg">
        {open && (
          <Body
            fileIds={fileIds}
            initialPrompt={initialPrompt}
            onClose={close}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  fileIds,
  initialPrompt,
  onClose,
}: {
  fileIds: string[];
  initialPrompt: string;
  onClose: () => void;
}) {
  const feelingLucky = useFolderMoveStore((s) => s.feelingLucky);
  const setFeelingLucky = useFolderMoveStore((s) => s.setFeelingLucky);

  const [prompt, setPrompt] = useState(() => initialPrompt);
  const [phase, setPhase] = useState<Phase>("idle");
  const [candidates, setCandidates] = useState<FolderCandidate[]>([]);
  const [createSuggestion, setCreateSuggestion] =
    useState<CreateSuggestion | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const count = fileIds.length;
  const fileLabel = count === 1 ? "1 file" : `${count} files`;
  const thinking = phase === "thinking";

  /** Shared success handling: refresh tree, close, toast with undo+retry. */
  function onMoved(
    result: Extract<FolderAssistResult, { status: "moved" }>,
    usedPrompt: string,
  ) {
    window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
    // Surface the destination in Folder Search's "Recent" list too, so both
    // Move tools share one history. Derive title + parent path from the
    // returned full path; id comes from the undo payload.
    const targetId = result.undo.targetFolderId;
    if (targetId) {
      const parts = result.targetPath.split(" / ").filter(Boolean);
      useFolderMoveStore.getState().pushRecent({
        id: targetId,
        title: parts[parts.length - 1] ?? result.targetPath,
        parentPath: parts.slice(0, -1).slice(-2),
      });
    }
    onClose();
    toast.success(`Moved ${result.movedLabel} to "${result.targetPath}"`, {
      duration: 8000,
      action: {
        label: "Undo & try again",
        onClick: () => void undoAndRetry(result.undo, usedPrompt),
      },
    });
  }

  async function undoAndRetry(undo: UndoPayload, usedPrompt: string) {
    try {
      await fetch("/api/ai/folder-assist/undo", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ undo }),
      });
      window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
    } catch {
      /* best-effort */
    }
    useFolderAssistantStore
      .getState()
      .openDialog(Object.keys(undo.prevParents), usedPrompt);
  }

  async function handleSubmit() {
    const text = prompt.trim();
    if (!text || thinking) return;
    setPhase("thinking");
    setNotice(null);
    try {
      const res = await fetch("/api/ai/folder-assist", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds, prompt: text, feelingLucky }),
      });
      const body = await res.json();
      if (!res.ok || !body?.success) {
        setPhase("idle");
        setNotice(body?.error ?? "The assistant couldn't run. Try again.");
        return;
      }
      const result = body.data as FolderAssistResult;
      if (result.status === "moved") {
        onMoved(result, text);
      } else if (result.status === "needs_confirmation") {
        if (result.candidates.length === 0 && !result.createSuggestion) {
          setPhase("idle");
          setNotice(
            result.reason || "No confident match — try describing it differently.",
          );
          return;
        }
        setCandidates(result.candidates);
        setCreateSuggestion(result.createSuggestion ?? null);
        setPhase("confirm");
      } else {
        setPhase("idle");
        setNotice(result.reason || "Couldn't determine where these should go.");
      }
    } catch {
      setPhase("idle");
      setNotice("Network error — please try again.");
    }
  }

  async function confirm(extra: Record<string, unknown>) {
    setPhase("thinking");
    try {
      const res = await fetch("/api/ai/folder-assist/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds, prompt: prompt.trim(), ...extra }),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        setPhase("confirm");
        setNotice(payload?.error ?? "Couldn't complete the move.");
        return;
      }
      const result = payload.data as FolderAssistResult;
      if (result.status === "moved") {
        onMoved(result, prompt.trim());
      } else {
        setPhase("idle");
        setNotice(
          result.status === "abstain" ? result.reason : "Couldn't complete the move.",
        );
      }
    } catch {
      setPhase("confirm");
      setNotice("Network error — please try again.");
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-400" />
          Folder assistant
          <span className="text-sm font-normal text-gray-400">· {fileLabel}</span>
        </DialogTitle>
      </DialogHeader>

      <div className="min-w-0 space-y-3">
        <p className="text-xs text-gray-400">
          Describe where {count === 1 ? "this file" : "these files"} should go.
          The assistant suggests a folder for you to confirm — or moves
          {count === 1 ? " it" : " them"} straight away when “I’m feeling lucky”
          is on.
        </p>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit();
          }}
          placeholder={
            'Where should these go? e.g. "with the design notes", "same as last time", "make a new folder for invoices under Finance"'
          }
          rows={3}
          autoFocus
          disabled={thinking}
          className="w-full resize-none rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-white/25 focus:outline-none disabled:opacity-60"
        />

        <label className="flex items-center gap-2 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={feelingLucky}
            onChange={(e) => setFeelingLucky(e.target.checked)}
            disabled={thinking}
          />
          I&apos;m feeling lucky — let it move without confirming
        </label>

        {notice && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
            {notice}
          </div>
        )}

        {phase === "confirm" && (candidates.length > 0 || createSuggestion) && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Pick a destination
            </div>
            {candidates.map((c) => (
              <button
                key={c.folderId}
                type="button"
                disabled={thinking}
                onClick={() => void confirm({ folderId: c.folderId })}
                className="flex w-full items-start gap-2 rounded-md border border-white/10 px-3 py-2 text-left hover:bg-white/5 disabled:opacity-50"
              >
                <FolderInput className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-white">{c.path}</span>
                  {c.reason && (
                    <span className="truncate text-[11px] text-gray-400">
                      {c.reason}
                    </span>
                  )}
                </span>
              </button>
            ))}
            {createSuggestion && (
              <button
                type="button"
                disabled={thinking}
                onClick={() =>
                  void confirm({
                    createFolder: {
                      name: createSuggestion.name,
                      underFolderId: createSuggestion.underFolderId,
                    },
                  })
                }
                className="flex w-full items-start gap-2 rounded-md border border-indigo-400/30 bg-indigo-500/5 px-3 py-2 text-left hover:bg-indigo-500/10 disabled:opacity-50"
              >
                <FolderPlus className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-400" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-white">
                    Create “{createSuggestion.name}” in {createSuggestion.underPath}
                  </span>
                  {createSuggestion.reason && (
                    <span className="truncate text-[11px] text-gray-400">
                      {createSuggestion.reason}
                    </span>
                  )}
                </span>
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="glass" onClick={onClose} disabled={thinking}>
            Cancel
          </Button>
          <Button
            variant="glass"
            onClick={handleSubmit}
            disabled={thinking || prompt.trim().length === 0}
          >
            {thinking ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
              </span>
            ) : phase === "confirm" ? (
              "Re-run"
            ) : (
              "Place files"
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
