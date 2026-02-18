/**
 * Canvas View
 *
 * Visual graph view using ReactFlow for mind-map style visualization.
 * Displays content as nodes with connections.
 * M9 Phase 2: FolderPayload support
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import { FileText, Folder, File as FileIcon, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { FolderViewProps } from "./FolderViewContainer";
import { getDisplayExtension } from "@/lib/domain/content/file-extension-utils";

interface ContentChild {
  id: string;
  title: string;
  contentType: string;
  displayOrder: number;
}

interface ContentLink {
  sourceId: string;
  targetId: string;
}

export function CanvasView({
  folderId,
  folderTitle,
  viewPrefs = {},
  onUpdateView,
}: FolderViewProps) {
  const [items, setItems] = useState<ContentChild[]>([]);
  const [links, setLinks] = useState<ContentLink[]>([]);
  const [loading, setLoading] = useState(true);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    loadCanvasData();
  }, [folderId]);

  const loadCanvasData = async () => {
    try {
      setLoading(true);

      // Load folder contents
      const contentResponse = await fetch(`/api/content/content?parentId=${folderId}`);
      if (!contentResponse.ok) {
        throw new Error("Failed to load folder contents");
      }
      const contentData = await contentResponse.json();
      const loadedItems = contentData.data?.items || contentData.items || [];
      setItems(loadedItems);

      // TODO: Load content links from API
      // For now, create mock links
      const mockLinks: ContentLink[] = [];
      setLinks(mockLinks);

      // Create nodes from items
      const savedPositions = (viewPrefs.nodePositions || {}) as Record<string, { x: number; y: number }>;

      const newNodes: Node[] = loadedItems.map((item: ContentChild, index: number) => {
        const savedPos = savedPositions[item.id];
        const defaultX = (index % 4) * 250;
        const defaultY = Math.floor(index / 4) * 150;
        const displayExtension = getDisplayExtension(item);

        return {
          id: item.id,
          type: "default",
          position: savedPos || { x: defaultX, y: defaultY },
          data: {
            label: (
              <div className="flex items-center gap-2 px-3 py-2">
                {item.contentType === "folder" ? (
                  <Folder className="h-4 w-4" />
                ) : item.contentType === "file" ? (
                  <FileIcon className="h-4 w-4" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                <span className="text-sm font-medium flex-1">
                  {item.title}
                  {displayExtension && (
                    <span className="text-gray-600">{displayExtension}</span>
                  )}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(
                      new CustomEvent("content-selected", {
                        detail: { contentId: item.id },
                      })
                    );
                  }}
                  className="flex-shrink-0 p-1 rounded hover:bg-white/50 transition-colors"
                  title="Open in main panel"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-gray-600" />
                </button>
              </div>
            ),
          },
          style: {
            background: "rgba(255, 255, 255, 0.9)",
            border: "1px solid rgba(0, 0, 0, 0.1)",
            borderRadius: "8px",
            padding: 0,
          },
        };
      });

      // Create edges from links
      const newEdges: Edge[] = mockLinks.map((link) => ({
        id: `${link.sourceId}-${link.targetId}`,
        source: link.sourceId,
        target: link.targetId,
        type: "smoothstep",
        animated: true,
      }));

      setNodes(newNodes);
      setEdges(newEdges);
    } catch (error) {
      console.error("[CanvasView] Error loading canvas:", error);
      toast.error("Failed to load canvas view");
    } finally {
      setLoading(false);
    }
  };

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
    },
    [setEdges]
  );

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    // Trigger content selection
    window.dispatchEvent(
      new CustomEvent("content-selected", {
        detail: { contentId: node.id },
      })
    );
  }, []);

  const handleNodesChangeWithSave = useCallback(
    (changes: any[]) => {
      onNodesChange(changes);

      // Save node positions after drag
      const dragChange = changes.find((change) => change.type === "position" && change.dragging === false);
      if (dragChange && onUpdateView) {
        setTimeout(async () => {
          const positions: Record<string, { x: number; y: number }> = {};
          nodes.forEach((node) => {
            positions[node.id] = node.position;
          });

          try {
            await onUpdateView({
              viewPrefs: {
                ...viewPrefs,
                nodePositions: positions,
              },
            });
          } catch (error) {
            console.error("[CanvasView] Failed to save positions:", error);
          }
        }, 500);
      }
    },
    [onNodesChange, nodes, viewPrefs, onUpdateView]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-gray-600">Loading canvas...</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <FileText className="h-16 w-16 text-gray-400 mb-4" />
        <p className="text-sm text-gray-600 mb-2">No items to display</p>
        <p className="text-xs text-gray-500">
          Create content to see it visualized on the canvas
        </p>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChangeWithSave}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const item = items.find((i) => i.id === node.id);
            if (!item) return "#e5e7eb";
            switch (item.contentType) {
              case "folder":
                return "#fbbf24";
              case "note":
                return "#60a5fa";
              case "file":
                return "#34d399";
              default:
                return "#e5e7eb";
            }
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>
    </div>
  );
}
