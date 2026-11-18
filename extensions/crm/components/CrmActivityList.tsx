"use client";

import { useState } from "react";
import type { CrmActivity } from "@/lib/domain/crm/model";
import { formatWhen } from "./crm-ui";

/** A timeline of activity entries; "why" (the detail) folds open per entry. */
export function CrmActivityList({ entries, limit }: { entries: CrmActivity[]; limit?: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const shown = limit ? entries.slice(0, limit) : entries;
  if (shown.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing has happened here yet.</p>;
  }
  return (
    <ol className="space-y-2" data-crm-activity>
      {shown.map((entry) => (
        <li key={entry.id} className="border-l-2 border-black/10 pl-3 dark:border-white/15" data-crm-activity-key={entry.eventKey ?? ""}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm">{entry.summary}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{formatWhen(entry.at)}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {entry.kind ? <span>{entry.kind}</span> : null}
            {entry.detail ? (
              <button
                type="button"
                className="text-primary hover:underline"
                aria-expanded={open === entry.id}
                onClick={() => setOpen(open === entry.id ? null : entry.id)}
              >
                {open === entry.id ? "Hide why" : "Why"}
              </button>
            ) : null}
          </div>
          {open === entry.id && entry.detail ? (
            <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{entry.detail}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
