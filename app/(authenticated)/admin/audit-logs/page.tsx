/**
 * Admin Audit Logs Page
 *
 * View all admin actions with filters and CSV export.
 */

"use client";

import { useEffect, useState } from "react";
import { getSurfaceStyles } from "@/lib/design/system";
import type { AuditLogEntry } from "@/lib/domain/admin/api-types";
import { Skeleton } from "@/components/client/ui/skeleton";
import { Button } from "@/components/client/ui/button";
import { toast } from "sonner";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const glass0 = getSurfaceStyles("glass-0");

  const fetchLogs = async () => {
    try {
      const response = await fetch("/api/admin/audit-logs");
      const result = await response.json();

      if (result.success) {
        setLogs(result.data.logs);
      } else {
        toast.error("Failed to load audit logs");
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error);
      toast.error("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleExport = async () => {
    try {
      setExporting(true);
      const response = await fetch("/api/admin/audit-logs/export");

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit-logs-${new Date().toISOString()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        toast.success("Audit logs exported");
      } else {
        toast.error("Failed to export logs");
      }
    } catch (error) {
      console.error("Failed to export logs:", error);
      toast.error("Failed to export logs");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <AuditLogsSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Audit Logs</h1>
          <p className="text-muted-foreground mt-2">
            Complete history of admin actions
          </p>
        </div>
        <Button onClick={handleExport} disabled={exporting}>
          {exporting ? "Exporting..." : "Export CSV"}
        </Button>
      </div>

      {/* Audit Logs Table */}
      <div
        className="border border-white/10 rounded-lg overflow-hidden"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <table className="w-full">
          <thead className="border-b border-white/10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Timestamp
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Admin
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Target
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                IP Address
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-white/5">
                <td className="px-6 py-4 text-sm whitespace-nowrap">
                  {formatTimestamp(log.createdAt)}
                </td>
                <td className="px-6 py-4 text-sm font-medium">
                  {log.username}
                </td>
                <td className="px-6 py-4 text-sm">
                  <span className="inline-flex px-2 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-300">
                    {formatAction(log.action)}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  {log.targetUsername || log.targetContentTitle || "—"}
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground font-mono">
                  {log.ipAddress || "—"}
                </td>
                <td className="px-6 py-4 text-sm">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      toast.info("Details", {
                        description: (
                          <pre className="text-xs whitespace-pre-wrap max-w-md overflow-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        ),
                      });
                    }}
                  >
                    View JSON
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {logs.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No audit logs found
          </div>
        )}
      </div>
    </div>
  );
}

function formatTimestamp(date: Date): string {
  const d = new Date(date);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function AuditLogsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-96" />
    </div>
  );
}
