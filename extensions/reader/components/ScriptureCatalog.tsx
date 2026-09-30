"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, BookOpen, ExternalLink, Loader2 } from "lucide-react";
import { TRADITION_LABELS } from "@/lib/domain/scripture/catalog";
import {
  scriptureTabId,
  type ScriptureCatalogItem,
  type ScriptureTradition,
} from "@/lib/domain/scripture/types";
import { useContentStore } from "@/state/content-store";
import { ReaderApiError, scriptureApi } from "../lib/api";
import { READER_VIRTUAL_CONTENT_TYPE } from "../manifest";
import { useReaderBookshelf } from "../state/bookshelf-store";

export function openScriptureTab(corpusId: string, title: string): void {
  useContentStore.getState().setSelectedContentId(scriptureTabId(corpusId), {
    title,
    contentType: READER_VIRTUAL_CONTENT_TYPE,
    pin: true,
  });
}

/**
 * Scripture collections across traditions: the owner installs a collection
 * once (shared, read-only text); each user enables the ones they want in
 * their "+ → Reader → Scriptures" menu. Shown in Reader settings and as the
 * "Browse traditions…" tab — one component, two mounts.
 */
export function ScriptureCatalog() {
  const [items, setItems] = useState<ScriptureCatalogItem[] | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await scriptureApi.catalog();
      setItems(result.items);
      setCanInstall(result.canInstall);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ReaderApiError && caught.code === "READER_NOT_MIGRATED"
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "Could not load the scripture catalog"
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const byTradition = new Map<ScriptureTradition, ScriptureCatalogItem[]>();
    for (const item of items ?? []) {
      byTradition.set(item.tradition, [...(byTradition.get(item.tradition) ?? []), item]);
    }
    return [...byTradition.entries()];
  }, [items]);

  const run = async (item: ScriptureCatalogItem, action: () => Promise<unknown>, done: string) => {
    setBusy(item.id);
    try {
      await action();
      toast.success(done);
      await Promise.all([load(), useReaderBookshelf.getState().loadScriptures()]);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <span>{error}</span>
      </div>
    );
  }
  if (!items) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const action = "inline-flex h-7 items-center gap-1 rounded border border-black/10 px-2.5 text-xs disabled:opacity-50 dark:border-white/10";

  return (
    <div className="space-y-5">
      {groups.map(([tradition, entries]) => (
        <section key={tradition}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {TRADITION_LABELS[tradition]}
          </h3>
          <ul className="space-y-2">
            {entries.map((item) => (
              <li key={item.id} className="rounded-lg border border-black/10 p-3 dark:border-white/10">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {item.title}
                      {item.status !== "available" && (
                        <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground dark:bg-white/10">
                          {item.status === "planned" ? "Planned" : "Link only"}
                        </span>
                      )}
                      {item.installed && (
                        <span className="text-[10px] font-normal text-muted-foreground">
                          {item.verseCount.toLocaleString()} verses
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{item.license}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {busy === item.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    {item.status === "available" && !item.installed && canInstall && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        title="Loads the text once for everyone in this Digital Garden"
                        onClick={() => void run(item, () => scriptureApi.install(item.id), `${item.title} installed`)}
                        className={`${action} bg-primary text-primary-foreground`}
                      >
                        {busy === item.id ? "Installing…" : "Install"}
                      </button>
                    )}
                    {item.status === "available" && !item.installed && !canInstall && (
                      <span className="text-[11px] text-muted-foreground">Not installed yet — ask the owner</span>
                    )}
                    {item.installed && (
                      <>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() =>
                            void run(
                              item,
                              () => scriptureApi.setEnabled(item.id, !item.enabled),
                              item.enabled ? `${item.title} removed from your menu` : `${item.title} added to your menu`
                            )
                          }
                          className={action}
                        >
                          {item.enabled ? "Disable" : "Enable"}
                        </button>
                        <button type="button" onClick={() => openScriptureTab(item.id, item.title)} className={action}>
                          <BookOpen className="h-3.5 w-3.5" /> Open
                        </button>
                      </>
                    )}
                    {!item.installed && item.homepage && (
                      <a href={item.homepage} target="_blank" rel="noreferrer" className={action}>
                        <ExternalLink className="h-3.5 w-3.5" /> Read online
                      </a>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
