/**
 * Data Table Viewer Component (Stub)
 *
 * Placeholder for structured data tables feature.
 * Full implementation planned for Milestone: Data V1
 */

"use client";

import { Table, AlertCircle } from "lucide-react";

interface DataViewerProps {
  title: string;
  mode?: string;
  source?: Record<string, unknown>;
  schema?: Record<string, unknown>;
}

export function DataViewer({
  title,
  mode = "table",
  source,
  schema,
}: DataViewerProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
        <Table className="h-5 w-5 text-cyan-400" />
        <div>
          <h1 className="text-lg font-semibold text-white">{title}</h1>
          <p className="text-sm text-gray-400">Data Table ({mode})</p>
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
                Data Tables Coming Soon
              </h3>
              <p className="text-sm text-yellow-200/80 max-w-md">
                This feature is planned for <strong>Milestone: Data V1</strong>. It will support:
              </p>
              <ul className="mt-4 text-sm text-yellow-200/80 text-left max-w-md mx-auto space-y-2">
                <li>• Inline editable tables (spreadsheet-like)</li>
                <li>• Import from CSV, JSON, Excel</li>
                <li>• Sorting, filtering, and searching</li>
                <li>• Column type validation (text, number, date, etc.)</li>
                <li>• Export to multiple formats</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Debug: Show source/schema if any */}
        {(source || schema) && (
          <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-gray-400 mb-2">Data Configuration</div>
            {source && (
              <div className="text-xs text-gray-500 mb-2">
                Source keys: {Object.keys(source).join(", ")}
              </div>
            )}
            {schema && (
              <div className="text-xs text-gray-500">
                Schema keys: {Object.keys(schema).join(", ")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
