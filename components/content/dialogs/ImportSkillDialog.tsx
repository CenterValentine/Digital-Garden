/**
 * ImportSkillDialog
 *
 * "Import Skill as Playbook" — paste an Anthropic SKILL.md (or load a .md
 * file) and it becomes a marked playbook note (its `##` sections are phases).
 * Thin front-end over POST /api/content/playbooks/import; format detection +
 * parsing live in lib/domain/ai/playbooks/import (adapter-based, so fabric /
 * MCP formats slot in later without touching this dialog).
 *
 * Store-driven + <Body>-mounts-while-open, mirroring FolderAssistantDialog so
 * each open starts fresh with no reset effect.
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
import { BookUp, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useImportSkillStore } from "@/state/import-skill-store";
import { useContentStore } from "@/state/content-store";

export function ImportSkillDialog() {
  const open = useImportSkillStore((s) => s.open);
  const parentId = useImportSkillStore((s) => s.parentId);
  const close = useImportSkillStore((s) => s.close);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg">
        {open && <Body parentId={parentId} onClose={close} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  parentId,
  onClose,
}: {
  parentId: string | null;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function loadFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,.txt,text/markdown,text/plain";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        setRaw(await file.text());
        setNotice(null);
      } catch {
        setNotice("Couldn't read that file.");
      }
    };
    input.click();
  }

  async function handleImport() {
    const text = raw.trim();
    if (!text || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/content/playbooks/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: text, parentId }),
      });
      const body = await res.json();
      if (!res.ok || !body?.success) {
        setBusy(false);
        setNotice(body?.error?.message ?? "Import failed.");
        return;
      }
      const { contentId, title } = body.data as {
        contentId: string;
        title: string;
      };
      window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
      useContentStore.getState().setSelectedContentId(contentId, {
        title,
        contentType: "note",
        pin: true,
      });
      toast.success(`Imported "${title}" as a playbook`);
      onClose();
    } catch {
      setBusy(false);
      setNotice("Network error — please try again.");
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <BookUp className="h-4 w-4 text-indigo-400" />
          Import Skill as Playbook
        </DialogTitle>
      </DialogHeader>

      <div className="min-w-0 space-y-3">
        <p className="text-xs text-gray-400">
          Paste an Anthropic{" "}
          <span className="font-medium">SKILL.md</span> (YAML frontmatter with a{" "}
          <code className="text-[11px]">name</code> +{" "}
          <code className="text-[11px]">description</code>, then a markdown
          body). Its <code className="text-[11px]">##</code> sections become the
          playbook&apos;s phases, and it&apos;s marked so it shows in the{" "}
          <code className="text-[11px]">/playbook</code> picker.
        </p>

        <textarea
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            if (notice) setNotice(null);
          }}
          placeholder={"---\nname: My Skill\ndescription: What it does\n---\n\n## Phase 1: …"}
          spellCheck={false}
          className="h-56 w-full resize-y rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 font-mono text-xs leading-relaxed text-gray-900 outline-none focus:border-indigo-400/50 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100"
        />

        {notice && (
          <p className="text-xs text-amber-600 dark:text-amber-400">{notice}</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={loadFile}
            disabled={busy}
            className="gap-1.5"
          >
            <FileUp className="h-3.5 w-3.5" /> Load .md file
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleImport}
              disabled={busy || raw.trim().length === 0}
              className="gap-1.5"
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing…
                </>
              ) : (
                "Import"
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
