"use client";

/**
 * Left sidebar for the CRM nav item: pick a business, then its Inbox,
 * Pipeline, and its subjects under the business's own word for them
 * (Properties, Vehicles, Clients). Everything opens as a workspace tab.
 */

import { useEffect, useState } from "react";
import { Inbox, KanbanSquare, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { CRM_PRESETS } from "@/lib/domain/crm/presets";
import { cn } from "@/lib/core/utils";
import { crmApi } from "../lib/api";
import { crmViewTitle, openCrmInbox, openCrmView } from "../lib/open";
import { useCrmModel, useCrmStore } from "../state/crm-store";

export function CrmNavPanel() {
  const businesses = useCrmStore((s) => s.businesses);
  const activeFolderId = useCrmStore((s) => s.activeFolderId);
  const setActiveFolder = useCrmStore((s) => s.setActiveFolder);
  const loadBusinesses = useCrmStore((s) => s.loadBusinesses);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadBusinesses().catch((e: unknown) =>
      setLoadError(e instanceof Error ? e.message : "Could not load businesses")
    );
  }, [loadBusinesses]);

  if (loadError) return <p className="p-3 text-sm text-muted-foreground">{loadError}</p>;
  if (!businesses) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-crm-nav>
      {businesses.length > 0 ? (
        <div className="border-b border-black/10 p-2 dark:border-white/10">
          <label htmlFor="crm-business" className="sr-only">
            Business
          </label>
          <select
            id="crm-business"
            data-crm-business-select
            value={activeFolderId ?? ""}
            onChange={(e) => setActiveFolder(e.target.value)}
            className="h-8 w-full rounded border border-black/10 bg-transparent px-2 text-sm font-medium dark:border-white/10"
          >
            {businesses.map((b) => (
              <option key={b.folderId} value={b.folderId}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {activeFolderId && businesses.some((b) => b.folderId === activeFolderId) ? (
          <BusinessNav folderId={activeFolderId} />
        ) : null}
        <SetupBusiness
          compact={businesses.length > 0}
          onCreated={async (folderId, name) => {
            await loadBusinesses();
            setActiveFolder(folderId);
            openCrmInbox(folderId, name);
          }}
        />
      </div>
    </div>
  );
}

function NavButton({
  icon,
  label,
  badge,
  onClick,
  testId,
}: {
  icon?: React.ReactNode;
  label: string;
  badge?: number;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-crm-nav-item={testId ?? label}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge ? (
        <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{badge}</span>
      ) : null}
    </button>
  );
}

function BusinessNav({ folderId }: { folderId: string }) {
  const { model, status, error } = useCrmModel(folderId);
  if (!model) {
    return <p className="p-3 text-xs text-muted-foreground">{status === "error" ? error : "Loading…"}</p>;
  }
  const { businessName, config, tables } = model.snapshot;
  const waiting = model.conversations.filter((c) => c.awaitingReply).length;
  const subjects = [...model.subjects].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-3 p-2">
      <div className="space-y-0.5">
        <NavButton
          testId="inbox"
          icon={<Inbox className="h-4 w-4 text-muted-foreground" />}
          label="Inbox"
          badge={waiting}
          onClick={() => openCrmInbox(folderId, businessName)}
        />
        <NavButton
          testId="pipeline"
          icon={<KanbanSquare className="h-4 w-4 text-muted-foreground" />}
          label="Pipeline"
          onClick={() =>
            openCrmView({ kind: "pipeline", folderId }, crmViewTitle({ kind: "pipeline", folderId }, businessName))
          }
        />
      </div>

      <div>
        <h3 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" data-crm-subject-heading>
          {config.terms.subject.plural}
        </h3>
        {subjects.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">No {config.terms.subject.plural.toLowerCase()} yet.</p>
        ) : (
          <div className="space-y-0.5">
            {subjects.map((s) => (
              <NavButton
                key={s.id}
                testId={`subject:${s.name}`}
                label={s.name}
                onClick={() => openCrmView({ kind: "record", folderId, rowId: s.id }, s.name)}
              />
            ))}
          </div>
        )}
      </div>

      <p className="px-2 text-[11px] leading-relaxed text-muted-foreground">
        Records live in the “{businessName}” folder as ordinary databases ({tables.contacts.title},{" "}
        {tables.subjects.id === tables.contacts.id ? "" : `${tables.subjects.title}, `}
        {tables.opportunities.title}, {tables.messages.title}, {tables.activity.title}). Follow-ups:{" "}
        {model.snapshot.automation.label}.
      </p>
      {model.snapshot.truncated ? (
        <p className="px-2 text-[11px] text-amber-700 dark:text-amber-300">
          Showing the first 500 rows of a table; older records are in the database itself.
        </p>
      ) : null}
    </div>
  );
}

function SetupBusiness({
  compact,
  onCreated,
}: {
  compact: boolean;
  onCreated: (folderId: string, name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(!compact);
  const [name, setName] = useState("");
  const [presetId, setPresetId] = useState(CRM_PRESETS[0].id);
  const [busy, setBusy] = useState(false);
  const preset = CRM_PRESETS.find((p) => p.id === presetId)!;

  if (!open) {
    return (
      <div className="border-t border-black/10 p-2 dark:border-white/10">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 px-2 text-xs text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          Set up another business
        </button>
      </div>
    );
  }

  return (
    <form
      className={cn("space-y-2 p-3", compact && "border-t border-black/10 dark:border-white/10")}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        try {
          const { folderId } = await crmApi.createBusiness({ name: name.trim(), presetId });
          toast.success(`${name.trim()} is ready`);
          setName("");
          await onCreated(folderId, name.trim());
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not set up the business");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="text-sm font-semibold">Set up a business</h3>
      {!compact ? (
        <p className="text-xs text-muted-foreground">
          Creates a folder with linked databases for contacts, what you service, quotes, messages and activity.
        </p>
      ) : null}
      <input
        aria-label="Business name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Business name"
        className="h-8 w-full rounded border border-black/10 bg-transparent px-2 text-sm dark:border-white/10"
      />
      <select
        aria-label="What the business services"
        value={presetId}
        onChange={(e) => setPresetId(e.target.value)}
        className="h-8 w-full rounded border border-black/10 bg-transparent px-2 text-sm dark:border-white/10"
      >
        {CRM_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} — {p.terms.subject.plural}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-muted-foreground">{preset.description}</p>
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="h-8 rounded bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? "Setting up…" : "Create"}
      </button>
    </form>
  );
}
