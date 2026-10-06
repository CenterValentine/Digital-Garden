"use client";

/**
 * The file tree's one sorting affordance: a sort icon in the tree's header
 * row, opening a short menu of sorts. Each is a one-time, permanent reorder
 * of ONE level — the folder the tree targets, the same one "+" adds to — and
 * nothing about it is remembered (owner, 2026-10-06): no checkmarks, no
 * lit-up state. Nothing inside that folder is touched.
 *
 * Sorts (lib/domain/content/sibling-order.ts `sortLevel`; written by
 * /api/content/content/reorder):
 *  - Float folders — folders to the top, each part keeping its order.
 *  - Float nested  — items holding other items to the top, the same way.
 *  - Name          — A–Z, or Z–A when the level is already A–Z (the toggle).
 *
 * More sorts belong in this same menu.
 */
import { useState } from "react";
import { ArrowDownAZ, ArrowDownZA, ArrowUpDown, FolderUp, ListTree } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/client/ui/dropdown-menu";
import { describeTreeTarget, type TreeLevelTarget } from "@/lib/domain/content/create-target";
import { nextNameDirection, type LevelSortMode } from "@/lib/domain/content/sibling-order";

interface FileTreeSortMenuProps {
  /** The header row's idle button tone (the sort has no "on" state). */
  className: string;
}

function buttonTooltip(target: TreeLevelTarget | null): string {
  if (!target) return "Sort the items in a folder";
  if (!target.sortable) return `${target.label} can't be sorted`;
  return `Sort ${target.label} — reorders only the items directly inside it`;
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
      direction?: "asc" | "desc";
      previous?: Array<{ id: string; displayOrder: number }>;
    };
  } | null;
  if (!response.ok || !json?.success) throw new Error(json?.error || "Sort failed");
  return json.data ?? {};
}

export function FileTreeSortMenu({ className }: FileTreeSortMenuProps) {
  // Read when hovered / opened: the target follows the tree's selection.
  const [tooltip, setTooltip] = useState(() => buttonTooltip(null));
  const [target, setTarget] = useState<TreeLevelTarget | null>(null);

  const canSort = !!target?.sortable && target.rows.length > 1;
  const nameDirection = target ? nextNameDirection(target.rows) : "asc";
  const label = target?.label ?? "this folder";

  const run = async (mode: LevelSortMode) => {
    if (!target || !canSort) return;
    const { serverParentId, label: where } = target;
    try {
      const result = await postReorder({ parentId: serverParentId, mode });
      if (!result.changed) {
        toast(`${where} is already in that order`);
        return;
      }
      window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
      const what =
        mode === "float-folders"
          ? "folders on top"
          : mode === "float-nested"
            ? "nested items on top"
            : result.direction === "desc"
              ? "by name, Z–A"
              : "by name, A–Z";
      const previous = result.previous ?? [];
      toast.success(`Sorted ${where}: ${what}`, {
        action: {
          label: "Undo",
          onClick: () => {
            void postReorder({ parentId: serverParentId, restore: previous })
              .then(() => window.dispatchEvent(new CustomEvent("dg:tree-refresh")))
              .catch(() => toast.error("Couldn't undo the sort"));
          },
        },
      });
    } catch (error) {
      toast.error("Couldn't sort", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const onlyHere = "Only this level is reordered; what's inside its folders isn't touched.";

  return (
    <DropdownMenu onOpenChange={(open) => open && setTarget(describeTreeTarget())}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`rounded p-0.5 transition-colors ${className}`}
          title={tooltip}
          aria-label={tooltip}
          onPointerEnter={() => setTooltip(buttonTooltip(describeTreeTarget()))}
        >
          <ArrowUpDown className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      {/* No focus ring left on the icon afterwards: a sort is an action, not a state. */}
      <DropdownMenuContent align="end" className="min-w-[12rem]" onCloseAutoFocus={(event) => event.preventDefault()}>
        <DropdownMenuLabel className="max-w-[16rem] truncate text-xs font-medium text-muted-foreground">
          Sort {label}
        </DropdownMenuLabel>
        <DropdownMenuItem
          disabled={!canSort}
          onSelect={() => void run("float-folders")}
          title={`Moves the folders in ${label} to the top, each part keeping its order. ${onlyHere}`}
        >
          <FolderUp />
          Float folders
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canSort}
          onSelect={() => void run("float-nested")}
          title={`Moves the items in ${label} that hold other items — folders with contents, notes with sub-pages — to the top, each part keeping its order. ${onlyHere}`}
        >
          <ListTree />
          Float nested
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canSort}
          onSelect={() => void run("name")}
          title={`Sorts ${label} ${nameDirection === "asc" ? "A–Z (0–9 first, numbers by value)" : "Z–A — it's already A–Z"}. Choose it again to flip. Floated folders or nested items stay on top, each part sorted. ${onlyHere}`}
        >
          {nameDirection === "asc" ? <ArrowDownAZ /> : <ArrowDownZA />}
          Name
          <span className="ml-auto pl-4 text-xs text-muted-foreground">
            {nameDirection === "asc" ? "A–Z" : "Z–A"}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
