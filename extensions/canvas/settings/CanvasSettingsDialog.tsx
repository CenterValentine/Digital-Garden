"use client";

import { useCallback, useEffect, useState } from "react";
import { SettingSection } from "@/components/settings/ui";
import { canvasClient, openCanvasImport, type CanvasConnection } from "../lib/api";
import { CanvasConnectForm } from "../components/CanvasConnectForm";

export default function CanvasSettingsDialog() {
  const [connections, setConnections] = useState<CanvasConnection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setConnections((await canvasClient.connections()).connections);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't load your Canvas connection");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    canvasClient
      .connections()
      .then(({ connections: loaded }) => {
        if (!cancelled) setConnections(loaded);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Couldn't load your Canvas connection");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const disconnect = async (id: string) => {
    try {
      await canvasClient.disconnect(id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't disconnect");
    }
  };

  const live = (connections ?? []).filter((connection) => connection.connected);

  return (
    <div className="space-y-6">
      <SettingSection
        title="Canvas connection"
        description="A personal access token from your Canvas account, stored encrypted. Imports are read-only: nothing in Canvas changes. Disconnecting forgets the token; courses you imported stay, with their provenance."
      >
        <div className="space-y-3 text-sm">
          {error && <p className="text-xs text-amber-600 dark:text-amber-400">{error}</p>}
          {connections === null && !error && <p className="text-xs text-muted-foreground">Loading…</p>}
          {live.map((connection) => (
            <div key={connection.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-black/10 dark:border-white/10 px-3 py-2">
              <div className="text-xs">
                <p className="font-medium">{connection.baseUrl}</p>
                <p className="text-muted-foreground">
                  {connection.displayName ? `${connection.displayName} · ` : ""}token {connection.tokenHint}
                </p>
              </div>
              <button type="button" onClick={() => void disconnect(connection.id)} className="rounded border border-black/10 dark:border-white/10 px-2 py-1 text-xs">
                Disconnect
              </button>
            </div>
          ))}
          {connections !== null && (live.length === 0 || adding) ? (
            <CanvasConnectForm
              onConnected={() => {
                setAdding(false);
                void load();
              }}
            />
          ) : (
            connections !== null && (
              <button type="button" onClick={() => setAdding(true)} className="rounded border border-black/10 dark:border-white/10 px-2 py-1 text-xs">
                Replace token
              </button>
            )
          )}
        </div>
      </SettingSection>

      <SettingSection
        title="Import"
        description="Import from the file tree: + → Canvas Course… (or right-click a folder → New → Canvas Course…). To check an imported course for changes, select anything inside it and open the Canvas tab in the right sidebar."
      >
        <button type="button" onClick={() => openCanvasImport(null)} className="rounded border border-black/10 dark:border-white/10 px-3 py-1.5 text-xs">
          Import a course…
        </button>
      </SettingSection>
    </div>
  );
}
