/**
 * Storage Usage Tab
 *
 * Show storage quota, usage breakdown, and export data
 */

"use client";

import { useState } from "react";
import { getSurfaceStyles } from "@/lib/design-system";
import { toast } from "sonner";

// Dummy data
const DUMMY_USAGE = {
  used: 425 * 1024 * 1024, // 425 MB
  quota: 5 * 1024 * 1024 * 1024, // 5 GB
  tier: "basic",
  breakdown: {
    r2: 325 * 1024 * 1024, // 325 MB
    s3: 100 * 1024 * 1024, // 100 MB
  },
  fileCount: 342,
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function StorageUsageTab() {
  const glass0 = getSurfaceStyles("glass-0");
  const [usage] = useState(DUMMY_USAGE);

  const percentUsed = (usage.used / usage.quota) * 100;

  const handleExportData = () => {
    console.log("[UsageTab] Export data clicked");
    toast.success("Preparing data export... (wired to console)");
  };

  const handleUpgrade = () => {
    console.log("[UsageTab] Upgrade clicked");
    toast.info("Upgrade to Pro (wired to console)");
  };

  return (
    <div className="space-y-6">
      {/* Storage Quota */}
      <div
        className="border border-white/10 rounded-lg p-6"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h3 className="text-lg font-semibold mb-2">Storage Usage</h3>
        <p className="text-sm text-muted-foreground mb-4">
          You're using {formatBytes(usage.used)} of {formatBytes(usage.quota)}
        </p>

        {/* Progress Bar */}
        <div className="relative w-full h-4 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500"
            style={{ width: `${Math.min(percentUsed, 100)}%` }}
          />
        </div>

        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>{percentUsed.toFixed(1)}% used</span>
          <span>{usage.tier.charAt(0).toUpperCase() + usage.tier.slice(1)} Tier</span>
        </div>

        {/* Warning if nearing quota */}
        {percentUsed > 90 && (
          <div className="mt-4 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10">
            <div className="flex gap-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-yellow-400 flex-shrink-0 mt-0.5"
              >
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-yellow-400">
                  Storage Almost Full
                </h4>
                <p className="text-sm text-gray-300 mt-1">
                  You're using {percentUsed.toFixed(0)}% of your storage quota.
                  Upgrade to increase your limit.
                </p>
                <button
                  onClick={handleUpgrade}
                  className="mt-2 px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary/90 transition-colors font-medium"
                >
                  Upgrade to Pro
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Storage by Provider */}
      <div
        className="border border-white/10 rounded-lg p-6"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h3 className="text-lg font-semibold mb-4">Storage by Provider</h3>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-sm">Cloudflare R2</span>
            </div>
            <span className="text-sm font-mono text-muted-foreground">
              {formatBytes(usage.breakdown.r2)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-sm">Amazon S3</span>
            </div>
            <span className="text-sm font-mono text-muted-foreground">
              {formatBytes(usage.breakdown.s3)}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-white/10 flex justify-between text-sm font-semibold">
          <span>Total</span>
          <span className="font-mono">{formatBytes(usage.used)}</span>
        </div>
      </div>

      {/* File Count */}
      <div
        className="border border-white/10 rounded-lg p-6"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h3 className="text-lg font-semibold mb-4">Files & Folders</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-3xl font-bold text-primary">{usage.fileCount}</div>
            <div className="text-sm text-muted-foreground mt-1">Total Files</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-blue-400">42</div>
            <div className="text-sm text-muted-foreground mt-1">Folders</div>
          </div>
        </div>
      </div>

      {/* Export Data (GDPR Compliance) */}
      <div
        className="border border-white/10 rounded-lg p-6"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h3 className="text-lg font-semibold mb-2">Export Your Data</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Download all your files and notes for offline backup or migration
        </p>

        <button
          onClick={handleExportData}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </svg>
          Export All Data (.zip)
        </button>

        <div
          className="mt-4 p-4 rounded-lg border border-blue-500/30 bg-blue-500/10"
          style={{
            backdropFilter: glass0.backdropFilter,
          }}
        >
          <div className="flex gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-blue-400 flex-shrink-0 mt-0.5"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <div>
              <h4 className="text-sm font-semibold text-blue-400">Your Data, Your Control</h4>
              <p className="text-sm text-gray-300 mt-1">
                Your data remains yours. You can export and migrate at any time.{" "}
                <a
                  href="/docs/data-export"
                  className="text-primary hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    toast.info("Documentation link (wired to console)");
                  }}
                >
                  Learn more
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tier Comparison */}
      <div
        className="border border-white/10 rounded-lg p-6"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h3 className="text-lg font-semibold mb-4">Storage Tiers</h3>

        <div className="space-y-3">
          {[
            { name: "Free", quota: "100 MB", price: "$0/mo", current: false },
            { name: "Basic", quota: "5 GB", price: "$5/mo", current: true },
            { name: "Pro", quota: "100 GB", price: "$15/mo", current: false },
            { name: "Enterprise", quota: "Unlimited", price: "Custom", current: false },
          ].map((tier) => (
            <div
              key={tier.name}
              className={`
                p-4 rounded-lg border transition-colors
                ${
                  tier.current
                    ? "border-primary bg-primary/10"
                    : "border-white/10 hover:bg-white/5"
                }
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{tier.name}</span>
                    {tier.current && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-primary/20 text-primary">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {tier.quota} storage • {tier.price}
                  </div>
                </div>
                {!tier.current && (
                  <button
                    onClick={() => {
                      console.log("[UsageTab] Upgrade to:", tier.name);
                      toast.info(`Upgrade to ${tier.name} (wired to console)`);
                    }}
                    className="px-4 py-2 text-sm rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                  >
                    {tier.name === "Free" ? "Downgrade" : "Upgrade"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
