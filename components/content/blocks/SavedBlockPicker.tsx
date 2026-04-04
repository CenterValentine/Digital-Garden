/**
 * Saved Block Picker
 *
 * Modal popup for browsing and inserting saved blocks from the library.
 * Triggered by the "/Saved Block" slash command via CustomEvent.
 *
 * Fetches from /api/content/saved-blocks and groups by category.
 * On selection, inserts the block's TipTap JSON into the editor
 * and increments usage count.
 *
 * Epoch 11 Sprint 43
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Search, Package } from "lucide-react";
import { regenerateBlockId } from "@/lib/domain/blocks/schema";

interface SavedBlockItem {
  id: string;
  title: string;
  blockType: string;
  tiptapJson: Record<string, unknown>;
  categoryName: string;
  isSystem: boolean;
  usageCount: number;
}

interface SavedBlockPickerProps {
  onInsert: (tiptapJson: Record<string, unknown>) => void;
}

export function SavedBlockPicker({ onInsert }: SavedBlockPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [blocks, setBlocks] = useState<SavedBlockItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Listen for the open event from slash commands
  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      fetchBlocks();
    };

    window.addEventListener("open-saved-block-picker", handleOpen);
    return () =>
      window.removeEventListener("open-saved-block-picker", handleOpen);
  }, []);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const fetchBlocks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/content/saved-blocks");
      if (res.ok) {
        const data = await res.json();
        setBlocks(data);
      }
    } catch (err) {
      console.error("Failed to fetch saved blocks:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = useCallback(
    async (block: SavedBlockItem) => {
      // Regenerate blockId for the inserted copy
      const clonedJson = regenerateBlockId(
        block.tiptapJson as Record<string, unknown>
      );
      onInsert(clonedJson);
      setIsOpen(false);

      // Track usage (fire and forget)
      fetch(`/api/content/saved-blocks/${block.id}/use`, {
        method: "POST",
      }).catch(() => {});
    },
    [onInsert]
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearch("");
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  // Filter blocks by search
  const filtered = blocks.filter((block) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      block.title.toLowerCase().includes(q) ||
      block.blockType.toLowerCase().includes(q) ||
      block.categoryName.toLowerCase().includes(q)
    );
  });

  // Group by category
  const grouped = filtered.reduce<Record<string, SavedBlockItem[]>>(
    (acc, block) => {
      const key = block.categoryName;
      if (!acc[key]) acc[key] = [];
      acc[key].push(block);
      return acc;
    },
    {}
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-gray-900/95 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Package className="h-4 w-4" />
            Saved Blocks
          </h3>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-white/10">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 opacity-40" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search blocks..."
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md bg-white/5 border border-white/10 focus:border-white/30 focus:outline-none"
            />
          </div>
        </div>

        {/* Block list */}
        <div className="max-h-80 overflow-y-auto p-2">
          {loading && (
            <p className="text-xs opacity-40 text-center py-4">Loading...</p>
          )}

          {!loading && filtered.length === 0 && (
            <p className="text-xs opacity-40 text-center py-4">
              {blocks.length === 0
                ? "No saved blocks yet. Save a block from the editor to see it here."
                : "No blocks match your search."}
            </p>
          )}

          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="mb-2">
              <p className="text-[10px] uppercase tracking-wider opacity-40 px-2 py-1">
                {category}
              </p>
              {items.map((block) => (
                <button
                  key={block.id}
                  onClick={() => handleSelect(block)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-white/10 transition-colors flex items-center justify-between group"
                >
                  <div>
                    <p className="text-sm">{block.title}</p>
                    <p className="text-xs opacity-40">{block.blockType}</p>
                  </div>
                  {block.isSystem && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 opacity-40">
                      System
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
