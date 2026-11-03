"use client";

/**
 * "+ → Canvas Course…" (CANVAS-ARCHIVE-PLAN.md §6.1): connect once, pick the
 * courses you've taken, import them into the folder the "+" pointed at.
 * A second tab imports a course export (.imscc) for a course you can no
 * longer reach in Canvas.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileArchive, GraduationCap, Loader2, X } from "lucide-react";
import { useContentStore } from "@/state/content-store";
import type { CanvasImportSummary, CanvasProgressEvent } from "@/lib/domain/canvas/types";
import {
  CANVAS_IMPORT_OPEN_EVENT,
  canvasClient,
  importCartridge,
  importCourse,
  uploadCartridge,
  type CanvasConnection,
  type CanvasCourse,
} from "../lib/api";
import { CanvasConnectForm } from "./CanvasConnectForm";

type Tab = "canvas" | "export";

interface RunState {
  key: string;
  label: string;
  progress: CanvasProgressEvent | null;
  summary: CanvasImportSummary | null;
  error: string | null;
}

function openCourse(summary: CanvasImportSummary) {
  useContentStore.getState().setSelectedContentId(summary.courseRootId, {
    title: summary.courseTitle,
    contentType: "folder",
    pin: true,
  });
}

function summaryLine(summary: CanvasImportSummary): string {
  const { counts } = summary;
  const parts = [`${counts.created} created`];
  if (counts.replaced) parts.push(`${counts.replaced} updated`);
  if (counts.unchanged) parts.push(`${counts.unchanged} unchanged`);
  if (counts.conflictsSkipped) parts.push(`${counts.conflictsSkipped} kept your version`);
  if (counts.failed) parts.push(`${counts.failed} failed`);
  return parts.join(" · ");
}

export function CanvasImportDialog() {
  const [open, setOpen] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("canvas");
  const [connection, setConnection] = useState<CanvasConnection | null>(null);
  const [loadingConnection, setLoadingConnection] = useState(false);
  const [courses, setCourses] = useState<CanvasCourse[] | null>(null);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"completed" | "active">("completed");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [runs, setRuns] = useState<RunState[]>([]);
  const [running, setRunning] = useState(false);
  const [exportFile, setExportFile] = useState<File | null>(null);

  const loadCourses = useCallback(async (connectionId: string) => {
    setCourses(null);
    setCoursesError(null);
    try {
      const result = await canvasClient.courses(connectionId);
      setCourses(result.courses);
      if (!result.courses.some((course) => course.state === "completed")) setFilter("active");
    } catch (error) {
      setCoursesError(error instanceof Error ? error.message : "Couldn't load your courses");
    }
  }, []);

  const loadConnection = useCallback(async () => {
    setLoadingConnection(true);
    try {
      const { connections } = await canvasClient.connections();
      const live = connections.find((candidate) => candidate.connected) ?? null;
      setConnection(live);
      if (live) await loadCourses(live.id);
    } catch (error) {
      setCoursesError(error instanceof Error ? error.message : "Couldn't reach Canvas settings");
    } finally {
      setLoadingConnection(false);
    }
  }, [loadCourses]);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ parentId?: string | null }>).detail;
      setParentId(detail?.parentId ?? null);
      setTab("canvas");
      setSelected(new Set());
      setRuns([]);
      setExportFile(null);
      setOpen(true);
      void loadConnection();
    };
    window.addEventListener(CANVAS_IMPORT_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(CANVAS_IMPORT_OPEN_EVENT, handleOpen);
  }, [loadConnection]);

  const visibleCourses = useMemo(
    () => (courses ?? []).filter((course) => course.state === filter),
    [courses, filter]
  );

  const updateRun = (key: string, patch: Partial<RunState>) =>
    setRuns((current) => current.map((run) => (run.key === key ? { ...run, ...patch } : run)));

  const importSelected = async () => {
    if (!connection || !courses) return;
    const chosen = courses.filter((course) => selected.has(course.id));
    if (!chosen.length) return;
    setRunning(true);
    setRuns(chosen.map((course) => ({ key: course.id, label: course.name, progress: null, summary: null, error: null })));
    for (const course of chosen) {
      try {
        const summary = await importCourse(
          { connectionId: connection.id, courseId: course.id, parentId },
          (progress) => updateRun(course.id, { progress })
        );
        updateRun(course.id, { summary });
      } catch (error) {
        updateRun(course.id, { error: error instanceof Error ? error.message : "Import failed" });
      }
    }
    setRunning(false);
    void loadCourses(connection.id);
  };

  const importExport = async () => {
    if (!exportFile) return;
    const key = "export";
    setRunning(true);
    setRuns([{ key, label: exportFile.name, progress: null, summary: null, error: null }]);
    try {
      updateRun(key, { progress: { type: "progress", phase: "snapshot", done: 0, total: 1, message: "Uploading the export" } });
      const fileContentId = await uploadCartridge(exportFile, parentId);
      const summary = await importCartridge({ fileContentId, parentId }, (progress) => updateRun(key, { progress }));
      updateRun(key, { summary });
    } catch (error) {
      updateRun(key, { error: error instanceof Error ? error.message : "Import failed" });
    }
    setRunning(false);
  };

  if (!open) return null;

  const tabClass = (active: boolean) =>
    `flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
      active
        ? "bg-black/[0.08] dark:bg-white/10 text-gray-900 dark:text-white"
        : "text-gray-500 dark:text-gray-400 hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
    }`;

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/55 backdrop-blur-sm md:items-center">
      <div className="flex h-[100dvh] w-full flex-col border-black/10 dark:border-white/10 bg-white dark:bg-[#111318] shadow-2xl md:h-[min(86vh,760px)] md:max-w-2xl md:rounded-lg md:border">
        <div className="flex shrink-0 items-center justify-between border-b border-black/10 dark:border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Import a Canvas course</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Modules become folders; pages, files and your own work come along. Imported titles stay as Canvas has them.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !running && setOpen(false)}
            disabled={running}
            className="flex h-11 w-11 items-center justify-center rounded-md text-gray-500 dark:text-gray-300 hover:bg-black/[0.05] dark:hover:bg-white/10 disabled:opacity-40"
            aria-label="Close Canvas import"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div role="tablist" className="flex shrink-0 gap-1 border-b border-black/10 dark:border-white/10 px-3 py-2">
          <button type="button" role="tab" aria-selected={tab === "canvas"} disabled={running} onClick={() => setTab("canvas")} className={tabClass(tab === "canvas")}>
            From Canvas
          </button>
          <button type="button" role="tab" aria-selected={tab === "export"} disabled={running} onClick={() => setTab("export")} className={tabClass(tab === "export")}>
            From a course export (.imscc)
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm">
          {runs.length > 0 ? (
            <ul className="space-y-3">
              {runs.map((run) => (
                <li key={run.key} className="rounded-md border border-black/10 dark:border-white/10 p-3">
                  <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                    {run.error ? (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    ) : run.summary ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    )}
                    <span className="truncate">{run.summary?.courseTitle ?? run.label}</span>
                  </div>
                  {run.error && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{run.error}</p>}
                  {!run.error && !run.summary && run.progress && (
                    <div className="mt-2">
                      <div className="h-1.5 overflow-hidden rounded bg-black/[0.06] dark:bg-white/10">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${run.progress.total ? Math.round((run.progress.done / run.progress.total) * 100) : 5}%` }}
                        />
                      </div>
                      <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{run.progress.message}</p>
                    </div>
                  )}
                  {run.summary && (
                    <div className="mt-1 space-y-1 text-xs text-gray-600 dark:text-gray-300">
                      <p>{summaryLine(run.summary)}</p>
                      {run.summary.problems.length > 0 && (
                        <p className="text-amber-600 dark:text-amber-400">
                          {run.summary.problems.length} thing(s) weren&apos;t captured: see the Import report in the course folder.
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          openCourse(run.summary as CanvasImportSummary);
                          setOpen(false);
                        }}
                        className="mt-1 rounded border border-black/10 dark:border-white/10 px-2 py-1 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                      >
                        Open course
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : tab === "canvas" ? (
            loadingConnection ? (
              <p className="flex items-center gap-2 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking your Canvas connection…</p>
            ) : !connection ? (
              <CanvasConnectForm
                onConnected={(saved) => {
                  setConnection(saved);
                  void loadCourses(saved.id);
                }}
              />
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>
                    Connected to <strong className="text-gray-700 dark:text-gray-200">{connection.baseUrl}</strong>
                    {connection.displayName ? ` as ${connection.displayName}` : ""}
                  </span>
                  <button type="button" className="underline" onClick={() => setConnection(null)}>
                    Use a different token
                  </button>
                </div>
                <div className="flex gap-1">
                  {(["completed", "active"] as const).map((state) => (
                    <button
                      key={state}
                      type="button"
                      onClick={() => setFilter(state)}
                      className={`rounded border px-3 py-1 text-xs ${filter === state ? "border-primary text-gray-900 dark:text-white" : "border-black/10 dark:border-white/10 text-gray-500"}`}
                    >
                      {state === "completed" ? "Past courses" : "Current courses"}
                    </button>
                  ))}
                </div>
                {coursesError && <p className="text-xs text-amber-600 dark:text-amber-400">{coursesError}</p>}
                {!courses && !coursesError && (
                  <p className="flex items-center gap-2 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading your courses…</p>
                )}
                {courses && visibleCourses.length === 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {filter === "completed"
                      ? "No past courses are visible to your account. Your school may hide concluded courses: try a course export instead."
                      : "No current courses."}
                  </p>
                )}
                <ul className="divide-y divide-black/5 dark:divide-white/5">
                  {visibleCourses.map((course) => (
                    <li key={course.id}>
                      <label className="flex cursor-pointer items-start gap-3 py-2">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={selected.has(course.id)}
                          onChange={(event) => {
                            const next = new Set(selected);
                            if (event.target.checked) next.add(course.id);
                            else next.delete(course.id);
                            setSelected(next);
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-gray-900 dark:text-white">{course.name}</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            {[course.courseCode, course.term].filter(Boolean).join(" · ")}
                            {course.imported ? " · Imported (importing again refreshes it)" : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )
          ) : (
            <div className="space-y-3 text-xs text-gray-600 dark:text-gray-300">
              <p>
                For a course you can no longer open in Canvas. An instructor can export it from Canvas (Settings → Export Course
                Content) and send you the <code>.imscc</code> file. Exports don&apos;t include your submissions, grades or feedback.
              </p>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-black/15 dark:border-white/15 px-3 py-4">
                <FileArchive className="h-5 w-5 text-gray-400" />
                <span className="flex-1 truncate">{exportFile ? exportFile.name : "Choose a course export (.imscc)…"}</span>
                <input
                  type="file"
                  accept=".imscc,.zip"
                  className="hidden"
                  onChange={(event) => setExportFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-black/10 dark:border-white/10 px-4 py-3">
          {runs.length > 0 && !running ? (
            <button type="button" onClick={() => setRuns([])} className="rounded-md px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-black/[0.05] dark:hover:bg-white/10">
              Import more
            </button>
          ) : null}
          {runs.length === 0 && tab === "canvas" && connection && (
            <button
              type="button"
              disabled={!selected.size || running}
              onClick={() => void importSelected()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
            >
              Import {selected.size || ""} course{selected.size === 1 ? "" : "s"}
            </button>
          )}
          {runs.length === 0 && tab === "export" && (
            <button
              type="button"
              disabled={!exportFile || running}
              onClick={() => void importExport()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
            >
              Import export
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
