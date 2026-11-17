"use client";

/**
 * Conversation desk — the CRM's inbox.
 *
 * Left: conversations, newest first, flagged when the customer is waiting.
 * Right: the thread, a strip naming what it concerns (opportunity, subject,
 * follow-up — with WHY a paused follow-up paused), and the reply draft.
 * The full context — editable subject fields like gate instructions, the
 * stage, recent activity — is the right sidebar's CRM tab (CrmContextPanel),
 * per the shell rule that supporting views live in the sidebar.
 */

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, FlaskConical, PauseCircle, Save, X } from "lucide-react";
import type { CrmConversation, CrmModel } from "@/lib/domain/crm/model";
import { cn } from "@/lib/core/utils";
import { revealRightSidebarTab } from "@/lib/features/content/reveal-right-sidebar";
import type { WorkspacePaneId } from "@/state/content-store";
import { saveCrmDraft, simulateIncomingText } from "../lib/actions";
import type { CrmEventResult } from "../lib/api";
import { openCrmView } from "../lib/open";
import { useCrmModel, useCrmStore } from "../state/crm-store";
import { CenterNote, FollowUpBadge, StageSelect, formatMoney, formatWhen } from "./crm-ui";

export function CrmInbox({
  folderId,
  contentId,
  paneId,
}: {
  folderId: string;
  contentId: string;
  paneId: WorkspacePaneId;
}) {
  const { model, status, error } = useCrmModel(folderId);
  const selectedId = useCrmStore((s) => s.selectedContact[folderId] ?? null);
  const selectContact = useCrmStore((s) => s.selectContact);

  const conversation = useMemo(
    () => model?.conversations.find((c) => c.contact.id === selectedId) ?? null,
    [model, selectedId]
  );

  // Land on the first conversation that is waiting on us.
  useEffect(() => {
    if (!model || conversation || model.conversations.length === 0) return;
    const first = model.conversations.find((c) => c.awaitingReply) ?? model.conversations[0];
    selectContact(folderId, first.contact.id);
  }, [model, conversation, folderId, selectContact]);

  if (!model) {
    return <CenterNote>{status === "error" ? error : "Loading conversations…"}</CenterNote>;
  }

  const pick = (contactId: string) => {
    selectContact(folderId, contactId);
    revealRightSidebarTab(contentId, "extension");
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-crm-view="inbox">
      <header className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-2.5 dark:border-white/10">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">Inbox</h1>
          <p className="truncate text-xs text-muted-foreground">{model.snapshot.businessName}</p>
        </div>
        <SimulatorToggle model={model} />
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Conversations"
          className="w-64 shrink-0 overflow-auto border-r border-black/10 dark:border-white/10"
        >
          {model.conversations.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No conversations yet.</p>
          ) : (
            <ul>
              {model.conversations.map((c) => (
                <li key={c.contact.id}>
                  <button
                    type="button"
                    data-crm-conversation={c.contact.name}
                    onClick={() => pick(c.contact.id)}
                    aria-current={c.contact.id === selectedId ? "true" : undefined}
                    className={cn(
                      "w-full border-b border-black/5 px-3 py-2.5 text-left hover:bg-black/5 dark:border-white/5 dark:hover:bg-white/10",
                      c.contact.id === selectedId && "bg-black/5 dark:bg-white/10"
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate text-sm", c.awaitingReply && "font-semibold")}>
                        {c.contact.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{formatWhen(c.lastAt, false)}</span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {c.awaitingReply ? "● " : ""}
                      {c.messages.at(-1)?.body ?? (c.draft ? `Draft: ${c.draft.body}` : "")}
                    </div>
                    {c.subject ? (
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{c.subject.name}</div>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <section className="flex min-w-0 flex-1 flex-col" aria-label="Conversation">
          {conversation ? (
            <Thread key={conversation.contact.id} model={model} conversation={conversation} paneId={paneId} />
          ) : (
            <CenterNote>Select a conversation.</CenterNote>
          )}
        </section>
      </div>
    </div>
  );
}

function Thread({
  model,
  conversation,
  paneId,
}: {
  model: CrmModel;
  conversation: CrmConversation;
  paneId: WorkspacePaneId;
}) {
  const { snapshot } = model;
  const terms = snapshot.config.terms;
  const { contact, opportunity, subject } = conversation;
  const folderId = snapshot.folderId;
  const canWrite = snapshot.tables.messages.access !== "read";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-black/10 px-4 py-3 dark:border-white/10">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="truncate text-base font-semibold" data-crm-thread-contact>
            {contact.name}
          </h2>
          <span className="shrink-0 text-xs text-muted-foreground">{contact.phone}</span>
        </div>

        {opportunity ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs" data-crm-concerns={opportunity.id}>
            <span className="text-muted-foreground">Concerns</span>
            <span className="font-medium" data-crm-concerns-title>
              {opportunity.title}
            </span>
            {opportunity.amount !== null ? <span>{formatMoney(opportunity.amount)}</span> : null}
            <StageSelect model={model} opportunity={opportunity} />
            <FollowUpBadge opportunity={opportunity} />
            {subject ? (
              <button
                type="button"
                data-crm-open-subject={subject.id}
                className="inline-flex items-center gap-1 rounded border border-black/10 px-2 py-0.5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                title={`Open this ${terms.subject.singular.toLowerCase()} beside the conversation`}
                onClick={() =>
                  openCrmView({ kind: "record", folderId, rowId: subject.id }, subject.name, {
                    besidePaneId: paneId,
                  })
                }
              >
                {subject.name}
                <ArrowUpRight className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{conversation.opportunityReason}</p>
        )}

        {opportunity?.followUp === "paused" && opportunity.followUpNote ? (
          <div
            className="flex items-start gap-2 rounded-md bg-amber-500/10 px-2.5 py-2 text-xs text-amber-900 dark:text-amber-200"
            data-crm-pause-reason
          >
            <PauseCircle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              <strong className="font-semibold">Follow-up paused.</strong> {opportunity.followUpNote}
            </span>
          </div>
        ) : null}
      </div>

      <ol className="min-h-0 flex-1 space-y-2 overflow-auto px-4 py-3" aria-label="Messages">
        {conversation.messages.map((m) => (
          <li
            key={m.id}
            className={cn("flex", m.direction === "outbound" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                m.direction === "outbound"
                  ? "bg-primary text-primary-foreground"
                  : "bg-black/5 dark:bg-white/10"
              )}
            >
              <p className="whitespace-pre-line">{m.body}</p>
              <p
                className={cn(
                  "mt-0.5 text-[10px]",
                  m.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"
                )}
              >
                {formatWhen(m.sentAt)}
                {m.opportunityId && m.opportunityId !== opportunity?.id
                  ? ` · ${model.opportunityById.get(m.opportunityId)?.title ?? ""}`
                  : ""}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <DraftComposer
        folderId={folderId}
        contactId={contact.id}
        opportunityId={opportunity?.id ?? null}
        initial={conversation.draft?.body ?? ""}
        hasDraft={conversation.draft !== null}
        disabled={!canWrite}
      />
    </div>
  );
}

function DraftComposer({
  folderId,
  contactId,
  opportunityId,
  initial,
  hasDraft,
  disabled,
}: {
  folderId: string;
  contactId: string;
  opportunityId: string | null;
  initial: string;
  hasDraft: boolean;
  disabled: boolean;
}) {
  const [body, setBody] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = body.trim() !== initial.trim();

  const save = async (next: string) => {
    setSaving(true);
    const ok = await saveCrmDraft(folderId, { contactId, opportunityId, body: next });
    setSaving(false);
    if (ok && !next.trim()) setBody("");
  };

  return (
    <div className="border-t border-black/10 px-4 py-3 dark:border-white/10">
      <label htmlFor={`crm-draft-${contactId}`} className="mb-1 block text-xs font-medium">
        Reply draft
      </label>
      <textarea
        id={`crm-draft-${contactId}`}
        data-crm-draft
        value={body}
        disabled={disabled}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Write a reply…"
        className="w-full resize-y rounded-md border border-black/10 bg-transparent px-2.5 py-2 text-sm dark:border-white/10"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {hasDraft && !dirty ? "Draft saved with this conversation. " : ""}
          Not sent — live texting is a later milestone.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {hasDraft ? (
            <button
              type="button"
              disabled={saving || disabled}
              onClick={() => void save("")}
              className="inline-flex h-8 items-center gap-1 rounded border border-black/10 px-2.5 text-xs disabled:opacity-50 dark:border-white/10"
            >
              <X className="h-3.5 w-3.5" />
              Discard
            </button>
          ) : null}
          <button
            type="button"
            data-crm-save-draft
            disabled={saving || disabled || !dirty || !body.trim()}
            onClick={() => void save(body)}
            className="inline-flex h-8 items-center gap-1 rounded bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save draft"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The local simulator — stands in for n8n relaying an SMS provider. Posts
 * to the same events route the real executor will. "Replay" re-sends a text
 * already received, with its original id, to show replays change nothing.
 */
function SimulatorToggle({ model }: { model: CrmModel }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        data-crm-simulator-toggle
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex h-8 items-center gap-1.5 rounded border border-dashed border-black/20 px-2.5 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        title={model.snapshot.automation.label}
      >
        <FlaskConical className="h-3.5 w-3.5" />
        Simulate text
      </button>
      {open ? <SimulatorPanel model={model} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function SimulatorPanel({ model, onClose }: { model: CrmModel; onClose: () => void }) {
  const received = model.messages
    .filter((m) => m.direction === "inbound" && m.externalId?.startsWith("sms:"))
    .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""));
  const [from, setFrom] = useState(model.contacts.find((c) => c.phone)?.phone ?? "");
  const [body, setBody] = useState("");
  const [replayId, setReplayId] = useState(received[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CrmEventResult | null>(null);
  const folderId = model.snapshot.folderId;

  const send = async (event: { eventId: string; from: string; body: string; receivedAt?: string }) => {
    setBusy(true);
    setResult(await simulateIncomingText(folderId, event));
    setBusy(false);
  };

  const replay = () => {
    const m = received.find((x) => x.id === replayId);
    const contact = m?.contactId ? model.contactById.get(m.contactId) : null;
    if (!m || !m.externalId || !contact?.phone) return;
    void send({
      eventId: m.externalId.slice("sms:".length),
      from: contact.phone,
      body: m.body,
      receivedAt: m.sentAt ?? undefined,
    });
  };

  return (
    <div
      role="dialog"
      aria-label="Message simulator"
      data-crm-simulator
      className="absolute right-0 top-9 z-30 w-80 space-y-3 rounded-lg border border-black/10 bg-background p-3 text-xs shadow-lg dark:border-white/10"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground">
          {model.snapshot.automation.simulated
            ? "Local simulator — stands in for n8n relaying a texting provider. Nothing is sent or received for real."
            : `Executor: ${model.snapshot.automation.label}.`}
        </p>
        <button type="button" aria-label="Close simulator" onClick={onClose} className="rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="mb-1 font-semibold">New incoming text</legend>
        <select
          aria-label="From"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-7 w-full rounded border border-black/10 bg-transparent px-1.5 dark:border-white/10"
        >
          {model.contacts
            .filter((c) => c.phone)
            .map((c) => (
              <option key={c.id} value={c.phone!}>
                {c.name} · {c.phone}
              </option>
            ))}
        </select>
        <textarea
          aria-label="Message"
          data-crm-simulator-body
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="What they text…"
          className="w-full rounded border border-black/10 bg-transparent px-2 py-1 dark:border-white/10"
        />
        <button
          type="button"
          disabled={busy || !from || !body.trim()}
          onClick={() =>
            void send({ eventId: `sim-${Date.now().toString(36)}`, from, body }).then(() => setBody(""))
          }
          className="h-7 rounded bg-primary px-2.5 font-medium text-primary-foreground disabled:opacity-50"
        >
          Deliver
        </button>
      </fieldset>

      {received.length > 0 ? (
        <fieldset className="space-y-1.5">
          <legend className="mb-1 font-semibold">Replay a received text</legend>
          <select
            aria-label="Text to replay"
            data-crm-simulator-replay-select
            value={replayId}
            onChange={(e) => setReplayId(e.target.value)}
            className="h-7 w-full rounded border border-black/10 bg-transparent px-1.5 dark:border-white/10"
          >
            {received.map((m) => (
              <option key={m.id} value={m.id}>
                {(m.contactId && model.contactById.get(m.contactId)?.name) || "Unknown"}: {m.body.slice(0, 40)}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-crm-simulator-replay
            disabled={busy || !replayId}
            onClick={replay}
            className="h-7 rounded border border-black/10 px-2.5 disabled:opacity-50 dark:border-white/10"
          >
            Replay with the same event id
          </button>
        </fieldset>
      ) : null}

      {result ? (
        <p className="rounded bg-black/5 p-2 dark:bg-white/10" data-crm-simulator-result={result.duplicate ? "duplicate" : "applied"}>
          {result.duplicate
            ? "Already applied — the replay changed nothing."
            : result.paused
              ? `Delivered. Follow-up paused. ${result.automationDetail ?? ""}`
              : `Delivered. ${result.matchReason}`}
        </p>
      ) : null}
    </div>
  );
}
