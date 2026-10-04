/**
 * FeedbackDialog — file a bug, feature request, or small change from inside
 * the app.
 *
 * The form mirrors the repo's issue templates (lib/domain/feedback/
 * issue-templates.ts). With GITHUB_FEEDBACK_TOKEN set, POST /api/feedback
 * files the issue directly and the toast links to it. Without it, the
 * submit button opens GitHub's new-issue page prefilled with the same
 * composed issue, synchronously inside the click so popup blockers allow it.
 *
 * Store-driven and mounted once in NotesNavBar. <Body> mounts while open, so
 * each opening re-reads diagnostics; drafts persist in the store across
 * accidental closes.
 */

"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from "react";
import { Bug, ChevronDown, ExternalLink, Lightbulb, Loader2, MessageSquarePlus, Plus, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/glass/dialog";
import { Button } from "@/components/ui/glass/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/client/ui/tooltip";
import { cn } from "@/lib/core/utils";
import { useThemePreference } from "@/lib/features/theme";
import {
  FEEDBACK_AREAS,
  FEEDBACK_KINDS,
  FEEDBACK_KIND_ORDER,
  FEEDBACK_LIMITS,
  FEEDBACK_TYPE_FLAGS,
  buildGitHubNewIssueUrl,
  composeIssue,
  extraLabelCandidates,
  missingRequired,
  type ClientDiagnostics,
  type FeedbackInput,
  type FeedbackKind,
  type RepoLabel,
} from "@/lib/domain/feedback/issue-templates";
import {
  FEEDBACK_IMAGE_TYPES,
  imageMarkdown,
  insertAtSelection,
  isLocalOrigin,
  uploadPlaceholder,
} from "@/lib/domain/feedback/attachments";
import { useFeedbackDialogStore } from "@/state/feedback-dialog-store";
import { uploadFeedbackScreenshot } from "./upload-screenshot";

const KIND_ICONS: Record<FeedbackKind, typeof Bug> = {
  bug: Bug,
  feature: Lightbulb,
  modification: Wrench,
};

const inputClass =
  "w-full rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gold-primary/60 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100";

const labelClass = "text-[11px] uppercase tracking-wide text-gray-400";

const chipClass = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors";
const chipIdleClass =
  "border-black/10 text-gray-500 hover:border-black/20 hover:text-gray-900 dark:border-white/10 dark:text-gray-400 dark:hover:border-white/25 dark:hover:text-gray-100";

interface FeedbackConfig {
  inApp: boolean;
  repo: string;
  username: string | null;
  /** Repo labels this user may apply; null when GitHub couldn't be reached. */
  labels: RepoLabel[] | null;
}

function LabelDot({ color }: { color: string }) {
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: `#${color}` }} />;
}

/** Hover card for a label chip: the GitHub label's name and description. */
function LabelTip({
  name,
  info,
  note,
  children,
}: {
  name: string;
  info?: RepoLabel;
  note?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      {/* z above the dialog (z-[300]); the shared tooltip defaults to z-50. */}
      <TooltipContent side="top" className="z-[400] max-w-xs border border-white/10 bg-gray-900 text-gray-100">
        <p className="font-medium">
          {info && <LabelDot color={info.color} />} <span className="font-mono">{name}</span>
        </p>
        <p className="text-gray-300">{info?.description ?? "No description on GitHub yet."}</p>
        {note && <p className="mt-1 text-gray-400">{note}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

export function FeedbackDialog() {
  const open = useFeedbackDialogStore((s) => s.open);
  const close = useFeedbackDialogStore((s) => s.close);
  const registerHost = useFeedbackDialogStore((s) => s.registerHost);

  useEffect(() => registerHost(), [registerHost]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      {/* z above NotesNavBar (z-[100]) so a tall form never slides under it. */}
      <DialogContent className="z-[300] max-w-xl">
        {open && <Body onClose={close} />}
      </DialogContent>
    </Dialog>
  );
}

function readDiagnostics(themePreference: string): ClientDiagnostics {
  const resolved = document.documentElement.classList.contains("dark") ? "dark" : "light";
  return {
    page: window.location.pathname,
    viewport: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
    browser: navigator.userAgent.slice(0, 300),
    theme: themePreference === resolved ? resolved : `${resolved} (preference: ${themePreference})`,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

function Body({ onClose }: { onClose: () => void }) {
  const kind = useFeedbackDialogStore((s) => s.kind);
  const setKind = useFeedbackDialogStore((s) => s.setKind);
  const draft = useFeedbackDialogStore((s) => s.drafts[s.kind]);
  const updateDraft = useFeedbackDialogStore((s) => s.updateDraft);
  const clearDraft = useFeedbackDialogStore((s) => s.clearDraft);
  const includeDiagnostics = useFeedbackDialogStore((s) => s.includeDiagnostics);
  const setIncludeDiagnostics = useFeedbackDialogStore((s) => s.setIncludeDiagnostics);
  const includeUsername = useFeedbackDialogStore((s) => s.includeUsername);
  const setIncludeUsername = useFeedbackDialogStore((s) => s.setIncludeUsername);

  const themePreference = useThemePreference();
  const [diagnostics] = useState(() => readDiagnostics(themePreference));
  const [config, setConfig] = useState<FeedbackConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; fallbackUrl?: string } | null>(null);
  const [showMoreLabels, setShowMoreLabels] = useState(false);
  const [labelFilter, setLabelFilter] = useState("");
  const [uploading, setUploading] = useState(0);
  const uploadSeq = useRef(0);
  const [localOrigin] = useState(() => isLocalOrigin(window.location.origin));

  useEffect(() => {
    let mounted = true;
    fetch("/api/feedback", { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        if (!mounted) return;
        const data = (
          json as {
            data?: { inApp?: boolean; repo?: string; username?: string; labels?: RepoLabel[] | null };
          }
        ).data;
        setConfig({
          inApp: !!data?.inApp,
          repo: data?.repo ?? "",
          username: data?.username ?? null,
          labels: data?.labels ?? null,
        });
      })
      .catch(() => {
        // Unknown → assume the GitHub fallback; it always works.
        if (mounted) setConfig({ inApp: false, repo: "", username: null, labels: null });
      });
    return () => {
      mounted = false;
    };
  }, []);

  const def = FEEDBACK_KINDS[kind];
  const input: FeedbackInput = {
    kind,
    title: draft.title,
    fields: draft.fields,
    areas: draft.areas,
    flags: kind === "modification" ? draft.flags : [],
    extraLabels: draft.extraLabels,
    severe: kind === "bug" && draft.severe,
    diagnostics: includeDiagnostics ? diagnostics : null,
  };
  const labelInfo = new Map((config?.labels ?? []).map((l) => [l.name, l]));
  const extraCandidates = config?.labels ? extraLabelCandidates(config.labels) : [];
  const permittedExtras = new Set(extraCandidates.map((l) => l.name));
  const missing = missingRequired(input);
  const preview = composeIssue(input, undefined, { permittedExtras });
  const inApp = config?.inApp ?? false;
  const hasDraft =
    !!draft.title.trim() ||
    Object.values(draft.fields).some((v) => v.trim()) ||
    draft.areas.length > 0 ||
    draft.flags.length > 0 ||
    draft.extraLabels.length > 0;
  const filterText = labelFilter.trim().toLowerCase();
  const visibleCandidates = extraCandidates.filter(
    (l) =>
      !draft.extraLabels.includes(l.name) &&
      (!filterText ||
        l.name.toLowerCase().includes(filterText) ||
        (l.description ?? "").toLowerCase().includes(filterText)),
  );
  const extrasFull = draft.extraLabels.length >= FEEDBACK_LIMITS.extras;

  /** Switching forms keeps the title if the other form hasn't got one yet. */
  function switchKind(next: FeedbackKind) {
    if (next === kind) return;
    const target = useFeedbackDialogStore.getState().drafts[next];
    if (!target.title.trim() && draft.title.trim()) updateDraft(next, { title: draft.title });
    setKind(next);
  }

  function clickFlag(flag: (typeof FEEDBACK_TYPE_FLAGS)[number]) {
    if (kind === "modification") {
      const has = draft.flags.includes(flag.label);
      updateDraft(kind, {
        flags: has ? draft.flags.filter((f) => f !== flag.label) : [...draft.flags, flag.label],
      });
    } else if (flag.kind !== kind) {
      switchKind(flag.kind);
    }
  }

  function flagNote(flag: (typeof FEEDBACK_TYPE_FLAGS)[number], active: boolean): string {
    if (kind === "modification") {
      return active ? "Click to remove." : "Adds this label alongside minor-modification.";
    }
    return flag.kind === kind
      ? "This form always carries it."
      : `Switches to the ${FEEDBACK_KINDS[flag.kind].label} form; your title comes along.`;
  }

  /**
   * Swap an upload placeholder for its result, reading the field fresh from
   * the store: the user may have kept typing (or closed the dialog) while
   * the upload ran.
   */
  function replacePlaceholder(forKind: FeedbackKind, fieldId: string, placeholder: string, replacement: string) {
    const fields = useFeedbackDialogStore.getState().drafts[forKind].fields;
    updateDraft(forKind, {
      fields: { ...fields, [fieldId]: (fields[fieldId] ?? "").replace(placeholder, replacement) },
    });
  }

  /** Paste/drop screenshots GitHub-style: placeholder now, `![name](url)` when uploaded. */
  function attachImages(fieldId: string, files: File[], el: HTMLTextAreaElement) {
    const forKind = kind;
    const placeholders = files.map((f) => uploadPlaceholder(++uploadSeq.current, f.name || "image"));
    const { value, cursor } = insertAtSelection(
      el.value,
      el.selectionStart ?? el.value.length,
      el.selectionEnd ?? el.value.length,
      placeholders.join("\n"),
    );
    setField(fieldId, value);
    requestAnimationFrame(() => el.setSelectionRange(cursor, cursor));

    files.forEach((file, i) => {
      setUploading((n) => n + 1);
      uploadFeedbackScreenshot(file)
        .then(({ name, url }) => replacePlaceholder(forKind, fieldId, placeholders[i], imageMarkdown(name, url)))
        .catch((error: unknown) => {
          replacePlaceholder(forKind, fieldId, placeholders[i], "");
          setNotice({
            text: `Couldn't attach ${file.name || "the image"}: ${error instanceof Error ? error.message : "upload failed"}`,
          });
        })
        .finally(() => setUploading((n) => n - 1));
    });
  }

  function imageFiles(list: FileList | null | undefined): File[] {
    return Array.from(list ?? []).filter((f) => FEEDBACK_IMAGE_TYPES.has(f.type));
  }

  function onFieldPaste(fieldId: string, e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = imageFiles(e.clipboardData?.files);
    if (files.length === 0) return; // plain text pastes normally
    e.preventDefault();
    attachImages(fieldId, files, e.currentTarget);
  }

  function onFieldDrop(fieldId: string, e: DragEvent<HTMLTextAreaElement>) {
    const files = imageFiles(e.dataTransfer?.files);
    if (files.length === 0) return;
    e.preventDefault();
    attachImages(fieldId, files, e.currentTarget);
  }

  function toggleExtra(name: string) {
    const has = draft.extraLabels.includes(name);
    if (!has && extrasFull) return;
    updateDraft(kind, {
      extraLabels: has ? draft.extraLabels.filter((l) => l !== name) : [...draft.extraLabels, name],
    });
  }

  function setField(id: string, value: string) {
    updateDraft(kind, { fields: { ...draft.fields, [id]: value } });
    if (notice) setNotice(null);
  }

  function toggleArea(label: string) {
    const has = draft.areas.includes(label);
    updateDraft(kind, {
      areas: has ? draft.areas.filter((a) => a !== label) : [...draft.areas, label],
    });
  }

  async function handleSubmit() {
    if (busy || missing.length > 0 || uploading > 0) return;

    if (!inApp) {
      // Synchronous inside the click — popup blockers allow it.
      window.open(buildGitHubNewIssueUrl(preview, config?.repo || undefined), "_blank", "noopener,noreferrer");
      toast.success("Opened GitHub with your report filled in. Submit it there.");
      onClose();
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, includeUsername }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { number: number; url: string };
        error?: { message?: string };
        fallbackUrl?: string;
      };
      if (res.ok && json.success && json.data) {
        const { number, url } = json.data;
        toast.success(`Filed #${number} on GitHub. Thank you!`, {
          action: { label: "View", onClick: () => window.open(url, "_blank", "noopener,noreferrer") },
        });
        clearDraft(kind);
        onClose();
        return;
      }
      setBusy(false);
      setNotice({
        text: json.error?.message ?? "Couldn't file the issue. Please try again.",
        fallbackUrl: json.fallbackUrl,
      });
    } catch {
      setBusy(false);
      setNotice({
        text: "Network error. Your draft is kept.",
        fallbackUrl: buildGitHubNewIssueUrl(preview, config?.repo || undefined),
      });
    }
  }

  return (
    <div
      className="min-w-0"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          void handleSubmit();
        }
      }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <MessageSquarePlus className="h-4 w-4 text-gold-primary" />
          Send feedback
        </DialogTitle>
        <DialogDescription>
          Becomes an issue on the project&apos;s public GitHub repository.
        </DialogDescription>
      </DialogHeader>

      <div className="mt-4 max-h-[65vh] space-y-4 overflow-y-auto pr-1">
        {/* Kind */}
        <div className="space-y-1.5">
          <div
            role="radiogroup"
            aria-label="Feedback type"
            className="grid grid-cols-3 gap-1 rounded-lg border border-black/10 bg-black/[0.03] p-1 dark:border-white/10 dark:bg-white/[0.04]"
          >
            {FEEDBACK_KIND_ORDER.map((k) => {
              const Icon = KIND_ICONS[k];
              const active = k === kind;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => switchKind(k)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-gold-primary/20 text-gold-primary"
                      : "text-gray-500 hover:bg-black/5 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-100",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {FEEDBACK_KINDS[k].label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400">{def.hint}</p>
        </div>

        {/* Title */}
        <div className="space-y-1">
          <label htmlFor="feedback-title" className={labelClass}>
            Title <span className="text-gold-primary">*</span>
          </label>
          <input
            id="feedback-title"
            type="text"
            autoFocus
            maxLength={FEEDBACK_LIMITS.title}
            value={draft.title}
            onChange={(e) => updateDraft(kind, { title: e.target.value })}
            placeholder={def.titlePlaceholder}
            className={inputClass}
          />
        </div>

        {/* Template fields */}
        {def.fields.map((f) => (
          <div key={f.id} className="space-y-1">
            <label htmlFor={`feedback-${f.id}`} className={labelClass}>
              {f.label} {f.required && <span className="text-gold-primary">*</span>}
            </label>
            <textarea
              id={`feedback-${f.id}`}
              rows={f.required ? 3 : 2}
              maxLength={FEEDBACK_LIMITS.field}
              value={draft.fields[f.id] ?? f.starter ?? ""}
              onChange={(e) => setField(f.id, e.target.value)}
              onPaste={(e) => onFieldPaste(f.id, e)}
              onDrop={(e) => onFieldDrop(f.id, e)}
              onDragOver={(e) => {
                if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
              }}
              placeholder={f.placeholder}
              className={cn(inputClass, "resize-y leading-relaxed")}
            />
          </div>
        ))}

        <p className="-mt-2 text-[11px] text-gray-400">
          Paste or drop screenshots into any box. They&apos;re saved to your{" "}
          <span className="text-gray-500 dark:text-gray-300">Feedback attachments</span> folder and shown
          publicly in the issue.
          {localOrigin && (
            <span className="block text-amber-600 dark:text-amber-400">
              This is a local server, so GitHub can&apos;t load images linked from it. They&apos;ll show as broken
              links on the issue.
            </span>
          )}
        </p>

        {/* Labels — the type flags lead, then areas, then any other repo label. */}
        <TooltipProvider delayDuration={200}>
          <div className="space-y-2">
            <span className={labelClass}>Labels</span>

            <div className="flex flex-wrap items-center gap-1.5">
              {FEEDBACK_TYPE_FLAGS.map((flag) => {
                const active =
                  kind === flag.kind || (kind === "modification" && draft.flags.includes(flag.label));
                const color = labelInfo.get(flag.label)?.color ?? flag.color;
                return (
                  <LabelTip key={flag.label} name={flag.label} info={labelInfo.get(flag.label)} note={flagNote(flag, active)}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => clickFlag(flag)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                        active ? "text-gray-900 dark:text-gray-100" : chipIdleClass,
                      )}
                      style={active ? { borderColor: `#${color}`, backgroundColor: `#${color}33` } : undefined}
                    >
                      <LabelDot color={color} />
                      {flag.display}
                    </button>
                  </LabelTip>
                );
              })}
              {kind === "modification" && (
                <LabelTip
                  name={FEEDBACK_KINDS.modification.githubLabel}
                  info={labelInfo.get(FEEDBACK_KINDS.modification.githubLabel)}
                  note="Small changes always carry this label."
                >
                  <span className={cn(chipClass, "cursor-default border-black/10 text-gray-500 dark:border-white/10 dark:text-gray-400")}>
                    <LabelDot color={labelInfo.get(FEEDBACK_KINDS.modification.githubLabel)?.color ?? "E3CE01"} />
                    {FEEDBACK_KINDS.modification.githubLabel}
                  </span>
                </LabelTip>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-[11px] text-gray-400">Area (up to {FEEDBACK_LIMITS.areas})</span>
              <div className="flex flex-wrap gap-1.5">
                {FEEDBACK_AREAS.map((a) => {
                  const selected = draft.areas.includes(a.label);
                  const full = !selected && draft.areas.length >= FEEDBACK_LIMITS.areas;
                  return (
                    <LabelTip
                      key={a.label}
                      name={a.label}
                      info={labelInfo.get(a.label)}
                      note={full ? `Up to ${FEEDBACK_LIMITS.areas} areas; remove one first.` : undefined}
                    >
                      <button
                        type="button"
                        aria-pressed={selected}
                        aria-disabled={full}
                        onClick={() => !full && toggleArea(a.label)}
                        className={cn(
                          chipClass,
                          selected ? "border-gold-primary/60 bg-gold-primary/15 text-gold-primary" : chipIdleClass,
                          full && "cursor-not-allowed opacity-40",
                        )}
                      >
                        {a.display}
                      </button>
                    </LabelTip>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {draft.extraLabels.map((name) => {
                  const info = labelInfo.get(name);
                  return (
                    <LabelTip key={name} name={name} info={info} note="Click to remove.">
                      <button
                        type="button"
                        onClick={() => toggleExtra(name)}
                        className={cn(chipClass, "border-gold-primary/60 bg-gold-primary/15 text-gold-primary")}
                      >
                        {info && <LabelDot color={info.color} />}
                        {name}
                        <X className="h-3 w-3" />
                      </button>
                    </LabelTip>
                  );
                })}
                <button
                  type="button"
                  aria-expanded={showMoreLabels}
                  disabled={!config?.labels || extraCandidates.length === 0}
                  title={
                    config === null
                      ? "Loading the repository's labels…"
                      : !config.labels
                        ? "Couldn't load the repository's labels."
                        : undefined
                  }
                  onClick={() => setShowMoreLabels((v) => !v)}
                  className={cn(chipClass, "border-dashed", chipIdleClass, "disabled:cursor-not-allowed disabled:opacity-40")}
                >
                  {showMoreLabels ? <ChevronDown className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  {showMoreLabels ? "Fewer labels" : "More labels"}
                </button>
              </div>

              {showMoreLabels && (
                <div className="space-y-2 rounded-md border border-black/10 p-2 dark:border-white/10">
                  <input
                    type="text"
                    value={labelFilter}
                    onChange={(e) => setLabelFilter(e.target.value)}
                    placeholder="Filter labels"
                    aria-label="Filter labels"
                    className={cn(inputClass, "py-1 text-xs")}
                  />
                  {extrasFull && (
                    <p className="text-[11px] text-gray-400">
                      Up to {FEEDBACK_LIMITS.extras} extra labels; remove one to add another.
                    </p>
                  )}
                  <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                    {visibleCandidates.length === 0 ? (
                      <span className="text-xs text-gray-400">No other labels match.</span>
                    ) : (
                      visibleCandidates.map((l) => (
                        <LabelTip key={l.name} name={l.name} info={l}>
                          <button
                            type="button"
                            aria-disabled={extrasFull}
                            onClick={() => toggleExtra(l.name)}
                            className={cn(chipClass, chipIdleClass, extrasFull && "cursor-not-allowed opacity-40")}
                          >
                            <LabelDot color={l.color} />
                            {l.name}
                          </button>
                        </LabelTip>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </TooltipProvider>

        {kind === "bug" && (
          <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={draft.severe}
              onChange={(e) => updateDraft(kind, { severe: e.target.checked })}
              className="mt-0.5 accent-gold-primary"
            />
            <span>
              It blocks my work or lost data
              <span className="block text-xs text-gray-400">Marks the issue for priority attention.</span>
            </span>
          </label>
        )}

        {/* What gets attached */}
        <div className="space-y-2 rounded-md border border-black/10 p-3 dark:border-white/10">
          <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={includeDiagnostics}
              onChange={(e) => setIncludeDiagnostics(e.target.checked)}
              className="mt-0.5 accent-gold-primary"
            />
            <span className="min-w-0 flex-1">
              Include diagnostics
              <details className="text-xs text-gray-400">
                <summary className="cursor-pointer select-none">What&apos;s included</summary>
                <ul className="mt-1 space-y-0.5 break-all">
                  <li>Page: {diagnostics.page}</li>
                  <li>Viewport: {diagnostics.viewport}</li>
                  <li>Browser: {diagnostics.browser}</li>
                  <li>Theme: {diagnostics.theme}</li>
                  <li>Time zone: {diagnostics.timeZone}</li>
                  {inApp && <li>App environment and version</li>}
                </ul>
              </details>
            </span>
          </label>
          {inApp && config?.username && (
            <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={includeUsername}
                onChange={(e) => setIncludeUsername(e.target.checked)}
                className="mt-0.5 accent-gold-primary"
              />
              <span>
                Include my username ({config.username}) so I can be asked follow-ups
              </span>
            </label>
          )}
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Public on GitHub. Leave out private note content, keys, and personal details.
          </p>
        </div>

        {/* Preview */}
        <details className="text-xs">
          <summary className="cursor-pointer select-none text-gray-400">
            Preview the issue
          </summary>
          <div className="mt-2 space-y-1.5 rounded-md bg-black/[0.03] p-2 dark:bg-white/[0.04]">
            <p className="font-medium text-gray-900 dark:text-gray-100">{preview.title || "(no title yet)"}</p>
            <p className="text-gray-400">Labels: {preview.labels.join(", ")}</p>
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-gray-600 dark:text-gray-300">
              {preview.body}
            </pre>
          </div>
        </details>

        {notice && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {notice.text}{" "}
            {notice.fallbackUrl && (
              <a
                href={notice.fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 underline"
              >
                Open it on GitHub instead <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {hasDraft && (
          <button
            type="button"
            onClick={() => clearDraft(kind)}
            disabled={busy}
            className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            Clear draft
          </button>
        )}
        <span className="ml-auto hidden text-[11px] text-gray-400 sm:inline">
          {uploading > 0
            ? `Uploading ${uploading} image${uploading === 1 ? "" : "s"}…`
            : missing.length > 0
              ? `Needs: ${missing.join(", ")}`
              : "⌘/Ctrl + Enter to send"}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSubmit()}
          disabled={busy || missing.length > 0 || uploading > 0 || config === null}
          className="gap-1.5"
        >
          {busy ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Sending…
            </>
          ) : inApp ? (
            "Submit"
          ) : (
            <>
              Continue on GitHub <ExternalLink className="h-3.5 w-3.5" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
