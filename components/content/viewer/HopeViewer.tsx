/**
 * Hope/Goal Viewer Component (Stub)
 *
 * Placeholder for goals/aspirations tracking feature.
 * Full implementation planned for Milestone: Hope V1
 */

"use client";

import { Target, AlertCircle } from "lucide-react";

interface HopeViewerProps {
  title: string;
  kind?: string;
  status?: string;
  description?: string;
}

export function HopeViewer({
  title,
  kind = "goal",
  status = "active",
  description,
}: HopeViewerProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
        <Target className="h-5 w-5 text-pink-400" />
        <div>
          <h1 className="text-lg font-semibold text-white">{title}</h1>
          <p className="text-sm text-gray-400">
            {kind.charAt(0).toUpperCase() + kind.slice(1)} • {status}
          </p>
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
                Hope/Goal Tracking Coming Soon
              </h3>
              <p className="text-sm text-yellow-200/80 max-w-md">
                This feature is planned for <strong>Milestone: Hope V1</strong>. It will support:
              </p>
              <ul className="mt-4 text-sm text-yellow-200/80 text-left max-w-md mx-auto space-y-2">
                <li>• Goal and aspiration tracking</li>
                <li>• Status updates (active, completed, abandoned)</li>
                <li>• Milestone breakdowns and progress</li>
                <li>• Link related notes and resources</li>
                <li>• Timeline visualization</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Description if provided */}
        {description && (
          <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-gray-400 mb-2">Description</div>
            <p className="text-sm text-white whitespace-pre-wrap">{description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
