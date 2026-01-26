/**
 * Admin Dashboard
 *
 * System overview with stats and recent activity.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSurfaceStyles } from "@/lib/design-system";
import type { SystemStats, AuditLogEntry } from "@/lib/admin/api-types";
import { Skeleton } from "@/components/client/ui/skeleton";

export default function AdminDashboard() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const glass0 = getSurfaceStyles("glass-0");

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/stats").then((r) => r.json()),
      fetch("/api/admin/audit-logs?limit=10").then((r) => r.json()),
    ])
      .then(([statsRes, logsRes]) => {
        if (statsRes.success) setStats(statsRes.data);
        if (logsRes.success) setRecentActivity(logsRes.data.logs);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load dashboard:", err);
        setError("Failed to load dashboard data");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          System overview and monitoring
        </p>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Users */}
          <StatCard
            title="Total Users"
            value={stats.users.total}
            subtitle={`${stats.users.activeLastWeek} active this week`}
            glass0={glass0}
          />

          {/* Total Content */}
          <StatCard
            title="Total Content"
            value={stats.content.total}
            subtitle={`${stats.content.published} published`}
            glass0={glass0}
          />

          {/* Storage Usage */}
          <StatCard
            title="Storage Used"
            value={stats.storage.totalBytes}
            subtitle="Across all users"
            glass0={glass0}
          />

          {/* Today's Activity */}
          <StatCard
            title="Created Today"
            value={stats.activity.contentCreatedToday}
            subtitle={`${stats.activity.contentCreatedThisWeek} this week`}
            glass0={glass0}
          />
        </div>
      )}

      {/* Users by Role Breakdown */}
      {stats && (
        <div
          className="border border-white/10 rounded-lg p-6"
          style={{
            background: glass0.background,
            backdropFilter: glass0.backdropFilter,
          }}
        >
          <h3 className="text-lg font-semibold mb-4">Users by Role</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(stats.users.byRole).map(([role, count]) => (
              <div key={role} className="text-center">
                <div className="text-3xl font-bold text-primary">{count}</div>
                <div className="text-sm text-muted-foreground capitalize mt-1">
                  {role}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content by Type */}
      {stats && (
        <div
          className="border border-white/10 rounded-lg p-6"
          style={{
            background: glass0.background,
            backdropFilter: glass0.backdropFilter,
          }}
        >
          <h3 className="text-lg font-semibold mb-4">Content by Type</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(stats.content.byType).map(([type, count]) => (
              <div key={type} className="text-center">
                <div className="text-2xl font-bold text-primary">{count}</div>
                <div className="text-sm text-muted-foreground capitalize mt-1">
                  {type}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div
        className="border border-white/10 rounded-lg p-6"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recent Admin Activity</h3>
          <Link
            href="/admin/audit-logs"
            className="text-sm text-primary hover:underline"
          >
            View all
          </Link>
        </div>

        {recentActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity</p>
        ) : (
          <div className="space-y-3">
            {recentActivity.map((log) => (
              <div key={log.id} className="flex items-start gap-3 text-sm">
                <div className="text-muted-foreground w-32 flex-shrink-0">
                  {formatRelativeTime(log.createdAt)}
                </div>
                <div className="flex-1">
                  <span className="font-medium text-primary">{log.username}</span>{" "}
                  <span className="text-muted-foreground">
                    {formatAction(log.action)}
                  </span>
                  {log.targetUsername && (
                    <span className="font-medium"> {log.targetUsername}</span>
                  )}
                  {log.targetContentTitle && (
                    <span className="font-medium"> "{log.targetContentTitle}"</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper Components

function StatCard({
  title,
  value,
  subtitle,
  glass0,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  glass0: { background: string; backdropFilter: string };
}) {
  return (
    <div
      className="border border-white/10 rounded-lg p-6"
      style={{
        background: glass0.background,
        backdropFilter: glass0.backdropFilter,
      }}
    >
      <h4 className="text-sm font-medium text-muted-foreground mb-2">
        {title}
      </h4>
      <div className="text-3xl font-bold mb-1">{value}</div>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 w-64" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-64" />
      <Skeleton className="h-96" />
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatAction(action: string): string {
  return action
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^view /, "viewed ")
    .replace(/^change /, "changed ")
    .replace(/^delete /, "deleted ")
    .replace(/^export /, "exported ");
}
