"use client";

/**
 * PreviewPane — the live draft preview (S6).
 *
 * An iframe of the REAL page renderer in draft mode (`/<slug>?preview=draft`),
 * so what you see is exactly what publishing will show — not an approximation.
 * The parent bumps `refreshKey` after each successful draft save; the iframe
 * remounts and re-fetches, reflecting the latest edit. Owner-only draft
 * resolution is enforced server-side (S2), and the same-origin session cookie
 * carries into the iframe automatically.
 *
 * Only pages with a real public renderer preview live (results, blog). Other
 * kinds show a note rather than a misleading blank frame.
 */

const PREVIEWABLE: Record<string, string> = {
  results: "/results",
  blog: "/blog",
};

export function PreviewPane({
  slug,
  refreshKey,
  hasDraft,
}: {
  slug: string;
  refreshKey: number;
  hasDraft: boolean;
}) {
  const path = PREVIEWABLE[slug];

  return (
    <aside className="sticky top-[72px] flex h-[calc(100vh-96px)] flex-col overflow-hidden rounded-lg border border-white/10 bg-black/20">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="flex-1 truncate rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-white/50">
          <span className="text-emerald-400">●</span> davidvalentine.org
          {path ?? `/${slug}`}
        </span>
        {hasDraft && (
          <span className="rounded border border-amber-600/60 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-400">
            Draft
          </span>
        )}
      </div>

      {path ? (
        <iframe
          key={`${slug}-${refreshKey}`}
          title="Live draft preview"
          src={`${path}?preview=draft`}
          className="min-h-0 flex-1 bg-white"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-white/40">
          Live preview isn&apos;t available for this page type yet. Save and view
          it directly at{" "}
          <span className="font-mono text-white/60">/{slug || "(home)"}</span>.
        </div>
      )}
    </aside>
  );
}
