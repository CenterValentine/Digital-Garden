/**
 * Kanban View
 *
 * Drag-and-drop card view for notes organized in columns.
 * Uses @dnd-kit for drag-and-drop functionality.
 * M9 Phase 2: FolderPayload support
 */

"use client";

import { useState, useEffect } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FileText, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { getSurfaceStyles } from "@/lib/design/system";
import type { FolderViewProps } from "./FolderViewContainer";
import { getDisplayExtension } from "@/lib/domain/content/file-extension-utils";

interface ContentChild {
  id: string;
  title: string;
  contentType: string;
  displayOrder: number;
  note?: {
    searchText: string;
  };
}

interface Column {
  id: string;
  title: string;
  items: ContentChild[];
}

function SortableCard({ item }: { item: ContentChild }) {
  const glass0 = getSurfaceStyles("glass-0");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Extract first few lines from searchText for preview
  const preview = item.note?.searchText || "No content";
  const previewLines = preview.split("\n").slice(0, 3).join("\n");
  const displayExtension = getDisplayExtension(item);

  const handleOpenContent = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent drag from triggering
    window.dispatchEvent(
      new CustomEvent("content-selected", {
        detail: { contentId: item.id },
      })
    );
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="p-3 mb-2 rounded-lg border border-white/10 cursor-move hover:border-primary/30 transition-colors"
    >
      <div
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className="text-sm font-medium text-gray-900 flex-1">
            {item.title}
            {displayExtension && (
              <span className="text-gray-600">{displayExtension}</span>
            )}
          </h4>
          <button
            onClick={handleOpenContent}
            className="flex-shrink-0 p-1 rounded hover:bg-white/20 transition-colors"
            title="Open in main panel"
          >
            <ExternalLink className="h-3.5 w-3.5 text-gray-600" />
          </button>
        </div>
        <p className="text-xs text-gray-600 line-clamp-3">{previewLines}</p>
      </div>
    </div>
  );
}

function DroppableColumn({
  column,
  children
}: {
  column: Column;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  const glass0 = getSurfaceStyles("glass-0");

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-80 flex flex-col transition-colors ${
        isOver ? "ring-2 ring-primary" : ""
      }`}
      style={{
        background: glass0.background,
        backdropFilter: glass0.backdropFilter,
      }}
    >
      {children}
    </div>
  );
}

export function KanbanView({
  folderId,
  folderTitle,
  viewPrefs = {},
  onUpdateView,
}: FolderViewProps) {
  const glass0 = getSurfaceStyles("glass-0");
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Kanban view preferences
  const columnTitles = viewPrefs.columnTitles || ["To Do", "In Progress", "Done"];

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    loadColumns();
  }, [folderId]);

  const saveKanbanState = async (updatedColumns: Column[]) => {
    if (!onUpdateView) return;

    try {
      // Build card assignments (card ID -> column ID)
      const cardAssignments: Record<string, string> = {};
      updatedColumns.forEach((col) => {
        col.items.forEach((item) => {
          cardAssignments[item.id] = col.id;
        });
      });

      // Build card order per column
      const cardOrder: Record<string, string[]> = {};
      updatedColumns.forEach((col) => {
        cardOrder[col.id] = col.items.map((item) => item.id);
      });

      await onUpdateView({
        viewPrefs: {
          ...viewPrefs,
          cardAssignments,
          cardOrder,
        },
      });
    } catch (error) {
      console.error("[KanbanView] Failed to save kanban state:", error);
    }
  };

  const handleAddCard = (columnId: string) => {
    // Dispatch custom event to trigger content creation
    window.dispatchEvent(
      new CustomEvent("create-content", {
        detail: {
          parentId: folderId,
          contentType: "note",
          columnId, // Can be used to auto-assign to this column
        },
      })
    );
  };

  const loadColumns = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/content/content?parentId=${folderId}&type=note`
      );

      if (!response.ok) {
        throw new Error("Failed to load notes");
      }

      const data = await response.json();
      const notes = data.data?.items || data.items || [];

      // Load saved column assignments from viewPrefs
      const cardAssignments = (viewPrefs.cardAssignments || {}) as Record<string, string>;
      const cardOrder = (viewPrefs.cardOrder || {}) as Record<string, string[]>;

      // Distribute notes across columns based on saved assignments
      const newColumns: Column[] = columnTitles.map((title: string, index: number) => {
        const columnId = `column-${index}`;

        // Get items assigned to this column
        let columnItems = notes.filter((note: ContentChild) =>
          cardAssignments[note.id] === columnId
        );

        // Apply saved order if available
        if (cardOrder[columnId]) {
          columnItems = cardOrder[columnId]
            .map((id: string) => columnItems.find((item: ContentChild) => item.id === id))
            .filter(Boolean) as ContentChild[];

          // Add any new items that aren't in the saved order
          const orderedIds = new Set(cardOrder[columnId]);
          const newItems = columnItems.filter((item: ContentChild) => !orderedIds.has(item.id));
          columnItems = [...columnItems, ...newItems];
        }

        return {
          id: columnId,
          title,
          items: columnItems,
        };
      });

      // Add unassigned notes to first column
      const assignedIds = new Set(Object.keys(cardAssignments));
      const unassignedNotes = notes.filter((note: ContentChild) => !assignedIds.has(note.id));
      if (unassignedNotes.length > 0) {
        newColumns[0].items = [...newColumns[0].items, ...unassignedNotes];
      }

      setColumns(newColumns);
    } catch (error) {
      console.error("[KanbanView] Error loading notes:", error);
      toast.error("Failed to load kanban board");
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find which columns contain the active and over items
    const activeColumn = columns.find((col) =>
      col.items.some((item) => item.id === activeId)
    );
    const overColumn = columns.find(
      (col) => col.id === overId || col.items.some((item) => item.id === overId)
    );

    if (!activeColumn || !overColumn) return;

    // If dragging to a different column
    if (activeColumn.id !== overColumn.id) {
      setColumns((prevColumns) => {
        // Create immutable copies to prevent direct mutation
        const activeItems = [...activeColumn.items];
        const overItems = [...overColumn.items];

        const activeIndex = activeItems.findIndex((item) => item.id === activeId);
        const overIndex = overId === overColumn.id ? 0 : overItems.findIndex((item) => item.id === overId);

        const [movedItem] = activeItems.splice(activeIndex, 1);
        overItems.splice(overIndex, 0, movedItem);

        const updatedColumns = prevColumns.map((col) => {
          if (col.id === activeColumn.id) {
            return { ...col, items: activeItems };
          }
          if (col.id === overColumn.id) {
            return { ...col, items: overItems };
          }
          return col;
        });

        // Save state after cross-column move
        setTimeout(() => saveKanbanState(updatedColumns), 500);

        return updatedColumns;
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find which column contains the active item
    const activeColumn = columns.find((col) =>
      col.items.some((item) => item.id === activeId)
    );

    if (!activeColumn) return;

    const activeIndex = activeColumn.items.findIndex((item) => item.id === activeId);
    const overIndex = activeColumn.items.findIndex((item) => item.id === overId);

    // Reorder within same column
    if (activeIndex !== -1 && overIndex !== -1) {
      setColumns((prevColumns) => {
        const updatedColumns = prevColumns.map((col) => {
          if (col.id === activeColumn.id) {
            const newItems = arrayMove(col.items, activeIndex, overIndex);
            return { ...col, items: newItems };
          }
          return col;
        });

        // Save state after reorder
        setTimeout(() => saveKanbanState(updatedColumns), 500);

        return updatedColumns;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-gray-600">Loading kanban board...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-x-auto p-6">
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 h-full">
          {columns.map((column) => (
            <DroppableColumn key={column.id} column={column}>
              {/* Column header */}
              <div className="p-4 border-b border-white/10">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center justify-between">
                  {column.title}
                  <span className="text-xs text-gray-500 ml-2">
                    {column.items.length}
                  </span>
                </h3>
              </div>

              {/* Column content */}
              <div className="flex-1 overflow-y-auto p-4">
                <SortableContext
                  items={column.items.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {column.items.map((item) => (
                    <SortableCard key={item.id} item={item} />
                  ))}
                </SortableContext>

                {column.items.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <FileText className="h-12 w-12 text-gray-400 mb-2" />
                    <p className="text-xs text-gray-500">No cards yet</p>
                  </div>
                )}
              </div>

              {/* Add card button */}
              <div className="p-4 border-t border-white/10">
                <button
                  onClick={() => handleAddCard(column.id)}
                  className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Add Card
                </button>
              </div>
            </DroppableColumn>
          ))}
        </div>

        <DragOverlay>
          {activeId ? (
            (() => {
              const activeItem = columns
                .flatMap((col) => col.items)
                .find((item) => item.id === activeId);
              if (!activeItem) return null;

              const preview = activeItem.note?.searchText || "No content";
              const previewLines = preview.split("\n").slice(0, 3).join("\n");

              return (
                <div className="p-3 rounded-lg border border-primary bg-white shadow-lg w-80">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">
                    {activeItem.title}
                  </h4>
                  <p className="text-xs text-gray-600 line-clamp-3">{previewLines}</p>
                </div>
              );
            })()
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
