"use client";

/**
 * Record workspace — one service subject (a property, a vehicle, or the
 * client themselves): its own fields, its contact, its opportunities, its
 * field notes and its activity. Every heading uses the business's terms.
 *
 * History is per subject (lib/domain/crm/model.ts `subjectRecord`): Tess's
 * rental shows the rental's quote and entries, never her home's.
 */

import { MessageSquare } from "lucide-react";
import { subjectRecord } from "@/lib/domain/crm/model";
import type { WorkspacePaneId } from "@/state/content-store";
import { openCrmInbox } from "../lib/open";
import { useCrmModel } from "../state/crm-store";
import { CrmFields, recordFieldColumns } from "./CrmFields";
import { Card, CenterNote, FollowUpBadge, Section, StageSelect, formatMoney, formatWhen } from "./crm-ui";
import { CrmActivityList } from "./CrmActivityList";

export function CrmRecord({
  folderId,
  rowId,
}: {
  folderId: string;
  rowId: string;
  paneId: WorkspacePaneId;
}) {
  const { model, status, error } = useCrmModel(folderId);
  if (!model) {
    return <CenterNote>{status === "error" ? error : "Loading…"}</CenterNote>;
  }
  const record = subjectRecord(model, rowId);
  const { config, tables } = model.snapshot;
  const terms = config.terms;
  if (!record) {
    return <CenterNote>This {terms.subject.singular.toLowerCase()} is not in {model.snapshot.businessName} any more.</CenterNote>;
  }
  const { subject, contact } = record;
  const notesColumn = tables.subjects.columns.find((c) => c.id === config.columns.subjects.notes);
  const fieldColumns = recordFieldColumns(tables.subjects, [
    config.columns.subjects.notes,
    // When the subject IS the contact, the contact's machinery columns stay out.
    ...(tables.subjects.id === tables.contacts.id ? [config.columns.contacts.name] : []),
  ]);

  return (
    <div className="h-full overflow-auto" data-crm-view="record">
      <div className="@container mx-auto max-w-5xl space-y-6 px-4 py-5 sm:px-6">
        <header className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {terms.subject.singular} · {model.snapshot.businessName}
          </div>
          <h1 className="text-xl font-semibold" data-crm-record-title>
            {subject.name}
          </h1>
          {contact && tables.subjects.id !== tables.contacts.id ? (
            <div className="text-sm text-muted-foreground">
              {terms.contact.singular}: {contact.name}
              {contact.phone ? ` · ${contact.phone}` : ""}
            </div>
          ) : null}
        </header>

        <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <Section title={`${terms.subject.singular} details`}>
              <Card>
                <CrmFields folderId={folderId} table={tables.subjects} row={subject.row} columns={fieldColumns} />
              </Card>
            </Section>

            {notesColumn ? (
              <Section title={notesColumn.name}>
                <Card>
                  <CrmFields folderId={folderId} table={tables.subjects} row={subject.row} columns={[notesColumn]} />
                </Card>
              </Section>
            ) : null}

            {contact ? (
              <Section title={terms.contact.singular}>
                <Card className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{contact.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[contact.phone, contact.email].filter(Boolean).join(" · ") || "No phone or email"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
                    onClick={() => openCrmInbox(folderId, model.snapshot.businessName, contact.id)}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Conversation
                  </button>
                </Card>
              </Section>
            ) : null}
          </div>

          <div className="space-y-6">
            <Section title={terms.opportunity.plural}>
              {record.opportunities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No {terms.opportunity.plural.toLowerCase()} for this {terms.subject.singular.toLowerCase()} yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {record.opportunities.map((o) => (
                    <Card key={o.id} className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{o.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {[formatMoney(o.amount), o.nextAction && `Next: ${o.nextAction}`, o.nextActionDate && formatWhen(o.nextActionDate, false)]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </div>
                        <StageSelect model={model} opportunity={o} />
                      </div>
                      <div className="space-y-1">
                        <FollowUpBadge opportunity={o} />
                        {o.followUpNote ? <p className="text-xs text-muted-foreground">{o.followUpNote}</p> : null}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Activity">
              <CrmActivityList entries={record.activity} />
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
