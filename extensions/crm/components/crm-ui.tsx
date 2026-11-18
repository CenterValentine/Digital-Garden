"use client";

/**
 * Small shared CRM pieces: follow-up status, stage picker, formatting.
 */

import type { ReactNode } from "react";
import type { CrmFollowUpState, CrmModel, CrmOpportunity } from "@/lib/domain/crm/model";
import { cn } from "@/lib/core/utils";
import { changeCrmStage } from "../lib/actions";

export function formatMoney(amount: number | null): string | null {
  if (amount === null) return null;
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  });
}

/** "Nov 17, 4:12 PM" — or a date alone for date-only cells. */
export function formatWhen(value: string | null, withTime = true): string {
  if (!value) return "";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = dateOnly ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
    ...(withTime && !dateOnly ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

const FOLLOW_UP_TONE: Record<CrmFollowUpState, string> = {
  scheduled: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  paused: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  done: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

export function FollowUpBadge({ opportunity }: { opportunity: CrmOpportunity }) {
  if (!opportunity.followUp) {
    return <span className="text-xs text-muted-foreground">No follow-up</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        FOLLOW_UP_TONE[opportunity.followUp]
      )}
      data-crm-follow-up={opportunity.followUp}
    >
      Follow-up {opportunity.followUpLabel?.toLowerCase() ?? opportunity.followUp}
      {opportunity.followUp === "scheduled" && opportunity.followUpDue
        ? ` · ${formatWhen(opportunity.followUpDue, false)}`
        : ""}
    </span>
  );
}

export function StageSelect({
  model,
  opportunity,
  disabled,
}: {
  model: CrmModel;
  opportunity: CrmOpportunity;
  disabled?: boolean;
}) {
  const { snapshot } = model;
  const table = snapshot.tables.opportunities;
  const column = table.columns.find((c) => c.id === snapshot.config.columns.opportunities.stage);
  const canEdit = table.access !== "read" && table.access !== "none";
  return (
    <select
      aria-label={`Stage for ${opportunity.title}`}
      data-crm-stage-select={opportunity.id}
      className="h-7 rounded border border-black/10 bg-transparent px-1.5 text-xs dark:border-white/10"
      value={opportunity.stage?.id ?? ""}
      disabled={disabled || !canEdit || !column}
      onChange={(e) => {
        if (!column || !e.target.value) return;
        void changeCrmStage(snapshot.folderId, {
          opportunityId: opportunity.id,
          stageId: e.target.value,
          tableId: table.id,
          columnKey: column.key,
        });
      }}
    >
      {!opportunity.stage && <option value="">No stage</option>}
      {model.stages.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-black/10 p-3 dark:border-white/10", className)}>{children}</div>
  );
}

export function CenterNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md text-center text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
