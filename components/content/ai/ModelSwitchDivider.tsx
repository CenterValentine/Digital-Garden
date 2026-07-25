/**
 * ModelSwitchDivider (AI 3.4) — the inline "model changed" line.
 *
 * Rendered between two consecutive assistant messages whose executed model
 * differs, plus any fall-through notices for the newer turn. Deliberately a
 * subtle hairline-rules line (Claude-style), NOT a pill — and it names WHO
 * switched ("by you" / "by playbook X (Phase N)"), because the whole point of
 * AI 3.4's transparency is that a model change is never silent. The executed
 * model + source come from the server's turn stamp (single source of truth),
 * so what this shows is what actually ran.
 */

"use client";

import { ArrowLeftRight, TriangleAlert } from "lucide-react";
import {
  describeModelRouteSource,
  type ResolvedModelRoute,
} from "@/lib/domain/ai/model-directive";
import { getModelMeta } from "@/lib/domain/ai/providers/catalog";

/** Human model name from the catalog, falling back to the raw id. */
function modelLabel(modelId: string): string {
  const bare = modelId.includes("/")
    ? modelId.slice(modelId.lastIndexOf("/") + 1)
    : modelId;
  return getModelMeta(bare)?.model.name ?? bare;
}

export function ModelSwitchDivider({
  route,
  notices,
}: {
  route: ResolvedModelRoute;
  notices?: string[];
}) {
  const who = describeModelRouteSource(route);
  return (
    <div className="my-2 flex flex-col items-center gap-1 px-3">
      <div className="flex w-full items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
        <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <ArrowLeftRight className="h-3 w-3 opacity-70" />
          <span>
            Switched to{" "}
            <span className="font-medium text-gray-700 dark:text-gray-200">
              {modelLabel(route.modelId)}
            </span>
            {who ? <span className="opacity-80"> · {who}</span> : null}
          </span>
        </span>
        <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
      </div>
      {notices?.map((notice, i) => (
        <NoticeRow key={i} notice={notice} />
      ))}
    </div>
  );
}

/** Single amber fall-through notice row — shared by both renderings. */
function NoticeRow({ notice }: { notice: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
      <TriangleAlert className="h-3 w-3 shrink-0" />
      <span>{notice}</span>
    </div>
  );
}

/**
 * A standalone notice row (no model change, just a fall-through warning) —
 * e.g. a directive that couldn't resolve while the model stayed the same.
 */
export function ModelRouteNotices({ notices }: { notices: string[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="my-1.5 flex flex-col items-center gap-1 px-3">
      {notices.map((notice, i) => (
        <NoticeRow key={i} notice={notice} />
      ))}
    </div>
  );
}
