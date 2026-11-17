"use client";

/**
 * Pipeline — opportunities by stage. Lanes come from the opportunities
 * table's own Stage (status) options, so a business's stages are its own.
 * Each card shows its next action; the stage picker writes through the same
 * action the conversation desk uses, into the same shared snapshot.
 */

import { ArrowUpRight, MessageSquare } from "lucide-react";
import { pipelineLanes } from "@/lib/domain/crm/model";
import type { WorkspacePaneId } from "@/state/content-store";
import { openCrmInbox, openCrmView } from "../lib/open";
import { useCrmModel } from "../state/crm-store";
import { CenterNote, FollowUpBadge, StageSelect, formatMoney, formatWhen } from "./crm-ui";

export function CrmPipeline({ folderId, paneId }: { folderId: string; paneId: WorkspacePaneId }) {
  const { model, status, error } = useCrmModel(folderId);
  if (!model) return <CenterNote>{status === "error" ? error : "Loading pipeline…"}</CenterNote>;

  const { terms } = model.snapshot.config;
  const lanes = pipelineLanes(model);
  const unstaged = model.opportunities.filter((o) => !o.stage);

  return (
    <div className="flex h-full min-h-0 flex-col" data-crm-view="pipeline">
      <header className="flex items-baseline justify-between gap-3 border-b border-black/10 px-4 py-2.5 dark:border-white/10">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{terms.opportunity.plural} pipeline</h1>
          <p className="truncate text-xs text-muted-foreground">{model.snapshot.businessName}</p>
        </div>
        <span className="text-xs text-muted-foreground">
          {model.opportunities.length} {model.opportunities.length === 1 ? terms.opportunity.singular.toLowerCase() : terms.opportunity.plural.toLowerCase()}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
        {[...lanes, ...(unstaged.length ? [{ stage: { id: "", label: "No stage" }, items: unstaged }] : [])].map(
          ({ stage, items }) => (
            <section
              key={stage.id || "none"}
              aria-label={stage.label}
              data-crm-lane={stage.label}
              className="flex w-64 shrink-0 flex-col rounded-lg bg-black/[0.03] dark:bg-white/[0.04]"
            >
              <h2 className="flex items-center justify-between px-3 py-2 text-xs font-semibold">
                {stage.label}
                <span className="font-normal text-muted-foreground">{items.length}</span>
              </h2>
              <ul className="min-h-0 flex-1 space-y-2 overflow-auto px-2 pb-2">
                {items.map((o) => {
                  const contact = o.contactId ? model.contactById.get(o.contactId) : null;
                  const subject = o.subjectId ? model.subjectById.get(o.subjectId) : null;
                  return (
                    <li
                      key={o.id}
                      data-crm-card={o.title}
                      className="space-y-2 rounded-md border border-black/10 bg-background p-2.5 dark:border-white/10"
                    >
                      <div>
                        <div className="text-sm font-medium">{o.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {[contact?.name, subject && subject.id !== contact?.id ? subject.name : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                      <div className="rounded bg-black/[0.04] px-2 py-1 text-xs dark:bg-white/[0.06]" data-crm-next-action>
                        <span className="text-muted-foreground">Next: </span>
                        {o.nextAction ?? <span className="text-muted-foreground">none set</span>}
                        {o.nextActionDate ? ` · ${formatWhen(o.nextActionDate, false)}` : ""}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StageSelect model={model} opportunity={o} />
                        {o.amount !== null ? <span className="text-xs">{formatMoney(o.amount)}</span> : null}
                      </div>
                      {o.followUp ? <FollowUpBadge opportunity={o} /> : null}
                      <div className="flex items-center gap-3 text-xs">
                        {contact ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                            onClick={() => openCrmInbox(folderId, model.snapshot.businessName, contact.id)}
                          >
                            <MessageSquare className="h-3 w-3" />
                            Conversation
                          </button>
                        ) : null}
                        {subject ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                            onClick={() =>
                              openCrmView({ kind: "record", folderId, rowId: subject.id }, subject.name, {
                                besidePaneId: paneId,
                              })
                            }
                          >
                            {terms.subject.singular}
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
                {items.length === 0 ? (
                  <li className="px-1 py-2 text-xs text-muted-foreground">Nothing here.</li>
                ) : null}
              </ul>
            </section>
          )
        )}
      </div>
    </div>
  );
}
