"use client";

/**
 * Gallery view (plan Phase 2 / B8b; built 2026-08-27).
 *
 * Cards in a responsive grid. Cover resolution follows B8b exactly:
 * the view's configured cover column when set, else the first `file`
 * column's first attachment thumbnail, else the first `url` column whose
 * value looks like an image, else a generated cover from the primary
 * column (tinted initial). FilePayload's width/height set the intrinsic
 * ratio before the image loads and blurDataUrl paints underneath it —
 * the no-jank quartet someone already built for image display.
 */

import { cn } from "@/lib/core/utils";
import {
  cellToText,
  deriveRowTitle,
  type DataColumn,
  type DataRow,
  type DataView,
} from "@/lib/domain/data";

const IMAGE_URL = /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i;

/** Deterministic tint for generated covers — same title, same color. */
const COVER_TINTS = [
  "bg-rose-500/25",
  "bg-amber-500/25",
  "bg-emerald-500/25",
  "bg-sky-500/25",
  "bg-violet-500/25",
  "bg-fuchsia-500/25",
];

function tintFor(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) | 0;
  return COVER_TINTS[Math.abs(h) % COVER_TINTS.length];
}

interface DataGalleryViewProps {
  rows: DataRow[];
  columns: DataColumn[];
  view: DataView | null;
  onOpenRow: (rowId: string) => void;
}

/** B8b cover ladder, resolved per row. */
function resolveCover(
  row: DataRow,
  columns: DataColumn[],
  coverColumnId: string | undefined
): { src: string; blur: string | null; ratio: number | null } | null {
  const candidates = coverColumnId
    ? columns.filter((c) => c.id === coverColumnId)
    : [
        ...columns.filter((c) => c.type === "file" && !c.deletedAt),
        ...columns.filter((c) => c.type === "url" && !c.deletedAt),
      ];

  for (const column of candidates) {
    if (column.type === "file") {
      const ref = row.contentRefs?.[column.id]?.find(
        (r) => !r.restricted && r.file?.thumbnailUrl
      );
      if (ref?.file?.thumbnailUrl) {
        return {
          src: ref.file.thumbnailUrl,
          blur: ref.file.blurDataUrl,
          ratio:
            ref.file.width && ref.file.height
              ? ref.file.width / ref.file.height
              : null,
        };
      }
    } else if (column.type === "url") {
      const value = row.data[column.key];
      if (typeof value === "string" && IMAGE_URL.test(value)) {
        return { src: value, blur: null, ratio: null };
      }
    }
  }
  return null;
}

const SIZE_GRID: Record<string, string> = {
  small: "grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]",
  medium: "grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]",
  large: "grid-cols-[repeat(auto-fill,minmax(18rem,1fr))]",
};

export function DataGalleryView({
  rows,
  columns,
  view,
  onOpenRow,
}: DataGalleryViewProps) {
  const secondary = columns
    .filter((c) => !c.isPrimary && !c.deletedAt)
    .slice(0, 2);
  const size = view?.config.cardSize ?? "medium";

  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-xs text-muted-foreground">
        No rows match this view.
      </p>
    );
  }

  return (
    <div className={cn("grid gap-3 p-4", SIZE_GRID[size] ?? SIZE_GRID.medium)}>
      {rows.map((row) => {
        const title = deriveRowTitle(columns, row.data);
        const cover = resolveCover(row, columns, view?.config.coverColumnId);
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => onOpenRow(row.id)}
            className="group overflow-hidden rounded-lg border border-border bg-background text-left shadow-sm transition-shadow hover:shadow-md"
          >
            {cover ? (
              <div
                className="h-32 w-full bg-cover bg-center"
                style={
                  cover.blur
                    ? { backgroundImage: `url(${cover.blur})` }
                    : undefined
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- cell
                    thumbnails are arbitrary storage/external URLs; next/image
                    would need a remotePatterns allowlist per provider */}
                <img
                  src={cover.src}
                  alt=""
                  loading="lazy"
                  className="h-32 w-full object-cover"
                />
              </div>
            ) : (
              <div
                aria-hidden
                className={cn(
                  "flex h-32 w-full items-center justify-center text-3xl font-semibold text-foreground/50",
                  tintFor(title)
                )}
              >
                {title === "Untitled" ? "?" : title[0]?.toUpperCase()}
              </div>
            )}
            <div className="p-2.5">
              <p
                className={cn(
                  "truncate text-xs font-medium",
                  title === "Untitled" && "italic text-muted-foreground"
                )}
              >
                {title}
              </p>
              {secondary.map((col) => {
                const text = cellToText(col, row.data[col.key]);
                return text ? (
                  <p
                    key={col.id}
                    className="mt-0.5 truncate text-[11px] text-muted-foreground"
                    title={col.name}
                  >
                    {text}
                  </p>
                ) : null;
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}
