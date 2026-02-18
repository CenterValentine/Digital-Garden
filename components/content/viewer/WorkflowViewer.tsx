/**
 * Workflow Viewer Component (Stub)
 *
 * Placeholder for automation workflows feature.
 * IMPORTANT: Execution is DISABLED for security reasons.
 * Full implementation planned for Milestone: Workflow V1
 */

"use client";

import { GitBranch, AlertTriangle, AlertCircle } from "lucide-react";

interface WorkflowViewerProps {
  title: string;
  engine?: string;
  definition?: Record<string, unknown>;
  enabled?: boolean;
}

export function WorkflowViewer({
  title,
  engine = "unknown",
  definition,
  enabled = false,
}: WorkflowViewerProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
        <GitBranch className="h-5 w-5 text-orange-400" />
        <div>
          <h1 className="text-lg font-semibold text-white">{title}</h1>
          <p className="text-sm text-gray-400">Workflow ({engine})</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Security Warning Banner */}
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5" />
            <div>
              <h3 className="font-medium text-red-100">Workflow Execution Disabled</h3>
              <p className="mt-1 text-sm text-red-200/80">
                For security reasons, workflow execution is <strong>permanently disabled</strong> in this
                phase. Workflows can be viewed and edited, but will never execute automatically.
              </p>
            </div>
          </div>
        </div>

        {/* Coming Soon Banner */}
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-6 text-center">
          <div className="flex flex-col items-center gap-4">
            <AlertCircle className="h-12 w-12 text-yellow-400" />
            <div>
              <h3 className="text-xl font-medium text-yellow-100 mb-2">
                Workflow Designer Coming Soon
              </h3>
              <p className="text-sm text-yellow-200/80 max-w-md">
                This feature is planned for <strong>Milestone: Workflow V1</strong>. It will support:
              </p>
              <ul className="mt-4 text-sm text-yellow-200/80 text-left max-w-md mx-auto space-y-2">
                <li>• Visual workflow builder (node-based editor)</li>
                <li>• Trigger definitions (manual, scheduled, event-based)</li>
                <li>• Action nodes (API calls, file operations, etc.)</li>
                <li>• Conditional logic and branching</li>
                <li>• <strong>View-only mode</strong> (execution permanently disabled)</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Debug: Show definition if any */}
        {definition && (
          <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-gray-400 mb-2">Workflow Definition</div>
            <div className="text-xs text-gray-500">
              Definition keys: {Object.keys(definition).join(", ")}
            </div>
            {enabled && (
              <div className="mt-2 text-xs text-red-400">
                ⚠️ Enabled flag is set, but execution is blocked at the system level
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
