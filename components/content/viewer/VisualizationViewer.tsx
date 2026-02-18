/**
 * Visualization Viewer Component
 *
 * Routes to appropriate visualization engine based on engine type:
 * - diagrams-net: DiagramsNetViewer
 * - excalidraw: ExcalidrawViewer (stub)
 * - mermaid: MermaidViewer (stub)
 */

"use client";

import dynamic from "next/dynamic";
import { BarChart3, AlertCircle, Loader2 } from "lucide-react";
import type {
  DiagramsNetConfig,
  DiagramsNetData,
  ExcalidrawConfig,
  ExcalidrawData,
  MermaidConfig,
  MermaidData,
} from "@/lib/domain/visualization/types";

// Dynamically import viewer components to avoid loading until needed
// This prevents Excalidraw's heavy CSS from blocking /content route compilation
const DiagramsNetViewer = dynamic(() => import("./DiagramsNetViewer").then(mod => ({ default: mod.DiagramsNetViewer })), {
  ssr: false,
  loading: () => <ViewerLoading engine="diagrams-net" />,
});

const ExcalidrawViewer = dynamic(() => import("./ExcalidrawViewer").then(mod => ({ default: mod.ExcalidrawViewer })), {
  ssr: false,
  loading: () => <ViewerLoading engine="excalidraw" />,
});

const MermaidViewer = dynamic(() => import("./MermaidViewer").then(mod => ({ default: mod.MermaidViewer })), {
  ssr: false,
  loading: () => <ViewerLoading engine="mermaid" />,
});

interface VisualizationViewerProps {
  contentId: string;
  title: string;
  engine?: string;
  config?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

export function VisualizationViewer({
  contentId,
  title,
  engine = "unknown",
  config,
  data,
}: VisualizationViewerProps) {
  // Save handler for auto-save
  const handleSave = async (updatedData: any) => {
    try {
      const response = await fetch(`/api/content/content/${contentId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          visualizationData: updatedData,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || "Failed to save visualization");
      }

      console.log("[VisualizationViewer] Saved successfully");
    } catch (err) {
      console.error("[VisualizationViewer] Save failed:", err);
      throw err;
    }
  };

  // Route to appropriate engine viewer
  switch (engine) {
    case "diagrams-net":
      return (
        <DiagramsNetViewer
          contentId={contentId}
          title={title}
          config={config as any}
          data={data as any}
          onSave={async (xml: string) => {
            await handleSave({ ...data, xml });
          }}
        />
      );

    case "excalidraw":
      return (
        <ExcalidrawViewer
          contentId={contentId}
          title={title}
          config={config as any}
          data={data as any}
          onSave={async (updatedData: any) => {
            await handleSave(updatedData); // Send only updated data, not merged
          }}
        />
      );

    case "mermaid":
      return (
        <MermaidViewer
          contentId={contentId}
          title={title}
          config={config as any}
          data={data as any}
          onSave={async (source: string) => {
            await handleSave({ source });
          }}
        />
      );

    default:
      return <VisualizationStub engine={engine} title={title} />;
  }
}

/**
 * Loading component shown while viewer is being dynamically imported
 */
function ViewerLoading({ engine }: { engine: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
        <p className="text-sm text-gray-400">Loading {engine} viewer...</p>
      </div>
    </div>
  );
}

/**
 * Stub component for not-yet-implemented visualization engines
 */
function VisualizationStub({ engine, title }: { engine: string; title: string }) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
        <BarChart3 className="h-5 w-5 text-purple-400" />
        <div>
          <h1 className="text-lg font-semibold text-white">{title}</h1>
          <p className="text-sm text-gray-400">Visualization ({engine})</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Coming Soon Banner */}
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-6 text-center">
          <div className="flex flex-col items-center gap-4">
            <AlertCircle className="h-12 w-12 text-yellow-400" />
            <div>
              <h3 className="text-xl font-medium text-yellow-100 mb-2">
                {engine} Visualization Coming Soon
              </h3>
              <p className="text-sm text-yellow-200/80 max-w-md">
                This visualization engine is planned for implementation. Check back soon!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
