"use client";

/**
 * SitePagesComposer — the visual governance surface for SitePages (S3 shell).
 *
 * Layout: pages rail · page header card · section cards. Edits autosave as a
 * DRAFT (PUT /api/site-pages/[slug]) after a debounce; "Publish changes"
 * promotes the draft to the live config (POST …/publish). "Edit as JSON"
 * opens the validated escape hatch over the same working config.
 *
 * Sprint 4 adds the content picker (bind/ref); Sprint 5 the deep row editor;
 * Sprint 6 the live preview iframe.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getSurfaceStyles } from "@/lib/design/system";
import { Button } from "@/components/ui/glass/button";
import { toast } from "sonner";
import {
  sitePageConfig,
  isLegacyConfig,
  migrateLegacyConfig,
  type SitePageConfig,
  type ListSection,
  type ListItem,
} from "@/lib/domain/page-layout/schema";
import {
  KINDS,
  KIND_LABELS,
  type PageKind,
  starterConfig,
  slugToSegment,
  emptySection,
} from "./defaults";
import { SectionCard } from "./SectionCard";
import { JsonHatch } from "./JsonHatch";
import { ContentPicker } from "./ContentPicker";
import { PreviewPane } from "./PreviewPane";
import type { InheritedValues } from "./RowEditor";
import type { ContentIndexDirectory } from "@/app/api/site-pages/content-index/route";

type TenantRow = { id: string; slug: string; displayName: string; isPersonal: boolean };
type PageListRow = {
  slug: string;
  title: string;
  kind: string;
  navLabel: string | null;
  navOrder: number;
  visibility: string;
};

interface WorkingPage {
  slug: string;
  title: string;
  kind: PageKind;
  navLabel: string;
  navOrder: number;
  visibility: "draft" | "published";
  config: SitePageConfig;
  /** True once the row exists server-side (controls create-vs-update copy). */
  persisted: boolean;
  hasDraft: boolean;
}

type SaveState = "idle" | "saving" | "saved" | "error";

const inputCls =
  "rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm min-w-0";

function toKind(value: string): PageKind {
  return (KINDS as string[]).includes(value) ? (value as PageKind) : "record";
}

export function SitePagesComposer() {
  const glass0 = getSurfaceStyles("glass-0");
  const cardStyle = { background: glass0.background, backdropFilter: glass0.backdropFilter };

  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [pages, setPages] = useState<PageListRow[]>([]);
  const [working, setWorking] = useState<WorkingPage | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [showJson, setShowJson] = useState(false);
  /** Which section (and category) the content picker is connecting, if open. */
  const [picker, setPicker] = useState<{ sectionIndex: number } | null>(null);
  /** Published-item values by ref, for showing inherited fields on bound rows. */
  const [inheritedIndex, setInheritedIndex] = useState<Map<string, InheritedValues>>(
    () => new Map(),
  );
  /** Bumped after each successful draft save to remount the preview iframe. */
  const [previewKey, setPreviewKey] = useState(0);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newDraft, setNewDraft] = useState({ slug: "", title: "", kind: "record" as PageKind });

  // Latest working state for the debounced saver (ref updated in an effect —
  // render stays pure, the timer reads current values at fire time).
  const workingRef = useRef<WorkingPage | null>(null);
  const tenantRef = useRef("");
  useEffect(() => {
    workingRef.current = working;
    tenantRef.current = tenantId;
  }, [working, tenantId]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPages = useCallback(async (tid: string) => {
    const res = await fetch(`/api/site-pages?tenantId=${encodeURIComponent(tid)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { pages: PageListRow[] };
    setPages(data.pages);
    return data.pages;
  }, []);

  // Load the content index once per tenant so connected rows can show their
  // inherited title/date/blurb. Best-effort — a failure just means bound rows
  // show their ref rather than the published title.
  const loadInherited = useCallback(async (tid: string) => {
    try {
      const res = await fetch(
        `/api/site-pages/content-index?tenantId=${encodeURIComponent(tid)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { directories: ContentIndexDirectory[] };
      const map = new Map<string, InheritedValues>();
      for (const dir of data.directories) {
        for (const it of dir.items) {
          map.set(it.ref, {
            title: it.title,
            date: it.firstPublishedAt?.slice(0, 10),
            blurb: it.excerpt ?? undefined,
          });
        }
      }
      setInheritedIndex(map);
    } catch {
      /* non-fatal */
    }
  }, []);

  const inheritedFor = useCallback(
    (ref: string | undefined) => (ref ? inheritedIndex.get(ref) : undefined),
    [inheritedIndex],
  );

  const selectPage = useCallback(
    async (slug: string, tid?: string) => {
      const t = tid ?? tenantRef.current;
      try {
        const seg = slugToSegment(slug);
        const res = await fetch(
          `/api/site-pages/${encodeURIComponent(seg)}?tenantId=${encodeURIComponent(t)}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          page:
            | (PageListRow & { config: unknown; draftConfig: unknown | null })
            | null;
        };
        if (!data.page) return;
        const stored = data.page.draftConfig ?? data.page.config;
        // Migrate pre-v1.1 configs on the way in — a direct parse would silently
        // strip the old section `type`/`bind`. First edit re-saves the new shape.
        const raw = isLegacyConfig(stored) ? migrateLegacyConfig(stored) : (stored ?? {});
        const parsed = sitePageConfig.safeParse(raw);
        setWorking({
          slug: data.page.slug,
          title: data.page.title,
          kind: toKind(data.page.kind),
          navLabel: data.page.navLabel ?? "",
          navOrder: data.page.navOrder,
          visibility: data.page.visibility === "published" ? "published" : "draft",
          config: parsed.success ? parsed.data : { sections: [] },
          persisted: true,
          hasDraft: data.page.draftConfig !== null,
        });
        setSaveState("idle");
      } catch (err) {
        toast.error("Failed to load page", {
          description: err instanceof Error ? err.message : "Please try again",
        });
      }
    },
    [],
  );

  // Initial load: tenants → prefer the personal site → its pages → first page.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/user/tenants");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          tenants: TenantRow[];
          primaryTenantId: string | null;
        };
        setTenants(data.tenants);
        const preferred =
          data.tenants.find((t) => t.isPersonal)?.id ??
          data.primaryTenantId ??
          data.tenants[0]?.id ??
          "";
        setTenantId(preferred);
        if (preferred) {
          void loadInherited(preferred);
          const list = await loadPages(preferred);
          if (list.length > 0) void selectPage(list[0].slug, preferred);
        }
      } catch (err) {
        toast.error("Failed to load sites", {
          description: err instanceof Error ? err.message : "Please try again",
        });
      }
    })();
  }, [loadPages, loadInherited, selectPage]);

  const saveNow = useCallback(async () => {
    const w = workingRef.current;
    const t = tenantRef.current;
    if (!w || !t) return;
    setSaveState("saving");
    try {
      const seg = slugToSegment(w.slug);
      const res = await fetch(`/api/site-pages/${encodeURIComponent(seg)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: t,
          title: w.title.trim() || "Untitled",
          kind: w.kind,
          navLabel: w.navLabel.trim() || null,
          navOrder: w.navOrder,
          visibility: w.visibility,
          config: w.config,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      setSaveState("saved");
      setWorking((prev) =>
        prev && prev.slug === w.slug ? { ...prev, persisted: true, hasDraft: true } : prev,
      );
      setPreviewKey((k) => k + 1); // draft persisted → refresh the preview iframe
      void loadPages(t);
    } catch (err) {
      setSaveState("error");
      toast.error("Draft save failed", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    }
  }, [loadPages]);

  /** Apply a mutation to the working page and schedule a debounced draft save. */
  const mutate = useCallback(
    (fn: (prev: WorkingPage) => WorkingPage) => {
      setWorking((prev) => (prev ? fn(prev) : prev));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void saveNow(), 1200);
    },
    [saveNow],
  );

  /** Immediately persist a metadata patch (visibility, nav) as a draft PUT. */
  const applyAndSave = useCallback(
    async (patch: Partial<WorkingPage>): Promise<boolean> => {
      const w = workingRef.current;
      const t = tenantRef.current;
      if (!w || !t) return false;
      const next = { ...w, ...patch };
      setWorking((prev) => (prev && prev.slug === w.slug ? next : prev));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaveState("saving");
      try {
        const seg = slugToSegment(next.slug);
        const res = await fetch(`/api/site-pages/${encodeURIComponent(seg)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tenantId: t,
            title: next.title.trim() || "Untitled",
            kind: next.kind,
            navLabel: next.navLabel.trim() || null,
            navOrder: next.navOrder,
            visibility: next.visibility,
            config: next.config,
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(err?.error ?? `HTTP ${res.status}`);
        }
        setSaveState("saved");
        setWorking((prev) =>
          prev && prev.slug === next.slug ? { ...prev, persisted: true, hasDraft: true } : prev,
        );
        setPreviewKey((k) => k + 1);
        void loadPages(t);
        return true;
      } catch (err) {
        setSaveState("error");
        toast.error("Save failed", {
          description: err instanceof Error ? err.message : "Please try again",
        });
        return false;
      }
    },
    [loadPages],
  );

  /** Promote draftConfig → config on the server (content publish). */
  const postPublish = useCallback(async () => {
    const w = workingRef.current;
    const t = tenantRef.current;
    if (!w || !t) return;
    try {
      const seg = slugToSegment(w.slug);
      const res = await fetch(`/api/site-pages/${encodeURIComponent(seg)}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: t }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      setWorking((prev) => (prev ? { ...prev, hasDraft: false } : prev));
      setPreviewKey((k) => k + 1);
    } catch (err) {
      toast.error("Publish failed", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    }
  }, []);

  /** Draft → Live: make the page live AND push its current content. */
  const goLive = useCallback(async () => {
    if (await applyAndSave({ visibility: "published" })) {
      await postPublish();
      toast.success("Page is live");
    }
  }, [applyAndSave, postPublish]);

  /** Live: push pending edits to the live page. */
  const publishChanges = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      await saveNow();
    }
    await postPublish();
    toast.success("Changes published");
  }, [saveNow, postPublish]);

  /** Live → Draft: hide the page (content is kept). */
  const unpublish = useCallback(async () => {
    if (await applyAndSave({ visibility: "draft" })) {
      toast.success("Unpublished — the page now shows its default");
    }
  }, [applyAndSave]);

  const removePage = useCallback(async () => {
    const w = workingRef.current;
    const t = tenantRef.current;
    if (!w || !t) return;
    if (!window.confirm(`Delete page "/${w.slug || "home"}"? This cannot be undone.`)) return;
    try {
      const seg = slugToSegment(w.slug);
      const res = await fetch(
        `/api/site-pages/${encodeURIComponent(seg)}?tenantId=${encodeURIComponent(t)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setWorking(null);
      const list = await loadPages(t);
      if (list.length > 0) void selectPage(list[0].slug);
      toast.success("Page deleted — the route falls back to its built-in default");
    } catch (err) {
      toast.error("Failed to delete", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    }
  }, [loadPages, selectPage]);

  const createPage = useCallback(() => {
    const slug = newDraft.slug.trim();
    const title = newDraft.title.trim();
    if (!title) {
      toast.error("Title is required");
      return;
    }
    setShowNewForm(false);
    setNewDraft({ slug: "", title: "", kind: "record" });
    setWorking({
      slug,
      title,
      kind: newDraft.kind,
      navLabel: "",
      navOrder: pages.length + 1,
      visibility: "draft",
      config: starterConfig(newDraft.kind),
      persisted: false,
      hasDraft: false,
    });
    // First autosave creates the row server-side.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveNow(), 400);
  }, [newDraft, pages.length, saveNow]);

  const setSection = (index: number, next: ListSection) =>
    mutate((prev) => {
      const sections = prev.config.sections.slice();
      sections[index] = next;
      return { ...prev, config: { sections } };
    });

  /** Append an item to the section the picker was opened for. */
  const addItemToPickerSection = (item: ListItem) => {
    if (!picker) return;
    const { sectionIndex } = picker;
    mutate((prev) => {
      const sections = prev.config.sections.slice();
      const section = sections[sectionIndex];
      if (!section) return prev;
      sections[sectionIndex] = { ...section, items: [...section.items, item] };
      return { ...prev, config: { sections } };
    });
  };

  /** Append a manual item to a section (the "+ Add manual row" button). */
  const addManualItem = (sectionIndex: number) =>
    mutate((prev) => {
      const sections = prev.config.sections.slice();
      const section = sections[sectionIndex];
      if (!section) return prev;
      sections[sectionIndex] = {
        ...section,
        items: [...section.items, { title: "New row", status: "done" }],
      };
      return { ...prev, config: { sections } };
    });

  const saveLabel =
    saveState === "saving"
      ? "Saving draft…"
      : saveState === "error"
        ? "Save failed — retrying on next edit"
        : working?.hasDraft
          ? "Draft saved · unpublished changes"
          : saveState === "saved"
            ? "Draft saved"
            : "";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_minmax(360px,38%)]">
      {/* ── Pages rail ─────────────────────────────────────────── */}
      <nav className="space-y-2">
        <select
          aria-label="Site"
          className={`${inputCls} w-full`}
          value={tenantId}
          onChange={(e) => {
            const tid = e.target.value;
            setTenantId(tid);
            setWorking(null);
            void loadInherited(tid);
            void loadPages(tid).then((list) => {
              if (list.length > 0) void selectPage(list[0].slug, tid);
            });
          }}
        >
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.displayName}
              {t.isPersonal ? " · personal" : ""}
            </option>
          ))}
        </select>

        <ul className="space-y-1">
          {pages.map((p) => (
            <li key={p.slug}>
              <button
                type="button"
                onClick={() => void selectPage(p.slug)}
                aria-current={working?.slug === p.slug}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                  working?.slug === p.slug
                    ? "border-white/20 bg-white/10"
                    : "border-transparent hover:bg-white/5"
                }`}
              >
                <span className="block font-medium">{p.title}</span>
                <span className="flex items-center justify-between font-mono text-[10px] text-white/40">
                  /{p.slug}
                  <span>{p.navLabel ? `nav · ${p.navOrder}` : "hidden"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {showNewForm ? (
          <div className="space-y-2 rounded-md border border-white/10 p-3" style={cardStyle}>
            <input
              className={`${inputCls} w-full`}
              placeholder="Title (e.g. Results)"
              value={newDraft.title}
              onChange={(e) => setNewDraft((d) => ({ ...d, title: e.target.value }))}
            />
            <input
              className={`${inputCls} w-full font-mono`}
              placeholder="slug (empty = home)"
              value={newDraft.slug}
              onChange={(e) => setNewDraft((d) => ({ ...d, slug: e.target.value }))}
            />
            <select
              className={`${inputCls} w-full`}
              value={newDraft.kind}
              onChange={(e) => setNewDraft((d) => ({ ...d, kind: toKind(e.target.value) }))}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button type="button" onClick={createPage}>
                Create
              </Button>
              <button
                type="button"
                className="text-sm text-white/50 hover:text-white/80"
                onClick={() => setShowNewForm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="w-full rounded-md border border-dashed border-white/20 px-3 py-2 text-left text-sm text-white/50 hover:border-amber-500/50 hover:text-amber-400"
            onClick={() => setShowNewForm(true)}
          >
            + New page…
          </button>
        )}
      </nav>

      {/* ── Composer ───────────────────────────────────────────── */}
      <main className="min-w-0 space-y-4">
        {!working ? (
          <div className="rounded-lg border border-white/10 p-10 text-center text-sm text-white/40" style={cardStyle}>
            Select a page — or create one — to start composing.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 p-4" style={cardStyle}>
              <input
                aria-label="Page title"
                className={`${inputCls} text-base font-semibold`}
                value={working.title}
                onChange={(e) => mutate((p) => ({ ...p, title: e.target.value }))}
              />
              <span className="font-mono text-xs text-white/40">/{working.slug || "(home)"}</span>
              <span className="inline-flex items-center rounded-full border border-amber-600/50 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-400">
                {KIND_LABELS[working.kind]}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                  working.visibility === "published"
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                    : "border-white/20 text-white/50"
                }`}
                title={
                  working.visibility === "published"
                    ? "This page is live to the public"
                    : "This page is a draft — the public sees its built-in default"
                }
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    working.visibility === "published" ? "bg-emerald-400" : "bg-white/40"
                  }`}
                />
                {working.visibility === "published" ? "Live" : "Draft"}
              </span>
              <span className="flex-1" />
              <a
                href={`/${working.slug}?preview=draft`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-amber-400/80 hover:text-amber-300"
                title="Open this page (with your unpublished draft) in a new tab"
              >
                Preview ↗
              </a>
              <button
                type="button"
                className="text-xs text-white/40 underline decoration-dotted underline-offset-4 hover:text-white/70"
                onClick={() => setShowJson(true)}
              >
                Edit as JSON
              </button>
              <button
                type="button"
                className="text-xs text-white/30 hover:text-rose-400"
                onClick={() => void removePage()}
              >
                Delete
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 p-3" style={cardStyle}>
              {working.visibility === "draft" ? (
                <>
                  <Button type="button" onClick={() => void goLive()}>
                    Publish — make live
                  </Button>
                  <span className="text-xs text-white/40">
                    Draft: only you can see it (via Preview). Publishing shows it to everyone.
                  </span>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    disabled={!working.hasDraft}
                    onClick={() => void publishChanges()}
                  >
                    Publish changes
                  </Button>
                  <button
                    type="button"
                    onClick={() => void unpublish()}
                    className="text-xs text-white/40 underline decoration-dotted underline-offset-4 hover:text-rose-400"
                  >
                    Unpublish
                  </button>
                  <span
                    className={`text-xs ${
                      saveState === "error"
                        ? "text-rose-400"
                        : working.hasDraft
                          ? "text-amber-400"
                          : "text-white/40"
                    }`}
                  >
                    {working.hasDraft ? "Unpublished changes" : saveLabel}
                  </span>
                </>
              )}

              <span className="flex-1" />

              {/* Show in menu */}
              <label className="flex items-center gap-2 text-xs text-white/60">
                <input
                  type="checkbox"
                  checked={working.navLabel.trim() !== ""}
                  onChange={(e) =>
                    mutate((p) => ({
                      ...p,
                      navLabel: e.target.checked ? p.navLabel.trim() || p.title : "",
                    }))
                  }
                />
                Show in site menu
              </label>
              {working.navLabel.trim() !== "" && (
                <>
                  <input
                    aria-label="Menu label"
                    className={`${inputCls} w-28`}
                    placeholder="Menu label"
                    value={working.navLabel}
                    onChange={(e) => mutate((p) => ({ ...p, navLabel: e.target.value }))}
                  />
                  <input
                    aria-label="Menu order"
                    type="number"
                    title="Order in the menu"
                    className={`${inputCls} w-14`}
                    value={working.navOrder}
                    onChange={(e) => mutate((p) => ({ ...p, navOrder: Number(e.target.value) || 0 }))}
                  />
                </>
              )}
            </div>

            {working.config.sections.map((section, i) => (
              <SectionCard
                key={i}
                section={section}
                index={i}
                total={working.config.sections.length}
                pageKind={working.kind}
                onChange={(next) => setSection(i, next)}
                onRemove={() =>
                  mutate((prev) => ({
                    ...prev,
                    config: { sections: prev.config.sections.filter((_, j) => j !== i) },
                  }))
                }
                onMove={(dir) =>
                  mutate((prev) => {
                    const sections = prev.config.sections.slice();
                    const j = i + dir;
                    if (j < 0 || j >= sections.length) return prev;
                    [sections[i], sections[j]] = [sections[j], sections[i]];
                    return { ...prev, config: { sections } };
                  })
                }
                onConnect={() => setPicker({ sectionIndex: i })}
                onAddManual={() => addManualItem(i)}
                inheritedFor={inheritedFor}
              />
            ))}

            <button
              type="button"
              className="rounded-md border border-dashed border-white/20 px-4 py-2.5 text-sm text-white/50 hover:border-amber-500/50 hover:text-amber-400"
              onClick={() =>
                mutate((p) => ({
                  ...p,
                  config: { sections: [...p.config.sections, emptySection()] },
                }))
              }
            >
              + Add {working.kind === "garden" ? "category" : "section"}
            </button>
          </>
        )}
      </main>

      {/* ── Live preview (xl and up) ───────────────────────────── */}
      {working && (
        <div className="hidden xl:block">
          <PreviewPane
            slug={working.slug}
            refreshKey={previewKey}
            hasDraft={working.hasDraft}
          />
        </div>
      )}

      {showJson && working && (
        <JsonHatch
          config={working.config}
          onApply={(next) => mutate((p) => ({ ...p, config: next }))}
          onClose={() => setShowJson(false)}
        />
      )}

      {picker && working && (
        <ContentPicker
          tenantId={tenantId}
          sectionLabel={
            working.config.sections[picker.sectionIndex]?.label || "this section"
          }
          // A directory becomes a directory item (expands at render); a single
          // page becomes a connected row whose fields inherit until overridden.
          onBindDirectory={(ref) => addItemToPickerSection({ ref, status: "done" })}
          onAddItem={(ref) => addItemToPickerSection({ ref, status: "done" })}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
