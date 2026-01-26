/**
 * Left Sidebar Content (Client Component)
 *
 * Loads file tree data and renders interactive tree.
 * M6: Conditionally shows SearchPanel when search is active.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { FileTreeWithDropZone } from "../FileTreeWithDropZone";
import { FileTreeSkeleton } from "../skeletons/FileTreeSkeleton";
import { SearchPanel } from "../SearchPanel";
import { ConfirmDialog } from "../ConfirmDialog";
import { LeftSidebarStatusBar } from "../LeftSidebarStatusBar";
import { useContentStore } from "@/stores/content-store";
import { useSearchStore } from "@/stores/search-store";
import { useTreeStateStore } from "@/stores/tree-state-store";
import type { TreeNode, ContentType } from "@/lib/content/types";

interface TreeApiResponse {
  success: boolean;
  data: {
    tree: TreeNode[];
    stats: {
      totalNodes: number;
      rootNodes: number;
      maxDepth: number;
      byType: Record<string, number>;
    };
  };
  error?: {
    code: string;
    message: string;
  };
}

interface LeftSidebarContentProps {
  refreshTrigger: number;
  createTrigger?: { type: "folder" | "note" | "docx" | "xlsx"; timestamp: number } | null;
  onSelectionChange?: (hasMultipleSelections: boolean) => void;
  onFileDrop?: (files: File[]) => void;
}

export function LeftSidebarContent({
  refreshTrigger,
  createTrigger,
  onSelectionChange,
  onFileDrop,
}: LeftSidebarContentProps) {
  const [treeData, setTreeData] = useState<TreeNode[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [creatingItem, setCreatingItem] = useState<{
    type: "folder" | "note" | "file" | "code" | "html" | "docx" | "xlsx";
    parentId: string | null;
    tempId: string; // Temporary ID for the placeholder node
  } | null>(null);
  const [expandNodeId, setExpandNodeId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    ids: string[];
    title: string;
    message: string;
    hasChildren: boolean;
    hasGoogleDriveFiles: boolean;
  } | null>(null);
  const [errorDialog, setErrorDialog] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [hasGoogleAuth, setHasGoogleAuth] = useState(false);
  const [deleteFromGoogleDrive, setDeleteFromGoogleDrive] = useState(true); // Default to true

  // Content selection store
  const selectedContentId = useContentStore((state) => state.selectedContentId);
  const setSelectedContentId = useContentStore((state) => state.setSelectedContentId);
  const { setSelectedIds } = useTreeStateStore();

  // Search store - conditionally show search panel
  const isSearchOpen = useSearchStore((state) => state.isSearchOpen);

  // Fetch tree data
  const fetchTree = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/notes/content/tree", {
        credentials: "include",
      });

      // Handle non-OK status before parsing JSON
      if (!response.ok) {
        // Try to parse error response
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const result: TreeApiResponse = await response.json();
          throw new Error(result.error?.message || "Failed to fetch tree");
        } else {
          // HTML error page
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      }

      const result: TreeApiResponse = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || "Failed to fetch tree");
      }

      setTreeData(result.data.tree);
    } catch (err) {
      console.error("Failed to fetch tree:", err);
      setError(err instanceof Error ? err.message : "Failed to load file tree");
    } finally {
      setIsLoading(false);
    }
  }, []);


  // Initial load and refresh when trigger changes
  useEffect(() => {
    fetchTree();
  }, [fetchTree, refreshTrigger]);

  // Check if user has Google authentication
  useEffect(() => {
    async function checkGoogleAuth() {
      try {
        const response = await fetch("/api/auth/provider");
        const data = await response.json();
        setHasGoogleAuth(data.success && data.data.hasGoogleAuth);
      } catch (err) {
        console.error("[LeftSidebar] Failed to check Google auth:", err);
        setHasGoogleAuth(false);
      }
    }
    checkGoogleAuth();
  }, []);

  // Load and save checkbox preference to/from localStorage
  useEffect(() => {
    // Load from localStorage on mount
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("deleteFromGoogleDrive");
      if (saved !== null) {
        setDeleteFromGoogleDrive(saved === "true");
      }
    }
  }, []); // Run once on mount

  // Save to localStorage when value changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("deleteFromGoogleDrive", String(deleteFromGoogleDrive));
    }
  }, [deleteFromGoogleDrive]);


  // Watch for create trigger from + button
  useEffect(() => {
    if (createTrigger) {
      // Pass the actual type from createTrigger (folder, note, docx, or xlsx)
      // parentId will be determined in handleCreate based on current selection
      handleCreate(null, createTrigger.type); // Pass null, we'll determine parent inside handleCreate
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createTrigger]);

  // Sync tree selection when selectedContentId changes (from search, backlinks, etc.)
  useEffect(() => {
    if (selectedContentId) {
      // Update tree selection to match the active file
      setSelectedIds([selectedContentId]);
    }
  }, [selectedContentId, setSelectedIds]);

  // Apply move operation to tree structure (for optimistic updates)
  const applyMoveToTree = (
    tree: TreeNode[],
    nodeId: string,
    newParentId: string | null,
    newIndex: number
  ): TreeNode[] => {
    // Find and remove the node from its current location
    let movedNode: TreeNode | null = null;
    let originalParentId: string | null = null;
    let originalIndex: number = -1;

    const removeNode = (nodes: TreeNode[], parentId: string | null = null): TreeNode[] => {
      return nodes
        .map((node, index) => {
          if (node.id === nodeId) {
            movedNode = node;
            originalParentId = parentId;
            originalIndex = index;
            return null; // Remove this node
          }
          if (node.children && node.children.length > 0) {
            return {
              ...node,
              children: removeNode(node.children, node.id),
            };
          }
          return node;
        })
        .filter((node): node is TreeNode => node !== null);
    };

    const treeCopy = removeNode(JSON.parse(JSON.stringify(tree)));

    if (!movedNode) return tree; // Node not found, return original

    // Adjust index if moving within the same parent
    // When we remove the node, indices shift down for items after it
    let adjustedIndex = newIndex;
    const isSameParent = originalParentId === newParentId;

    if (isSameParent && originalIndex !== -1 && originalIndex < newIndex) {
      // If we're moving down in the same parent, the index needs to be decreased by 1
      // because we removed the item, shifting everything down
      adjustedIndex = newIndex - 1;
    }


    // Insert the node at its new location
    const insertNode = (nodes: TreeNode[]): TreeNode[] => {
      // If this is the target parent (or root if newParentId is null)
      if (newParentId === null) {
        // Insert at root level
        const newNodes = [...nodes];
        newNodes.splice(adjustedIndex, 0, movedNode!);
        return newNodes;
      }

      return nodes.map((node) => {
        if (node.id === newParentId) {
          // Found the target parent, insert into its children
          const newChildren = [...(node.children || [])];
          newChildren.splice(adjustedIndex, 0, { ...movedNode!, parentId: newParentId });
          return {
            ...node,
            children: newChildren,
          };
        }
        if (node.children && node.children.length > 0) {
          return {
            ...node,
            children: insertNode(node.children),
          };
        }
        return node;
      });
    };

    return insertNode(treeCopy);
  };

  // Handle node move (drag-and-drop)
  const handleMove = async (args: {
    dragIds: string[];
    parentId: string | null;
    index: number;
  }) => {
    const { dragIds, parentId, index } = args;

    // Store original tree state for rollback if move fails
    const originalTree = treeData;

    if (!originalTree) return;

    // Find the dragged node's current position
    let currentParentId: string | null = null;
    let currentIndex = -1;

    const findNode = (nodes: TreeNode[], parent: string | null = null): boolean => {
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === dragIds[0]) {
          currentParentId = parent;
          currentIndex = i;
          return true;
        }
        if (nodes[i].children && nodes[i].children.length > 0) {
          if (findNode(nodes[i].children, nodes[i].id)) {
            return true;
          }
        }
      }
      return false;
    };

    findNode(originalTree);

    // Check if this is actually a position change
    const isSameParent = currentParentId === parentId;
    const isSamePosition = isSameParent && (currentIndex === index || currentIndex === index - 1);

    // Debug logging
    console.log('[handleMove] Drag analysis:', {
      draggedItem: dragIds[0],
      from: { parent: currentParentId || 'ROOT', index: currentIndex },
      to: { parent: parentId || 'ROOT', index },
      isSamePosition,
    });

    if (isSamePosition) {
      console.log('[handleMove] No position change detected, skipping API call');
      return; // Skip the move - item is being dropped in same position
    }

    try {
      // OPTIMISTIC UPDATE: Apply the move immediately to the UI
      const optimisticTree = applyMoveToTree(originalTree, dragIds[0], parentId, index);
      setTreeData(optimisticTree);

      // Calculate the API index: react-arborist gives us insertion point, but server expects final visual position
      // If moving down within same parent, we need to subtract 1 because server removes item first
      let apiIndex = index;
      if (isSameParent && currentIndex < index) {
        apiIndex = index - 1; // Adjust for removal shifting items left
      }

      console.log('[handleMove] Sending to API:', {
        contentId: dragIds[0],
        targetParentId: parentId || 'ROOT',
        newDisplayOrder: apiIndex,
      });

      // Make API call in background
      const response = await fetch("/api/notes/content/move", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentId: dragIds[0], // Only support single drag for now
          targetParentId: parentId,
          newDisplayOrder: apiIndex,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error("Move failed:", result.error);
        // Rollback to original tree state
        setTreeData(originalTree);
        toast.error("Failed to move item", {
          description: result.error?.message || "Could not move the item to the new location. Please try again.",
        });
        throw new Error(result.error?.message || "Failed to move content");
      }

      // Success! Optimistic update is complete, no refetch needed
      console.log("Move successful, optimistic update complete");
    } catch (err) {
      console.error("Failed to move node:", err);
      // Rollback to original tree state on any error
      setTreeData(originalTree);

      // Show user-friendly error notification
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      if (!errorMessage.includes("Failed to move content")) {
        // Only show toast if we haven't already shown one above
        toast.error("Failed to move item", {
          description: errorMessage,
        });
      }

      throw err;
    }
  };

  // Count total nodes in tree (including nested)
  const countTotalNodes = (nodes: TreeNode[]): number => {
    let count = 0;
    for (const node of nodes) {
      count += 1;
      if (node.children && node.children.length > 0) {
        count += countTotalNodes(node.children);
      }
    }
    return count;
  };

  // Handle node selection
  const handleSelect = (nodes: TreeNode[]) => {
    // Update selection count for status bar
    setSelectedCount(nodes.length);

    // Notify parent about multi-selection state (for disabling create button)
    const hasMultiple = nodes.length > 1;
    if (onSelectionChange) {
      onSelectionChange(hasMultiple);
    }

    // Open content in main panel - use first selected
    const firstNode = nodes[0];
    if (firstNode) {
      console.log("Selected node:", firstNode);

      // Open notes and files in the main panel
      if (firstNode.contentType === "note" || firstNode.contentType === "file") {
        setSelectedContentId(firstNode.id);
      } else {
        // For folders and other types, clear the content selection
        // This prevents folders from being loaded in main panel
        setSelectedContentId(null);
        console.log("Selected folder:", firstNode.title);
      }
    } else {
      // No selection - clear content
      setSelectedContentId(null);
    }
  };

  // Handler: Submit inline creation (when user presses Enter on temp node)
  const handleCreateSubmit = async (title: string) => {
    if (!creatingItem || !title.trim()) {
      // User submitted empty name - cancel creation
      handleCreateCancel();
      return;
    }

    const { type, parentId, tempId } = creatingItem;

    // Optimistically navigate to new file (not folders) immediately
    if (type !== "folder") {
      setSelectedContentId(tempId);
    }

    // Auto-add .md extension to note files if not present

    try {
      // Prepare payload based on content type
      const defaults: Record<string, { title: string; payload?: any; fileType?: "docx" | "xlsx" }> = {
        folder: { title: title.trim() },
        note: {
          title: title.trim(),
          payload: {
            tiptapJson: {
              type: "doc",
              content: [{ type: "paragraph" }],
            },
          },
        },
        code: {
          title: title.trim(),
          payload: {
            code: "// Your code here",
            language: "javascript",
          },
        },
        html: {
          title: title.trim(),
          payload: {
            html: "<h1>Hello World</h1>",
          },
        },
        file: {
          title: title.trim(),
          // File type requires upload flow - should not reach here
        },
        docx: {
          title: title.trim().endsWith(".docx") ? title.trim() : `${title.trim()}.docx`,
          fileType: "docx",
        },
        xlsx: {
          title: title.trim().endsWith(".xlsx") ? title.trim() : `${title.trim()}.xlsx`,
          fileType: "xlsx",
        },
      };

      const config = defaults[type];
      if (!config) {
        throw new Error(`Unknown content type: ${type}`);
      }

      // Build request body
      const requestBody: any = {
        title: config.title,
        parentId,
      };

      // Add type-specific payloads or use special endpoints
      if (type === "docx" || type === "xlsx") {
        // Office documents use dedicated creation endpoint
        const response = await fetch("/api/notes/content/create-document", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: config.title,
            fileType: config.fileType,
            parentId,
          }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          console.error("Create document failed:", result.error);

          // Remove temp node on error
          if (treeData) {
            const removeTempNode = (nodes: TreeNode[]): TreeNode[] => {
              return nodes
                .filter((node) => node.id !== tempId)
                .map((node) => ({
                  ...node,
                  children: node.children ? removeTempNode(node.children) : [],
                }));
            };
            setTreeData(removeTempNode(treeData));
          }
          setCreatingItem(null);
          setSelectedContentId(null);

          setErrorDialog({
            title: "Failed to create document",
            message: result.error?.message || "Unknown error occurred. Please try again.",
          });
          return;
        }

        // Success! Refresh tree to show new document
        fetchTree();
        setCreatingItem(null);
        setSelectedContentId(result.data.id);
        console.log(`[LeftSidebarContent] ${type.toUpperCase()} created:`, result.data.id);
        return;
      }

      if (type === "folder") {
        requestBody.isFolder = true;
      } else if (type === "note") {
        requestBody.tiptapJson = config.payload?.tiptapJson;
      } else if (type === "code") {
        requestBody.code = config.payload?.code;
        requestBody.language = config.payload?.language;
      } else if (type === "html") {
        requestBody.html = config.payload?.html;
      }

      // Create via API
      const response = await fetch("/api/notes/content", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error("Create failed:", result.error);

        // Remove temp node on error
        if (treeData) {
          const removeTempNode = (nodes: TreeNode[]): TreeNode[] => {
            return nodes
              .filter((node) => node.id !== tempId)
              .map((node) => ({
                ...node,
                children: node.children ? removeTempNode(node.children) : [],
              }));
          };
          setTreeData(removeTempNode(treeData));
        }
        setCreatingItem(null);

        // Clear optimistic navigation
        if (type !== "folder") {
          setSelectedContentId(null);
        }

        setErrorDialog({
          title: "Failed to create",
          message: result.error?.message || "Unknown error occurred. Please try again.",
        });
        return;
      }

      // Success! Replace temporary node with real node from server
      if (treeData && result.data) {
        const apiResponse = result.data;

        // Convert API response to TreeNode format
        const realNode: TreeNode = {
          id: apiResponse.id,
          title: apiResponse.title,
          slug: apiResponse.slug,
          parentId: apiResponse.parentId,
          displayOrder: apiResponse.displayOrder,
          customIcon: apiResponse.customIcon,
          iconColor: apiResponse.iconColor,
          isPublished: apiResponse.isPublished,
          contentType: apiResponse.contentType,
          children: type === "folder" ? [] : [],
          createdAt: new Date(apiResponse.createdAt),
          updatedAt: new Date(apiResponse.updatedAt),
          deletedAt: apiResponse.deletedAt ? new Date(apiResponse.deletedAt) : null,
        };

        // Add payload summaries if present
        if (apiResponse.note) {
          realNode.note = {
            wordCount: apiResponse.note.metadata?.wordCount,
            characterCount: apiResponse.note.metadata?.characterCount,
            readingTime: apiResponse.note.metadata?.readingTime,
          };
        }
        if (apiResponse.code) {
          realNode.code = {
            language: apiResponse.code.language,
          };
        }
        if (apiResponse.html) {
          realNode.html = {
            isTemplate: apiResponse.html.isTemplate,
          };
        }

        const replaceTempNode = (nodes: TreeNode[]): TreeNode[] => {
          return nodes.map((node) => {
            if (node.id === tempId) {
              // Replace temp node with real node from API
              return realNode;
            }
            if (node.children) {
              return { ...node, children: replaceTempNode(node.children) };
            }
            return node;
          });
        };

        setTreeData(replaceTempNode(treeData));
        setCreatingItem(null);

        // Navigate to newly created file (but not folders)
        if (type !== "folder") {
          setSelectedContentId(apiResponse.id);
        }
      } else {
        // Fallback: If API doesn't return expected data, refresh tree
        setCreatingItem(null);
        await fetchTree();
      }
    } catch (err) {
      console.error("Failed to create item:", err);

      // Remove temp node on error
      if (treeData) {
        const removeTempNode = (nodes: TreeNode[]): TreeNode[] => {
          return nodes
            .filter((node) => node.id !== tempId)
            .map((node) => ({
              ...node,
              children: node.children ? removeTempNode(node.children) : [],
            }));
        };
        setTreeData(removeTempNode(treeData));
      }
      setCreatingItem(null);

      // Clear optimistic navigation
      if (type !== "folder") {
        setSelectedContentId(null);
      }

      setErrorDialog({
        title: "Failed to create",
        message: "An unexpected error occurred. Please try again.",
      });
    }
  };

  // Handler: Cancel inline creation (Escape key or empty submission)
  const handleCreateCancel = () => {
    if (!creatingItem || !treeData) return;

    const { tempId } = creatingItem;

    // Remove temporary node from tree
    const removeTempNode = (nodes: TreeNode[]): TreeNode[] => {
      return nodes
        .filter((node) => node.id !== tempId)
        .map((node) => ({
          ...node,
          children: node.children ? removeTempNode(node.children) : [],
        }));
    };

    const newTreeData = removeTempNode(treeData);
    setTreeData(newTreeData);

    // Clear creating state
    setCreatingItem(null);
  };

  // Handler: Rename content node (or create if it's a temporary node)
  const handleRename = async (id: string, newName: string) => {
    // Check if this is a temporary node being created
    if (creatingItem && id === creatingItem.tempId) {
      // OPTIMISTIC: Update temp node title immediately to avoid flash
      if (treeData) {
        const updateTempTitle = (nodes: TreeNode[]): TreeNode[] => {
          return nodes.map((node) => {
            if (node.id === id) {
              return { ...node, title: newName.trim() };
            }
            if (node.children) {
              return { ...node, children: updateTempTitle(node.children) };
            }
            return node;
          });
        };
        setTreeData(updateTempTitle(treeData));
      }

      // This is inline creation - create the actual file/folder
      await handleCreateSubmit(newName.trim());
      return;
    }

    // Regular rename flow
    if (!newName.trim()) return;

    // OPTIMISTIC UPDATE: Immediately update the local tree
    const originalTreeData = treeData;
    if (treeData) {
      const updateNodeTitle = (nodes: TreeNode[]): TreeNode[] => {
        return nodes.map((node) => {
          if (node.id === id) {
            return { ...node, title: newName.trim() };
          }
          if (node.children) {
            return { ...node, children: updateNodeTitle(node.children) };
          }
          return node;
        });
      };

      setTreeData(updateNodeTitle(treeData));
    }

    try {
      const response = await fetch(`/api/notes/content/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newName.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error("Rename failed:", result.error);
        // Rollback to original tree data on failure
        setTreeData(originalTreeData);
        setErrorDialog({
          title: "Failed to rename",
          message: result.error?.message || "Unknown error occurred. Please try again.",
        });
        return;
      }

      // Success! The optimistic update is already visible.
      // Notify other components (e.g., MainPanel) that content was updated
      window.dispatchEvent(new CustomEvent('content-updated', {
        detail: {
          contentId: id,
          updates: { title: newName.trim() }
        }
      }));
      // Optionally refresh to sync with server (slug, updatedAt, etc.)
      // For now, skip refresh to keep it snappy
    } catch (err) {
      console.error("Failed to rename:", err);
      // Rollback to original tree data on error
      setTreeData(originalTreeData);
      setErrorDialog({
        title: "Failed to rename",
        message: "An unexpected error occurred. Please try again.",
      });
    }
  };

  // Handler: Delete content nodes (soft delete) - supports batch delete
  const handleDelete = async (idsToDelete: string | string[]) => {
    // Normalize to array
    const ids = Array.isArray(idsToDelete) ? idsToDelete : [idsToDelete];

    if (ids.length === 0) return;

    // Find all nodes to show titles in confirmation dialog
    const findNode = (nodes: TreeNode[], targetId: string): TreeNode | null => {
      for (const node of nodes) {
        if (node.id === targetId) return node;
        if (node.children) {
          const found = findNode(node.children, targetId);
          if (found) return found;
        }
      }
      return null;
    };

    const nodesToDelete = ids
      .map(id => (treeData ? findNode(treeData, id) : null))
      .filter((node): node is TreeNode => node !== null);

    // Count total items including nested children
    const countNestedItems = (node: TreeNode): number => {
      let count = 1; // Count the node itself
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          count += countNestedItems(child);
        }
      }
      return count;
    };

    const totalItemCount = nodesToDelete.reduce((sum, node) => sum + countNestedItems(node), 0);

    // Build confirmation title (shown in dialog title)
    let confirmTitle: string;
    if (nodesToDelete.length === 1) {
      const node = nodesToDelete[0];
      const nestedCount = countNestedItems(node) - 1; // Exclude the node itself
      if (nestedCount > 0) {
        confirmTitle = `"${node.title}" (${nestedCount + 1} items total)`;
      } else {
        confirmTitle = `"${node.title}"`;
      }
    } else {
      confirmTitle = `${nodesToDelete.length} items (${totalItemCount} total)`;
    }

    // Build confirmation message (shown in dialog body)
    let confirmMessage: string;
    if (nodesToDelete.length === 1) {
      const node = nodesToDelete[0];
      const nestedCount = countNestedItems(node) - 1;
      if (nestedCount > 0) {
        confirmMessage = `This folder contains ${nestedCount} nested item${nestedCount === 1 ? '' : 's'}.`;
      } else {
        confirmMessage = "";
      }
    } else if (nodesToDelete.length <= 5) {
      // 2-5 items: show bulleted list with nested counts
      const itemList = nodesToDelete
        .map(n => {
          const nestedCount = countNestedItems(n) - 1;
          if (nestedCount > 0) {
            return `• ${n.title} (${nestedCount + 1} items)`;
          }
          return `• ${n.title}`;
        })
        .join("\n");
      confirmMessage = itemList;
    } else {
      // 6+ items: show count with first 3 examples
      const examples = nodesToDelete
        .slice(0, 3)
        .map(n => {
          const nestedCount = countNestedItems(n) - 1;
          if (nestedCount > 0) {
            return `• ${n.title} (${nestedCount + 1} items)`;
          }
          return `• ${n.title}`;
        })
        .join("\n");
      const remaining = nodesToDelete.length - 3;
      confirmMessage = `${examples}\n• ...and ${remaining} more`;
    }

    // Check if any items have children
    const hasChildren = nodesToDelete.some(node =>
      node.children && node.children.length > 0
    );

    // Check if any files have Google Drive metadata (async check)
    let hasGoogleDriveFiles = false;
    if (hasGoogleAuth) {
      try {
        // Check metadata for all items in parallel
        const metadataChecks = ids.map(async (id) => {
          try {
            const response = await fetch(`/api/notes/content/${id}`, {
              credentials: "include",
            });
            if (response.ok) {
              const data = await response.json();
              const metadata = data.data?.file?.storageMetadata;
              const googleDriveFileId = metadata?.externalProviders?.googleDrive?.fileId;
              return !!googleDriveFileId;
            }
          } catch {
            return false;
          }
          return false;
        });

        const results = await Promise.all(metadataChecks);
        hasGoogleDriveFiles = results.some(hasGoogleDrive => hasGoogleDrive);
      } catch (err) {
        console.error("[Delete] Failed to check Google Drive metadata:", err);
        hasGoogleDriveFiles = false;
      }
    }

    // Show confirmation dialog with appropriate message
    setDeleteConfirm({
      ids,
      title: confirmTitle,
      message: confirmMessage,
      hasChildren,
      hasGoogleDriveFiles,
    });
  };

  // Handler: Perform actual delete after confirmation (supports batch delete)
  const handleDeleteConfirmed = async (ids: string[]) => {
    try {
      // Get node titles and Google Drive metadata before deleting
      const findNode = (nodes: TreeNode[], targetId: string): TreeNode | null => {
        for (const node of nodes) {
          if (node.id === targetId) return node;
          if (node.children) {
            const found = findNode(node.children, targetId);
            if (found) return found;
          }
        }
        return null;
      };

      const nodeMap = new Map<string, string>();
      const googleDriveFiles: Array<{ contentId: string; fileId: string }> = [];

      if (treeData) {
        // First, fetch metadata for all items to check for Google Drive files
        const metadataPromises = ids.map(async (id) => {
          const node = findNode(treeData, id);
          if (node) {
            nodeMap.set(id, node.title);

            // Only check for Google Drive metadata if user wants to delete from Drive
            if (hasGoogleAuth && deleteFromGoogleDrive) {
              try {
                const response = await fetch(`/api/notes/content/${id}`, {
                  credentials: "include",
                });
                if (response.ok) {
                  const data = await response.json();
                  const metadata = data.data?.file?.storageMetadata;
                  const googleDriveFileId = metadata?.externalProviders?.googleDrive?.fileId;
                  if (googleDriveFileId) {
                    googleDriveFiles.push({ contentId: id, fileId: googleDriveFileId });
                  }
                }
              } catch (err) {
                console.error(`[Delete] Failed to fetch metadata for ${id}:`, err);
              }
            }
          }
        });

        await Promise.all(metadataPromises);
      }

      // Delete from Google Drive first (if applicable)
      if (googleDriveFiles.length > 0) {
        console.log(`[Delete] Deleting ${googleDriveFiles.length} files from Google Drive...`);
        const googleDeletePromises = googleDriveFiles.map(async ({ contentId, fileId }) => {
          try {
            const response = await fetch("/api/google-drive/delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ fileId, contentId }),
            });

            if (!response.ok) {
              console.error(`[Delete] Failed to delete Google Drive file ${fileId}`);
            } else {
              console.log(`[Delete] Successfully deleted Google Drive file ${fileId}`);
            }
          } catch (err) {
            console.error(`[Delete] Error deleting Google Drive file ${fileId}:`, err);
          }
        });

        // Wait for Google Drive deletes (but don't fail if they error)
        await Promise.all(googleDeletePromises);
      }

      // Delete all items in parallel with enhanced error tracking
      const deletePromises = ids.map(id =>
        fetch(`/api/notes/content/${id}`, {
          method: "DELETE",
          credentials: "include",
        }).then(async (response) => {
          const result = await response.json();
          if (!response.ok || !result.success) {
            throw new Error(result.error?.message || "Failed to delete");
          }
          return { id, success: true, title: nodeMap.get(id) || id };
        }).catch((error) => {
          // Capture both ID and title for failed items
          return { id, success: false, title: nodeMap.get(id) || id, error: error.message };
        })
      );

      // Wait for all deletes to complete
      const results = await Promise.all(deletePromises);

      // Separate successes and failures
      const failures = results.filter(r => !r.success);
      const successes = results.filter(r => r.success);

      if (failures.length > 0) {
        console.error("Some deletes failed:", failures);

        // Build detailed error message with item names
        let errorMessage: string;
        if (failures.length <= 3) {
          // Show all failed item names if 3 or fewer
          const failedNames = failures.map(f => `"${f.title}"`).join(", ");
          errorMessage = `Failed to delete: ${failedNames}`;
        } else {
          // Show first 3 + count if more than 3
          const firstThree = failures.slice(0, 3).map(f => `"${f.title}"`).join(", ");
          const remaining = failures.length - 3;
          errorMessage = `Failed to delete: ${firstThree}, and ${remaining} more item${remaining === 1 ? '' : 's'}`;
        }

        // If some succeeded, mention that too
        if (successes.length > 0) {
          errorMessage += `\n\n${successes.length} item${successes.length === 1 ? ' was' : 's were'} deleted successfully.`;
        }

        setErrorDialog({
          title: `Failed to delete ${failures.length} of ${ids.length} items`,
          message: errorMessage,
        });
      }

      // Refresh tree to remove deleted items (even if some failed)
      await fetchTree();
    } catch (err) {
      console.error("Failed to delete:", err);
      setErrorDialog({
        title: "Failed to delete",
        message: "An unexpected error occurred. Please try again.",
      });
    }
  };

  // Handler: Download file(s) (single or batch)
  const handleDownload = async (idsToDownload: string[]) => {
    if (idsToDownload.length === 0) return;

    try {
      // Download each file
      for (const id of idsToDownload) {
        // Use direct download endpoint with download=true to force download
        // This prevents text files from opening in browser
        const downloadUrl = `/api/notes/content/${id}/download?download=true`;

        // Trigger download
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Show success toast for single file
        if (idsToDownload.length === 1) {
          toast.success("Download started");
        }
      }

      // Show success toast for batch downloads
      if (idsToDownload.length > 1) {
        toast.success(`Started downloading ${idsToDownload.length} files`);
      }
    } catch (err) {
      console.error("Failed to download:", err);
      toast.error("Download failed", {
        description: "An unexpected error occurred. Please try again.",
      });
    }
  };

  // Handler: Duplicate content node(s) (supports batch duplicate)
  const handleDuplicate = async (idsToDuplicate: string[]) => {
    if (idsToDuplicate.length === 0) return;

    try {
      const response = await fetch("/api/notes/content/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: idsToDuplicate }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || "Failed to duplicate content");
      }

      const duplicatedCount = result.data.duplicated.length;

      // Show success toast
      if (duplicatedCount === 1) {
        toast.success(`Duplicated "${result.data.duplicated[0].title}"`);
      } else {
        toast.success(`Duplicated ${duplicatedCount} items`);
      }

      // Refresh tree to show duplicated items
      fetchTree();
    } catch (err) {
      console.error("Failed to duplicate:", err);
      toast.error("Failed to duplicate", {
        description: err instanceof Error ? err.message : "An unexpected error occurred. Please try again.",
      });
    }
  };

  // Handler: Create new content node (all types)
  // This creates a temporary placeholder node in the tree for inline naming
  const handleCreate = async (requestedParentId: string | null, type: "folder" | "note" | "file" | "code" | "html" | "docx" | "xlsx") => {
    // File upload requires special two-phase flow - show dialog instead
    if (type === "file") {
      setErrorDialog({
        title: "File upload not implemented",
        message: "File upload requires selecting a file. This will be implemented with a file picker dialog in a future update.",
      });
      return;
    }

    // Office documents (docx, xlsx) now support inline naming (changed from immediate creation)

    if (!treeData) return;

    // Determine parentId based on current selection (from persisted tree state)
    let parentId = requestedParentId;

    // Only override if we were passed null (from + button)
    if (parentId === null) {
      // Get current selection from tree state store
      const { selectedIds: treeSelectedIds } = useTreeStateStore.getState();

      if (treeSelectedIds.length === 1) {
        // Find the selected node
        const findNode = (nodes: TreeNode[]): TreeNode | null => {
          for (const node of nodes) {
            if (node.id === treeSelectedIds[0]) return node;
            if (node.children) {
              const found = findNode(node.children);
              if (found) return found;
            }
          }
          return null;
        };

        const selectedNode = findNode(treeData);

        if (selectedNode) {
          // If selected node is a folder, create inside it
          // Otherwise, create as sibling (same parent)
          if (selectedNode.contentType === "folder") {
            parentId = selectedNode.id;
          } else {
            parentId = selectedNode.parentId;
          }
        }
      }
    }

    // Generate temporary ID for the placeholder node
    const tempId = `temp-${Date.now()}-${Math.random()}`;

    // Create temporary placeholder node
    // Note: docx/xlsx types use contentType="file" since they're FilePayload
    const contentType: ContentType = (type === "docx" || type === "xlsx") ? "file" : type as ContentType;

    const tempNode: TreeNode = {
      id: tempId,
      title: "", // Empty - user will type the name
      slug: "",
      contentType,
      parentId: parentId,
      displayOrder: 0,
      customIcon: null,
      iconColor: null,
      isPublished: false,
      children: type === "folder" ? [] : [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    // Insert temporary node into tree data
    const insertTempNode = (nodes: TreeNode[]): TreeNode[] => {
      if (parentId === null) {
        // Insert at root level (at the beginning)
        return [tempNode, ...nodes];
      }

      return nodes.map((node) => {
        if (node.id === parentId) {
          // Found parent - insert temp node as first child
          return {
            ...node,
            children: [tempNode, ...(node.children || [])],
          };
        }
        if (node.children) {
          return {
            ...node,
            children: insertTempNode(node.children),
          };
        }
        return node;
      });
    };

    // Update tree with temporary node
    const newTreeData = insertTempNode(treeData);
    setTreeData(newTreeData);

    // Set creating state to track the temporary node
    setCreatingItem({
      type,
      parentId,
      tempId,
    });

    // IMPORTANT: If creating inside a folder, we need to auto-expand it
    // so the temporary node becomes visible and can enter edit mode
    if (parentId !== null) {
      // Signal FileTree to expand this node imperatively
      setExpandNodeId(parentId);
    }

    // Note: The actual API call happens in handleCreateSubmit when user presses Enter
  };

  // Show search panel when search is active
  if (isSearchOpen) {
    return <SearchPanel />;
  }

  // Loading state
  if (isLoading) {
    return <FileTreeSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center">
        <div className="text-sm text-red-400 mb-2">Failed to load file tree</div>
        <div className="text-xs text-gray-500 mb-4">{error}</div>
        <button
          onClick={fetchTree}
          className="px-4 py-2 text-sm bg-primary/10 hover:bg-primary/20 rounded transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (!treeData || treeData.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center">
        <div className="text-sm text-gray-400 mb-2">No files yet</div>
        <div className="text-xs text-gray-500">
          Create your first note or folder to get started
        </div>
      </div>
    );
  }

  // Render tree
  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* File tree with drag-and-drop zone */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <FileTreeWithDropZone
            data={treeData}
            onMove={handleMove}
            onSelect={handleSelect}
            onRename={handleRename}
            onCreate={handleCreate}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onDownload={handleDownload}
            height={800}
            editingNodeId={creatingItem?.tempId}
            expandNodeId={expandNodeId}
            onExpandComplete={() => setExpandNodeId(null)}
            onFileDrop={onFileDrop}
          />
        </div>

        {/* Status bar */}
        <LeftSidebarStatusBar
          selectedCount={selectedCount}
          totalCount={countTotalNodes(treeData)}
        />
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title={`Delete ${deleteConfirm?.title}?`}
        description={
          deleteConfirm?.message
            ? `${deleteConfirm.message}\n\n${
                deleteConfirm.hasChildren
                  ? "This will move the selected item(s) and all nested content to trash."
                  : "This will move the selected item(s) to trash."
              }`
            : deleteConfirm?.hasChildren
            ? "This will move the selected item(s) and all nested content to trash."
            : "This will move the selected item(s) to trash."
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => deleteConfirm && handleDeleteConfirmed(deleteConfirm.ids)}
        checkbox={hasGoogleAuth && deleteConfirm?.hasGoogleDriveFiles ? {
          label: "Also delete from Google Drive",
          checked: deleteFromGoogleDrive,
          onChange: setDeleteFromGoogleDrive,
        } : undefined}
      />

      {/* Error dialog */}
      {errorDialog && (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => !open && setErrorDialog(null)}
          title={errorDialog.title}
          description={errorDialog.message}
          confirmLabel="OK"
          confirmVariant="primary"
          onConfirm={() => setErrorDialog(null)}
        />
      )}
    </>
  );
}
