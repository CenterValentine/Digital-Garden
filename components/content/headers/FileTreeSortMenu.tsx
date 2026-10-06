"use client";

/**
 * The file tree's one sorting affordance: a sort icon in the tree's header
 * row, opening a short menu of sorts for ONE level — the folder the tree
 * targets, the same one "+" adds to. Nothing inside that folder is touched.
 *
 * A folder REMEMBERS its sort and stays sorted (owner, 2026-10-06): uploads,
 * new items, moves in and renames take their sorted place; dragging to
 * reorder inside it turns the sort off. While the targeted folder keeps a
 * sort, the header icon becomes that sort's glyph in light gold — the
 * indicator, instead of a checkmark or a ring. The vault's top level has no
 * folder to remember on: there, sorts happen once.
 *
 * Sorts (sibling-order.ts; written by /api/content/content/reorder):
 *  - Float folders — folders on top, each part keeping its order.
 *  - Float nested  — items holding other items on top, the same way.
 *  - Name          — A–Z, choose again for Z–A.
 *  - Stop sorting  — forget the folder's sort; the order stays as it is.
 *
 * More sorts belong in this same menu.
 */
import { ArrowDownAZ, ArrowDownZA, ArrowUpDown, FolderUp, ListTree, X } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/client/ui/dropdown-menu";
import {
  nextKeptSort,
  nextNameDirection,
  type KeptSort,
  type LevelSortMode,
  type NameDirection,
} from "@/lib/domain/content/sibling-order";
import { useTreeTargetStore } from "@/state/tree-target-store";
import { useSettingsStore } from "@/state/settings-store";

interface FileTreeSortMenuProps {
  /** The header row's idle button tone. */
  className: string;
}

/** The light-gold tone a kept sort shows in (the header glyph, active items). */
const KEPT_TONE = "text-gold-primary/75 hover:text-gold-primary";
const ACTIVE_ITEM = "text-gold-primary [&>svg]:text-gold-primary";

/**
 * The header icon: the glyph of the sort the targeted folder keeps — its name
 * order wins, else its float — or the plain sort icon when it keeps none.
 */
function SortGlyph({ kept, className }: { kept: KeptSort | null; className: string }) {
  if (kept?.name === "asc") return <ArrowDownAZ className={className} />;
  if (kept?.name === "desc") return <ArrowDownZA className={className} />;
  if (kept?.float === "nested") return <ListTree className={className} />;
  if (kept?.float === "folders") return <FolderUp className={className} />;
  return <ArrowUpDown className={className} />;
}

function describeKept(kept: KeptSort): string {
  const parts = [
    kept.float === "folders" && "folders on top",
    kept.float === "nested" && "nested items on top",
    kept.name === "asc" && "by name, A–Z",
    kept.name === "desc" && "by name, Z–A",
  ].filter(Boolean);
  return parts.join(", ");
}

async function postReorder(body: Record<string, unknown>) {
  const response = await fetch("/api/content/content/reorder", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
    data?: {
      changed?: number;
      direction?: NameDirection;
      kept?: KeptSort | null;
      previous?: Array<{ id: string; displayOrder: number }>;
      previousKept?: KeptSort | null;
    };
  } | null;
  if (!response.ok || !json?.success) throw new Error(json?.error || "Sort failed");
  return json.data ?? {};
}

export function FileTreeSortMenu({ className }: FileTreeSortMenuProps) {
  const target = useTreeTargetStore((state) => state.sortTarget);
  // A shortcut's own sort only changes how the shortcut shows its folder.
  const isShortcut = target?.kind === "shortcut";
  const label = target?.label ?? "this folder";
  const kept = target?.kept ?? null;
  const remembers = target?.remembers ?? false;
  const canSort = !!target?.sortable && (remembers || target.rows.length > 1);
  const nameNext: NameDirection = remembers
    ? kept?.name === "asc"
      ? "desc"
      : "asc"
    : nextNameDirection(target?.rows ?? []);

  const tooltip = !target
    ? "Sort the items in a folder"
    : !target.sortable
      ? `${label} can't be sorted`
      : isShortcut
        ? kept
          ? `${label} shows its folder sorted: ${describeKept(kept)} — the folder itself isn't touched. Click to change.`
          : `Sort ${label} — only how this shortcut shows its folder; the folder itself isn't touched`
        : kept
          ? `${label} is kept sorted: ${describeKept(kept)} — new items take their place. Click to change.`
          : remembers
            ? `Sort ${label} — only the items directly inside it`
            : `Sort ${label} once — the top level can't keep a sort`;

  /** A shortcut's sort: a view-only setting (`ui.shortcutSorts`), never written to its folder. */
  const runShortcut = async (mode: LevelSortMode | "stop") => {
    const shortcutId = target?.shortcutId;
    if (!shortcutId) return;
    const where = label;
    const settings = useSettingsStore.getState();
    const before = { ...(settings.ui?.shortcutSorts ?? {}) };
    const previous = before[shortcutId] ?? null;
    const next = nextKeptSort(previous, mode);
    const after = { ...before };
    if (next) after[shortcutId] = next;
    else delete after[shortcutId];
    try {
      await settings.setUISettings({ shortcutSorts: after });
      const title = where.charAt(0).toUpperCase() + where.slice(1);
      toast.success(next ? `${title} shows its folder sorted: ${describeKept(next)}` : `${title} follows its folder's order again`, {
        description: "Only how this shortcut shows its folder changed — the folder itself isn't touched.",
        action: {
          label: "Undo",
          onClick: () => {
            const current = { ...(useSettingsStore.getState().ui?.shortcutSorts ?? {}) };
            if (previous) current[shortcutId] = previous;
            else delete current[shortcutId];
            void useSettingsStore.getState().setUISettings({ shortcutSorts: current });
          },
        },
      });
    } catch {
      toast.error("Couldn't sort the shortcut");
    }
  };

  const run = async (mode: LevelSortMode | "stop") => {
    if (!target || !canSort) return;
    if (isShortcut) return runShortcut(mode);
    const { serverParentId, label: where } = target;
    try {
      const result = await postReorder({ parentId: serverParentId, mode });
      window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
      const previous = result.previous ?? [];
      const undo = {
        label: "Undo",
        onClick: () => {
          void postReorder({
            parentId: serverParentId,
            restore: previous,
            // A folder gets its previous sort back too (null = none).
            ...(serverParentId !== null ? { kept: result.previousKept ?? null } : {}),
          })
            .then(() => window.dispatchEvent(new CustomEvent("dg:tree-refresh")))
            .catch(() => toast.error("Couldn't undo the sort"));
        },
      };
      if (serverParentId === null) {
        if (!result.changed) {
          toast(`${where} is already in that order`);
          return;
        }
        const what =
          mode === "float-folders"
            ? "folders on top"
            : mode === "float-nested"
              ? "nested items on top"
              : result.direction === "desc"
                ? "by name, Z–A"
                : "by name, A–Z";
        toast.success(`Sorted ${where}: ${what}`, { action: undo });
        return;
      }
      toast.success(
        result.kept ? `${where} is kept sorted: ${describeKept(result.kept)}` : `Sorting turned off for ${where}`,
        {
          description: result.kept ? "New items, uploads and renames take their place." : "Its order stays as it is.",
          action: undo,
        },
      );
    } catch (error) {
      toast.error("Couldn't sort", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const scope = isShortcut
    ? "Only this shortcut's view changes — the folder keeps its own order."
    : "Only this level is sorted; what's inside its folders isn't touched.";
  const keeps = isShortcut ? "" : remembers ? "It stays sorted as items arrive." : "The top level sorts once.";
  const tail = [keeps, scope].filter(Boolean).join(" ");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`rounded p-0.5 transition-colors ${kept ? KEPT_TONE : className}`}
          title={tooltip}
          aria-label={tooltip}
        >
          <SortGlyph kept={kept} className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      {/* No focus ring left on the icon afterwards. */}
      <DropdownMenuContent align="end" className="min-w-[12rem]" onCloseAutoFocus={(event) => event.preventDefault()}>
        <DropdownMenuLabel className="max-w-[16rem] truncate text-xs font-medium text-muted-foreground">
          Sort {label}
        </DropdownMenuLabel>
        <DropdownMenuItem
          disabled={!canSort}
          className={kept?.float === "folders" ? ACTIVE_ITEM : undefined}
          onSelect={() => void run("float-folders")}
          title={
            kept?.float === "folders"
              ? `On — the folders in ${label} stay on top. Choose it again to turn it off.`
              : `Moves the folders in ${label} to the top, each part keeping its order. ${tail}`
          }
        >
          <FolderUp />
          Float folders
          {kept?.float === "folders" && <span className="ml-auto pl-4 text-xs">On</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canSort}
          className={kept?.float === "nested" ? ACTIVE_ITEM : undefined}
          onSelect={() => void run("float-nested")}
          title={
            kept?.float === "nested"
              ? `On — items in ${label} that hold other items stay on top. Choose it again to turn it off.`
              : `Moves the items in ${label} that hold other items — folders with contents, notes with sub-pages — to the top, each part keeping its order. ${tail}`
          }
        >
          <ListTree />
          Float nested
          {kept?.float === "nested" && <span className="ml-auto pl-4 text-xs">On</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canSort}
          className={kept?.name ? ACTIVE_ITEM : undefined}
          onSelect={() => void run("name")}
          title={`Sorts ${label} ${nameNext === "asc" ? "A–Z (0–9 first, numbers by value)" : "Z–A"}; choose it again to flip. Floated items stay on top, each part sorted. ${tail}`}
        >
          {nameNext === "asc" ? <ArrowDownAZ /> : <ArrowDownZA />}
          Name
          <span className={`ml-auto pl-4 text-xs ${kept?.name ? "" : "text-muted-foreground"}`}>
            {nameNext === "asc" ? "A–Z" : "Z–A"}
          </span>
        </DropdownMenuItem>
        {kept && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void run("stop")}
              title={
                isShortcut
                  ? `${label} goes back to showing its folder's own order.`
                  : `Forget ${label}'s sort. Its items stay where they are now; new ones land at the top again.`
              }
            >
              <X />
              Stop sorting
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
