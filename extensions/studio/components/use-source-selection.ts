/**
 * Client hook for the folder source selection (Phase 3).
 *
 * Mirrors SelectionState from server/source-selection.ts as a DTO (that
 * module imports Prisma and must stay server-side). Loading is derived from
 * a result keyed by folder id — no synchronous setState in effects. Saves
 * are optimistic with a debounced PUT; the server response reconciles.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SourceRowDto {
  id: string;
  title: string;
  contentType: string;
  parentId: string;
  depth: number;
  tokens: number;
  empty: boolean;
  truncated: boolean;
  warning?: string;
  hasContext: boolean;
}

export interface SelectionStateDto {
  folderId: string;
  rows: SourceRowDto[];
  includedNodeIds: string[];
  tokenBudget: number;
  estimatedTokens: number;
  capApplied: boolean;
  isDefault: boolean;
  scanCapped: boolean;
}

interface KeyedResult {
  forFolderId: string;
  data: SelectionStateDto | null;
  error: string | null;
}

export function useSourceSelection(folderId: string | null): {
  state: SelectionStateDto | null;
  loading: boolean;
  error: string | null;
  setIncluded: (ids: string[]) => void;
  saving: boolean;
} {
  const [result, setResult] = useState<KeyedResult | null>(null);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!folderId) return;
    const controller = new AbortController();
    fetch(`/api/studio/sources/${folderId}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || !body.success) {
          throw new Error(body.error ?? `Request failed (${res.status})`);
        }
        setResult({ forFolderId: folderId, data: body.data, error: null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          forFolderId: folderId,
          data: null,
          error: err instanceof Error ? err.message : "Failed to load sources",
        });
      });
    return () => controller.abort();
  }, [folderId]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const current =
    folderId && result?.forFolderId === folderId ? result : null;

  const setIncluded = useCallback(
    (ids: string[]) => {
      if (!folderId || !current?.data) return;
      // Optimistic: recompute the local token estimate from known rows.
      const tokensById = new Map(current.data.rows.map((r) => [r.id, r.tokens]));
      const estimatedTokens = ids.reduce(
        (sum, id) => sum + (tokensById.get(id) ?? 0),
        0
      );
      setResult({
        forFolderId: folderId,
        data: {
          ...current.data,
          includedNodeIds: ids,
          estimatedTokens,
          isDefault: false,
          capApplied: false,
        },
        error: null,
      });

      if (saveTimer.current) clearTimeout(saveTimer.current);
      const targetFolder = folderId;
      saveTimer.current = setTimeout(() => {
        setSaving(true);
        fetch(`/api/studio/sources/${targetFolder}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ includedNodeIds: ids }),
        })
          .then(async (res) => {
            const body = await res.json();
            if (!res.ok || !body.success) throw new Error(body.error);
            setResult({
              forFolderId: targetFolder,
              data: body.data,
              error: null,
            });
          })
          .catch(() => undefined)
          .finally(() => setSaving(false));
      }, 800);
    },
    [folderId, current]
  );

  return {
    state: current?.data ?? null,
    loading: Boolean(folderId) && current === null,
    error: current?.error ?? null,
    setIncluded,
    saving,
  };
}

/** "12.3k" style token formatting. */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  return `${(tokens / 1000).toFixed(tokens < 10_000 ? 1 : 0)}k`;
}
