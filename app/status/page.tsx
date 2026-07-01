/**
 * /status — placeholder System Status board.
 *
 * Static "all operational" placeholder. A real status page would pull live
 * health from monitoring; this gives the footer link an honest, intentional
 * destination until that exists.
 */

import type { Metadata } from "next";
import { PlatformShell, MarketingPageHeader } from "@/components/home/platform-chrome";

export const metadata: Metadata = {
  title: "System Status",
  description: "Current operational status of NoteTrellis services.",
};

const SERVICES = [
  { name: "App & Editor", note: "Workspace, editing, and sync" },
  { name: "Publishing", note: "Public pages and custom domains" },
  { name: "Real-time Collaboration", note: "Live co-editing and presence" },
  { name: "AI Services", note: "Chat, generation, and transcription" },
  { name: "Storage & Uploads", note: "File storage and downloads" },
];

export default function Page() {
  return (
    <PlatformShell>
      <MarketingPageHeader
        eyebrow="Support"
        title="System Status"
        lede="Live operational status for NoteTrellis services. This is a placeholder board; live health monitoring is on the way."
      />
      <section className="max-w-3xl mx-auto px-6 pb-24">
        {/* Overall banner */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-5 py-4 flex items-center gap-3 mb-8">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 flex-shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium text-emerald-300">
            All systems operational
          </span>
        </div>

        {/* Per-service rows */}
        <ul className="rounded-xl border border-white/8 bg-white/[0.03] divide-y divide-white/5">
          {SERVICES.map((svc) => (
            <li key={svc.name} className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-sm font-medium">{svc.name}</p>
                <p className="text-xs text-white/40">{svc.note}</p>
              </div>
              <span className="flex items-center gap-2 flex-shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />
                <span className="text-xs text-white/50">Operational</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="text-xs text-white/30 mt-6">
          Status shown is illustrative. Subscribe to incident updates once live
          monitoring is available.
        </p>
      </section>
    </PlatformShell>
  );
}
