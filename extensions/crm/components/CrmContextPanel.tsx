"use client";

/**
 * The right sidebar's CRM tab, claimed by every CRM view through
 * lib/extensions/content-sidebar.ts:
 *  - inbox    — the open conversation's opportunity (stage, follow-up and
 *               why), its subject with editable fields (gate instructions
 *               save straight to the property), and recent history;
 *  - pipeline — every follow-up in flight, paused ones first, with reasons;
 *  - record   — the subject's own recent texts.
 */

import { ArrowUpRight } from "lucide-react";
import { parseCrmTabId } from "@/lib/domain/crm/ids";
import { subjectRecord, type CrmModel } from "@/lib/domain/crm/model";
import { useContentStore, type WorkspacePaneId } from "@/state/content-store";
import { openCrmInbox, openCrmView } from "../lib/open";
import { useCrmModel, useCrmStore } from "../state/crm-store";
import { CrmActivityList } from "./CrmActivityList";
import { CrmFields } from "./CrmFields";
import { Card, FollowUpBadge, Section, StageSelect, formatMoney, formatWhen } from "./crm-ui";

/** The pane that shows this tab — "beside" is beside the conversation, not the sidebar. */
function paneOfTab(contentId: string): WorkspacePaneId {
  const { panes, activePaneId } = useContentStore.getState();
  const tabId = `tab:${contentId}`;
  for (const [paneId, pane] of Object.entries(panes)) {
    if (pane?.tabIds.includes(tabId)) return paneId as WorkspacePaneId;
  }
  return activePaneId;
}

export function CrmContextPanel({ contentId }: { contentId: string }) {
  const view = parseCrmTabId(contentId);
  const folderId = view?.folderId ?? null;
  const { model } = useCrmModel(folderId);
  const selectedId = useCrmStore((s) => (folderId ? (s.selectedContact[folderId] ?? null) : null));

  if (!view) return null;
  if (!model) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (view.kind === "pipeline") return <PipelineContext model={model} />;
  if (view.kind === "record") return <RecordContext model={model} rowId={view.rowId} />;

  const conversation = model.conversations.find((c) => c.contact.id === selectedId);
  if (!conversation) {
    return <p className="p-4 text-sm text-muted-foreground">Select a conversation.</p>;
  }

  const { config, tables, folderId: fid } = model.snapshot;
  const terms = config.terms;
  const { opportunity, subject } = conversation;
  const subjectColumns = config.subjectFields
    .map((id) => tables.subjects.columns.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const history = subject
    ? (subjectRecord(model, subject.id)?.activity ?? [])
    : model.activity.filter((a) => a.contactId === conversation.contact.id);

  return (
    <div className="space-y-5 p-3" data-crm-context>
      <Section title={terms.opportunity.singular}>
        {opportunity ? (
          <Card className="space-y-2">
            <div className="text-sm font-medium">{opportunity.title}</div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StageSelect model={model} opportunity={opportunity} />
              {opportunity.amount !== null ? <span>{formatMoney(opportunity.amount)}</span> : null}
            </div>
            {opportunity.nextAction ? (
              <div className="text-xs">
                <span className="text-muted-foreground">Next: </span>
                {opportunity.nextAction}
                {opportunity.nextActionDate ? ` · ${formatWhen(opportunity.nextActionDate, false)}` : ""}
              </div>
            ) : null}
            <div className="space-y-1 border-t border-black/5 pt-2 dark:border-white/5">
              <FollowUpBadge opportunity={opportunity} />
              {opportunity.followUpNote ? (
                <p className="text-xs text-muted-foreground" data-crm-follow-up-note>
                  {opportunity.followUpNote}
                </p>
              ) : null}
              <p className="text-[11px] text-muted-foreground">
                Executor: {model.snapshot.automation.label}
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">Why this {terms.opportunity.singular.toLowerCase()}: {conversation.opportunityReason}</p>
          </Card>
        ) : (
          <p className="text-xs text-muted-foreground">{conversation.opportunityReason}</p>
        )}
      </Section>

      {subject ? (
        <Section
          title={terms.subject.singular}
          action={
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              onClick={() =>
                openCrmView({ kind: "record", folderId: fid, rowId: subject.id }, subject.name, {
                  besidePaneId: paneOfTab(contentId),
                })
              }
            >
              Open beside
              <ArrowUpRight className="h-3 w-3" />
            </button>
          }
        >
          <Card className="space-y-3">
            <div className="text-sm font-medium">{subject.name}</div>
            <CrmFields folderId={fid} table={tables.subjects} row={subject.row} columns={subjectColumns} />
          </Card>
        </Section>
      ) : null}

      <Section title="Recent activity">
        <CrmActivityList entries={history} limit={6} />
      </Section>
    </div>
  );
}

/** Pipeline: every follow-up in flight, paused ones first, each with its reason. */
function PipelineContext({ model }: { model: CrmModel }) {
  const { terms } = model.snapshot.config;
  const rank = { paused: 0, scheduled: 1, done: 2 } as const;
  const inFlight = model.opportunities
    .filter((o) => o.followUp === "paused" || o.followUp === "scheduled")
    .sort((a, b) => rank[a.followUp!] - rank[b.followUp!]);
  return (
    <div className="space-y-5 p-3" data-crm-context="pipeline">
      <Section title="Follow-ups in flight">
        {inFlight.length === 0 ? (
          <p className="text-xs text-muted-foreground">No scheduled or paused follow-ups.</p>
        ) : (
          <div className="space-y-2">
            {inFlight.map((o) => (
              <Card key={o.id} className="space-y-1.5">
                <div className="text-sm font-medium">{o.title}</div>
                <div className="text-xs text-muted-foreground">
                  {o.contactId ? model.contactById.get(o.contactId)?.name : ""}
                </div>
                <FollowUpBadge opportunity={o} />
                {o.followUpNote ? <p className="text-xs text-muted-foreground">{o.followUpNote}</p> : null}
              </Card>
            ))}
          </div>
        )}
      </Section>
      <p className="text-[11px] text-muted-foreground">
        {terms.opportunity.plural} follow-ups are carried out by: {model.snapshot.automation.label}.
      </p>
    </div>
  );
}

/** A record: its own recent texts (only those about this subject's items). */
function RecordContext({ model, rowId }: { model: CrmModel; rowId: string }) {
  const record = subjectRecord(model, rowId);
  if (!record) return null;
  const oppIds = new Set(record.opportunities.map((o) => o.id));
  const messages = model.messages
    .filter((m) => m.direction !== "draft" && m.opportunityId !== null && oppIds.has(m.opportunityId))
    .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""))
    .slice(0, 6);
  const contact = record.contact;
  return (
    <div className="space-y-5 p-3" data-crm-context="record">
      <Section
        title="Messages"
        action={
          contact ? (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => openCrmInbox(model.snapshot.folderId, model.snapshot.businessName, contact.id)}
            >
              Open conversation
            </button>
          ) : null
        }
      >
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No texts about this {model.snapshot.config.terms.subject.singular.toLowerCase()} yet.
          </p>
        ) : (
          <ol className="space-y-2">
            {messages.map((m) => (
              <li key={m.id} className="text-xs">
                <div className="text-muted-foreground">
                  {m.direction === "inbound" ? (contact?.name ?? "Them") : "You"} · {formatWhen(m.sentAt)}
                </div>
                <p>{m.body}</p>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}
