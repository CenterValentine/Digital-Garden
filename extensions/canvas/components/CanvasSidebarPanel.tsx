"use client";

/**
 * The Canvas tab (CANVAS-ARCHIVE-PLAN.md §9): the one place to check an
 * imported course against Canvas, reachable from any node inside it.
 *
 *   provenance → "Check for changes" → tick modules → settle every conflict
 *   in one queue (skip = keep yours, sibling = add Canvas's beside it) → apply.
 *
 * Nothing is written until "Re-import"; the result line says what actually
 * happened.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Lock, RefreshCw, Upload } from "lucide-react";
import { useContentStore } from "@/state/content-store";
import type { CanvasImportSummary, CanvasProgressEvent, ConflictResolution } from "@/lib/domain/canvas/types";
import {
  CANVAS_CHANGED_EVENT,
  canvasClient,
  reimportCourse,
  uploadCartridge,
  type CanvasProvenance,
  type CourseChangeReport,
} from "../lib/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function CanvasSidebarPanel({ contentId }: { contentId: string }) {
  const [provenance, setProvenance] = useState<CanvasProvenance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<CourseChangeReport | null>(null);
  const [cartridgeId, setCartridgeId] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [includeCourse, setIncludeCourse] = useState(false);
  const [resolutions, setResolutions] = useState<Record<string, ConflictResolution>>({});
  const [progress, setProgress] = useState<CanvasProgressEvent | null>(null);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<CanvasImportSummary | null>(null);

  const loadProvenance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { provenance: loaded } = await canvasClient.provenance(contentId);
      setProvenance(loaded);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't load Canvas details");
    } finally {
      setLoading(false);
    }
  }, [contentId]);

  useEffect(() => {
    setReport(null);
    setResult(null);
    setCartridgeId(null);
    void loadProvenance();
    window.addEventListener(CANVAS_CHANGED_EVENT, loadProvenance);
    return () => window.removeEventListener(CANVAS_CHANGED_EVENT, loadProvenance);
  }, [loadProvenance]);

  const runCheck = async (uploadedCartridgeId?: string | null) => {
    const rootId = provenance?.course.rootId;
    if (!rootId) return;
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      const checked = await canvasClient.check(rootId, uploadedCartridgeId ?? cartridgeId);
      setReport(checked);
      // Pre-tick the module of whatever is selected (§9.1), else every changed one.
      const ownModule = provenance?.module?.id;
      const changed = checked.modules.map((courseModule) => courseModule.moduleId);
      setTicked(new Set(ownModule && changed.includes(ownModule) ? [ownModule] : changed));
      const course = checked.course;
      setIncludeCourse(course.syllabusChanged || course.syllabusConflict || course.syllabusNew || course.syllabusRemoved);
      setResolutions(Object.fromEntries(checked.conflicts.map((conflict) => [conflict.linkKey, "skip" as const])));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't check Canvas");
    } finally {
      setChecking(false);
    }
  };

  const uploadAndCheck = async (file: File) => {
    setChecking(true);
    setError(null);
    try {
      const id = await uploadCartridge(file, null);
      setCartridgeId(id);
      await runCheck(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
      setChecking(false);
    }
  };

  const queue = useMemo(
    () =>
      (report?.conflicts ?? []).filter((conflict) =>
        conflict.moduleId ? ticked.has(conflict.moduleId) : includeCourse
      ),
    [report, ticked, includeCourse]
  );

  const apply = async () => {
    const rootId = provenance?.course.rootId;
    if (!rootId || !report) return;
    setApplying(true);
    setError(null);
    try {
      const summary = await reimportCourse(
        {
          courseRootId: rootId,
          moduleIds: [...ticked],
          includeCourse,
          resolutions: Object.fromEntries(queue.map((conflict) => [conflict.linkKey, resolutions[conflict.linkKey] ?? "skip"])),
          cartridgeContentId: cartridgeId,
        },
        setProgress
      );
      setResult(summary);
      setReport(null);
      setCartridgeId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Re-import failed");
    } finally {
      setApplying(false);
      setProgress(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-xs text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Canvas details…
      </div>
    );
  }
  if (!provenance) {
    return <div className="p-4 text-xs text-gray-500">{error ?? "This item wasn't imported from Canvas."}</div>;
  }

  const openCourse = () => {
    if (!provenance.course.rootId) return;
    useContentStore.getState().setSelectedContentId(provenance.course.rootId, {
      title: provenance.course.title ?? "Course",
      contentType: "folder",
    });
  };

  const changeCount = report
    ? report.modules.reduce((sum, courseModule) => sum + courseModule.created + courseModule.replaced + courseModule.conflicts + courseModule.removed, 0)
    : 0;

  return (
    <div className="space-y-4 p-4 text-xs text-gray-600 dark:text-gray-300">
      <section className="space-y-1">
        <button type="button" onClick={openCourse} className="block text-left text-sm font-semibold text-gray-900 hover:underline dark:text-white">
          {provenance.course.title ?? "Canvas course"}
        </button>
        {provenance.module && <p>Module: {provenance.module.title ?? provenance.module.id}</p>}
        <p>
          Imported {formatDate(provenance.importedAt)} from {provenance.sourceLabel}
        </p>
        {provenance.htmlUrl && (
          <a href={provenance.htmlUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
            Open in Canvas <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {provenance.titleLocked && (
          <p className="flex items-start gap-1 text-gray-500 dark:text-gray-400">
            <Lock className="mt-0.5 h-3 w-3 shrink-0" /> The title stays as Canvas has it. Add your own notes beside it.
          </p>
        )}
        {provenance.status === "removed_upstream" && (
          <p className="text-amber-600 dark:text-amber-400">No longer in Canvas. Kept here, and its title is yours now.</p>
        )}
      </section>

      <section className="space-y-2 border-t border-black/10 pt-3 dark:border-white/10">
        {provenance.sourceKind === "api" ? (
          <button
            type="button"
            disabled={checking || applying}
            onClick={() => void runCheck()}
            className="inline-flex items-center gap-2 rounded-md border border-black/10 px-3 py-1.5 hover:bg-black/[0.04] disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/[0.06]"
          >
            {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Check for changes
          </button>
        ) : (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-black/10 px-3 py-1.5 hover:bg-black/[0.04] dark:border-white/10 dark:hover:bg-white/[0.06]">
            {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Check a newer export (.imscc)…
            <input
              type="file"
              accept=".imscc,.zip"
              className="hidden"
              disabled={checking || applying}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadAndCheck(file);
              }}
            />
          </label>
        )}
        {error && <p className="text-amber-600 dark:text-amber-400">{error}</p>}

        {result && (
          <div className="rounded-md border border-black/10 p-2 dark:border-white/10">
            <p className="flex items-center gap-1 font-medium text-gray-900 dark:text-white">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Re-import finished
            </p>
            <p>
              {result.counts.replaced} updated · {result.counts.created} new · {result.counts.siblingsAdded} added beside yours ·{" "}
              {result.counts.conflictsSkipped} kept yours
              {result.counts.removedUpstream ? ` · ${result.counts.removedUpstream} no longer in Canvas` : ""}
              {result.counts.failed ? ` · ${result.counts.failed} failed` : ""}
            </p>
            {result.problems.length > 0 && <p className="text-amber-600 dark:text-amber-400">Details are in the Import report.</p>}
          </div>
        )}

        {report && report.unchanged && (
          <p className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Everything matches Canvas.
          </p>
        )}

        {report && !report.unchanged && (
          <div className="space-y-3">
            <p>
              {changeCount} change{changeCount === 1 ? "" : "s"} in Canvas. Pick what to re-import:
            </p>
            <ul className="space-y-1">
              {(report.course.syllabusChanged || report.course.syllabusConflict || report.course.syllabusNew || report.course.syllabusRemoved) && (
                <li>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" checked={includeCourse} onChange={(event) => setIncludeCourse(event.target.checked)} />
                    <span>
                      Syllabus{" "}
                      <span className="text-gray-500">
                        {report.course.syllabusNew
                          ? "new"
                          : report.course.syllabusRemoved
                            ? "removed"
                            : report.course.syllabusConflict
                              ? "changed (you edited it too)"
                              : "changed"}
                      </span>
                    </span>
                  </label>
                </li>
              )}
              {report.modules.map((courseModule) => (
                <li key={courseModule.moduleId}>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={ticked.has(courseModule.moduleId)}
                      onChange={(event) => {
                        const next = new Set(ticked);
                        if (event.target.checked) next.add(courseModule.moduleId);
                        else next.delete(courseModule.moduleId);
                        setTicked(next);
                      }}
                    />
                    <span>
                      {courseModule.title}{" "}
                      <span className="text-gray-500">
                        {courseModule.moduleRemoved
                          ? "removed from Canvas"
                          : [
                              courseModule.replaced && `${courseModule.replaced} changed`,
                              courseModule.created && `${courseModule.created} new`,
                              courseModule.conflicts && `${courseModule.conflicts} you also edited`,
                              courseModule.removed && `${courseModule.removed} removed`,
                            ]
                              .filter(Boolean)
                              .join(", ")}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            {queue.length > 0 && (
              <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/[0.05] p-2">
                <p className="flex items-center gap-1 font-medium text-gray-900 dark:text-white">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  {queue.length} item{queue.length === 1 ? "" : "s"} changed in Canvas that you&apos;ve also edited
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded border border-black/10 px-2 py-0.5 dark:border-white/10"
                    onClick={() => setResolutions((current) => ({ ...current, ...Object.fromEntries(queue.map((conflict) => [conflict.linkKey, "skip" as const])) }))}
                  >
                    Skip all
                  </button>
                  <button
                    type="button"
                    className="rounded border border-black/10 px-2 py-0.5 dark:border-white/10"
                    onClick={() => setResolutions((current) => ({ ...current, ...Object.fromEntries(queue.map((conflict) => [conflict.linkKey, "sibling" as const])) }))}
                  >
                    Add all as siblings
                  </button>
                </div>
                <ul className="space-y-1.5">
                  {queue.map((conflict) => (
                    <li key={conflict.linkKey}>
                      <p className="truncate text-gray-900 dark:text-white">{conflict.title}</p>
                      <div className="flex gap-3">
                        {(["skip", "sibling"] as const).map((choice) => (
                          <label key={choice} className="flex items-center gap-1">
                            <input
                              type="radio"
                              name={`canvas-conflict-${conflict.linkKey}`}
                              checked={(resolutions[conflict.linkKey] ?? "skip") === choice}
                              onChange={() => setResolutions((current) => ({ ...current, [conflict.linkKey]: choice }))}
                            />
                            {choice === "skip" ? "Keep mine" : "Add Canvas version beside it"}
                          </label>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {applying && progress && (
              <p className="flex items-center gap-1 text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {progress.message} ({progress.done}/{progress.total})
              </p>
            )}
            <button
              type="button"
              disabled={applying || (!ticked.size && !includeCourse)}
              onClick={() => void apply()}
              className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-40"
            >
              Re-import {ticked.size ? `${ticked.size} module${ticked.size === 1 ? "" : "s"}` : "syllabus"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
