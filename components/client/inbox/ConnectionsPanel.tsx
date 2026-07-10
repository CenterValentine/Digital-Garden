"use client";

/**
 * Connections management — the "Connections" tab of the inbox.
 *
 * Invite form (exact email/username, enumeration-safe success copy),
 * followed by Connections / Invites sent / Invites received / Blocked
 * sections. All state is local: this panel is the only consumer of the
 * connection endpoints, so a store would be ceremony.
 */

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Ban,
  Check,
  MessageCircle,
  UserMinus,
  UserPlus,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { getSurfaceStyles } from "@/lib/design/system";
import type {
  BlockDTO,
  ConnectionDTO,
  ReceivedInviteDTO,
  SentInviteDTO,
} from "@/lib/domain/connections/types";
import { useDmStore } from "@/state/dm-store";

interface PanelData {
  connections: ConnectionDTO[];
  sent: SentInviteDTO[];
  received: ReceivedInviteDTO[];
  blocks: BlockDTO[];
}

const EMPTY: PanelData = { connections: [], sent: [], received: [], blocks: [] };

async function apiJson<T>(
  input: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const response = await fetch(input, { credentials: "include", ...init });
    const json = (await response.json()) as {
      success: boolean;
      data?: T;
      error?: string;
      retryAfterSeconds?: number;
    };
    if (!response.ok || !json.success) {
      throw new Error(
        response.status === 429
          ? "Too many requests — try again later"
          : (json.error ?? "Request failed"),
      );
    }
    return json.data ?? null;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Request failed");
    return null;
  }
}

async function fetchPanelData(): Promise<PanelData> {
  const [connectionsData, invitesData, blocksData] = await Promise.all([
    apiJson<{ connections: ConnectionDTO[] }>("/api/connections"),
    apiJson<{ sent: SentInviteDTO[]; received: ReceivedInviteDTO[] }>(
      "/api/connections/invites",
    ),
    apiJson<{ blocks: BlockDTO[] }>("/api/connections/blocks"),
  ]);
  return {
    connections: connectionsData?.connections ?? [],
    sent: invitesData?.sent ?? [],
    received: invitesData?.received ?? [],
    blocks: blocksData?.blocks ?? [],
  };
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const glass0 = getSurfaceStyles("glass-0");
  return (
    <div
      className="rounded-xl border border-white/10 p-4"
      style={{
        background: glass0.background,
        backdropFilter: glass0.backdropFilter,
      }}
    >
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="py-3 text-sm text-muted-foreground">{text}</p>;
}

export function ConnectionsPanel({
  onMessage,
}: {
  onMessage: (threadId: string) => void;
}) {
  const [data, setData] = useState<PanelData>(EMPTY);
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const startThreadWith = useDmStore((state) => state.startThreadWith);

  const refresh = useCallback(async () => {
    setData(await fetchPanelData());
  }, []);

  useEffect(() => {
    let active = true;
    void fetchPanelData().then((panelData) => {
      if (active) setData(panelData);
    });
    return () => {
      active = false;
    };
  }, []);

  const submitInvite = async () => {
    const trimmed = identifier.trim();
    if (trimmed.length < 3 || isSubmitting) return;
    setIsSubmitting(true);
    const result = await apiJson<{ status: string }>(
      "/api/connections/invites",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: trimmed,
          ...(message.trim() ? { message: message.trim() } : {}),
        }),
      },
    );
    setIsSubmitting(false);
    if (result) {
      // Deliberately identical whether or not the account exists.
      toast.success("If that account exists, they'll get your invite");
      setIdentifier("");
      setMessage("");
      void refresh();
    }
  };

  const respond = async (inviteId: string, action: "accept" | "decline") => {
    const result = await apiJson<{ status: string }>(
      `/api/connections/invites/${inviteId}/respond`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      },
    );
    if (result) {
      if (action === "accept") toast.success("Connection added");
      void refresh();
    }
  };

  const revoke = async (inviteId: string) => {
    const result = await apiJson<{ id: string }>(
      `/api/connections/invites/${inviteId}`,
      { method: "DELETE" },
    );
    if (result) void refresh();
  };

  const remove = async (connectionId: string) => {
    const result = await apiJson<{ id: string }>(
      `/api/connections/${connectionId}`,
      { method: "DELETE" },
    );
    if (result) {
      toast.success("Connection removed");
      void refresh();
    }
  };

  const block = async (userId: string) => {
    const result = await apiJson<BlockDTO>("/api/connections/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (result) {
      toast.success(`Blocked ${result.username}`);
      void refresh();
    }
  };

  const unblock = async (blockId: string) => {
    const result = await apiJson<{ id: string }>(
      `/api/connections/blocks/${blockId}`,
      { method: "DELETE" },
    );
    if (result) void refresh();
  };

  const messageUser = async (userId: string) => {
    const threadId = await startThreadWith(userId);
    if (threadId) onMessage(threadId);
    else toast.error("Couldn't start the conversation");
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Invite someone">
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submitInvite();
              }}
              placeholder="Exact email or username"
              className="h-9 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-white/25"
            />
            <button
              type="button"
              disabled={identifier.trim().length < 3 || isSubmitting}
              onClick={() => void submitInvite()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" />
              Invite
            </button>
          </div>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={280}
            placeholder="Optional message"
            className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-white/25"
          />
          <p className="text-xs text-muted-foreground">
            Invites require the exact email or username — there is no user
            search. The other person must accept before you&apos;re connected.
          </p>
        </div>
      </SectionCard>

      {data.received.length > 0 ? (
        <SectionCard title={`Invites received (${data.received.length})`}>
          <div className="divide-y divide-white/5">
            {data.received.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">
                      {invite.inviterUsername}
                    </span>{" "}
                    wants to connect
                  </p>
                  {invite.message ? (
                    <p className="truncate text-xs text-muted-foreground">
                      “{invite.message}”
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void respond(invite.id, "accept")}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    <Check className="h-3 w-3" />
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => void respond(invite.id, "decline")}
                    className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2.5 py-1 text-xs text-muted-foreground hover:bg-white/5"
                  >
                    <X className="h-3 w-3" />
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title={`Connections (${data.connections.length})`}>
        {data.connections.length === 0 ? (
          <EmptyRow text="No connections yet — send an invite above." />
        ) : (
          <div className="divide-y divide-white/5">
            {data.connections.map((connection) => (
              <div
                key={connection.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-medium">
                    {connection.username.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {connection.username}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Connected{" "}
                      {formatDistanceToNow(new Date(connection.connectedAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title="Message"
                    onClick={() => void messageUser(connection.userId)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Remove connection"
                    onClick={() => void remove(connection.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Block user"
                    onClick={() => void block(connection.userId)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-white/10 hover:text-red-400"
                  >
                    <Ban className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title={`Invites sent (${data.sent.length})`}>
        {data.sent.length === 0 ? (
          <EmptyRow text="No pending invites." />
        ) : (
          <div className="divide-y divide-white/5">
            {data.sent.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{invite.identifier}</p>
                  <p className="text-xs text-muted-foreground">
                    Pending · expires{" "}
                    {formatDistanceToNow(new Date(invite.expiresAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void revoke(invite.id)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/15 px-2.5 py-1 text-xs text-muted-foreground hover:bg-white/5"
                >
                  <Undo2 className="h-3 w-3" />
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {data.blocks.length > 0 ? (
        <SectionCard title={`Blocked (${data.blocks.length})`}>
          <div className="divide-y divide-white/5">
            {data.blocks.map((blockRow) => (
              <div
                key={blockRow.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <p className="text-sm">{blockRow.username}</p>
                <button
                  type="button"
                  onClick={() => void unblock(blockRow.id)}
                  className="rounded-md border border-white/15 px-2.5 py-1 text-xs text-muted-foreground hover:bg-white/5"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
