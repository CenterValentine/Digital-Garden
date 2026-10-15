"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Upload } from "lucide-react";
import type {
  HighlightImportSummary,
  ReaderConnectionDto,
  ReaderConnectionProvider,
} from "@/lib/domain/reader/types";
import { readerApi } from "../lib/api";

const PROVIDERS: Record<
  ReaderConnectionProvider,
  { label: string; description: string; tokenHelp: string; tokenUrl: string }
> = {
  readwise: {
    label: "Readwise",
    description:
      "Imports the highlights you already have in Readwise — Kindle, Apple Books, Kobo and more. Requires a Readwise subscription.",
    tokenHelp: "Access token from readwise.io/access_token",
    tokenUrl: "https://readwise.io/access_token",
  },
  hardcover: {
    label: "Hardcover",
    description:
      "Mirrors your reading status (want to read / reading / finished) to Hardcover, the open Goodreads alternative.",
    tokenHelp: "API token from hardcover.app/account/api",
    tokenUrl: "https://hardcover.app/account/api",
  },
  "google-books": {
    label: "Google Books",
    description:
      "Optional API key — raises Google Books search limits. Search works without one.",
    tokenHelp: "API key from Google Cloud Console (Books API enabled)",
    tokenUrl: "https://console.cloud.google.com/apis/library/books.googleapis.com",
  },
};

function summaryText(summary: HighlightImportSummary): string {
  const parts = [`${summary.created} new highlight${summary.created === 1 ? "" : "s"}`];
  if (summary.skipped) parts.push(`${summary.skipped} already imported`);
  if (summary.unmatchedBooks.length) {
    parts.push(
      `${summary.unmatchedBooks.length} book${summary.unmatchedBooks.length === 1 ? "" : "s"} not in your library — saved as "… — Highlights" notes in Books`
    );
  }
  return parts.join(" · ");
}

export function ConnectionsPanel() {
  const [connections, setConnections] = useState<ReaderConnectionDto[] | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<ReaderConnectionProvider, string>>>({});
  const [busy, setBusy] = useState<ReaderConnectionProvider | null>(null);

  const load = useCallback(async () => {
    try {
      setConnections((await readerApi.connections()).connections);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load connections");
      setConnections([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!connections) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  return (
    <div className="space-y-4">
      {(Object.keys(PROVIDERS) as ReaderConnectionProvider[]).map((provider) => {
        const info = PROVIDERS[provider];
        const connection = connections.find((candidate) => candidate.provider === provider);
        return (
          <div key={provider} className="rounded-lg border border-black/10 p-3 dark:border-white/10">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{info.label}</h3>
              {connection?.connected && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  Connected {connection.hint ? `(${connection.hint})` : ""}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{info.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="password"
                autoComplete="off"
                placeholder={info.tokenHelp}
                value={drafts[provider] ?? ""}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [provider]: event.target.value }))
                }
                className="h-8 min-w-[220px] flex-1 rounded border border-black/10 bg-transparent px-2 text-xs dark:border-white/10"
              />
              <button
                type="button"
                disabled={!drafts[provider] || busy === provider}
                onClick={async () => {
                  setBusy(provider);
                  try {
                    await readerApi.saveConnection(provider, drafts[provider] ?? "");
                    setDrafts((current) => ({ ...current, [provider]: "" }));
                    toast.success(`${info.label} connected`);
                    await load();
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not connect");
                  } finally {
                    setBusy(null);
                  }
                }}
                className="h-8 rounded bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy === provider ? "Checking…" : connection?.connected ? "Replace" : "Connect"}
              </button>
              {connection?.connected && (
                <button
                  type="button"
                  onClick={async () => {
                    await readerApi.deleteConnection(provider);
                    await load();
                  }}
                  className="h-8 rounded px-2 text-xs text-muted-foreground hover:text-red-500"
                >
                  Disconnect
                </button>
              )}
              <a
                href={info.tokenUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Get a token
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ImportPanel() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"kindle" | "readwise" | null>(null);
  const [lastSummary, setLastSummary] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
        <h3 className="text-sm font-semibold">Kindle — My Clippings.txt</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Plug in your Kindle, open the <code>documents</code> folder and choose{" "}
          <code>My Clippings.txt</code>. Highlights attach to matching books in your library; the rest
          become &quot;… — Highlights&quot; notes. Re-importing skips what you already have.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept=".txt,text/plain"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setBusy("kindle");
            try {
              const summary = await readerApi.importKindle(file);
              const text = summaryText(summary);
              setLastSummary(text);
              toast.success("Kindle highlights imported", { description: text });
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Import failed");
            } finally {
              setBusy(null);
            }
          }}
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => fileInput.current?.click()}
          className="mt-2 inline-flex h-8 items-center gap-1 rounded bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy === "kindle" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Choose file
        </button>
      </div>

      <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
        <h3 className="text-sm font-semibold">Readwise</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Pulls book highlights from Readwise (connect it under Connections first). After the first
          sync only new highlights come in.
        </p>
        <button
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("readwise");
            try {
              const summary = await readerApi.importReadwise();
              const text = summaryText(summary);
              setLastSummary(text);
              toast.success("Readwise synced", { description: text });
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Sync failed");
            } finally {
              setBusy(null);
            }
          }}
          className="mt-2 inline-flex h-8 items-center gap-1 rounded bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy === "readwise" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Sync now
        </button>
      </div>

      {lastSummary && <p className="text-xs text-muted-foreground">Last import: {lastSummary}</p>}
    </div>
  );
}
