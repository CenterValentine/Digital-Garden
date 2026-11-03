"use client";

/**
 * Connect once with a personal access token (CANVAS-ARCHIVE-PLAN.md §11).
 * The token is checked against Canvas, then stored encrypted on the server;
 * it never comes back to the browser.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { canvasClient, type CanvasConnection } from "../lib/api";

export function CanvasConnectForm({ onConnected }: { onConnected: (connection: CanvasConnection) => void }) {
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const { connection } = await canvasClient.saveConnection(baseUrl, token);
      setToken("");
      onConnected(connection);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't connect");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="space-y-3 text-xs text-gray-600 dark:text-gray-300"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <ol className="list-decimal space-y-1 pl-4">
        <li>Sign in to your school&apos;s Canvas.</li>
        <li>
          Open <strong>Account → Settings</strong>, scroll to <strong>Approved Integrations</strong>, and choose{" "}
          <strong>+ New Access Token</strong>. Give it a purpose and an expiry date.
        </li>
        <li>Copy the token (Canvas shows it only once) and paste it below.</li>
      </ol>
      <label className="block">
        <span className="text-gray-500 dark:text-gray-400">Canvas address</span>
        <input
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="https://school.instructure.com"
          className="mt-1 w-full rounded border border-black/10 dark:border-white/10 bg-transparent px-2 py-1.5 text-sm"
          autoComplete="url"
        />
      </label>
      <label className="block">
        <span className="text-gray-500 dark:text-gray-400">Access token</span>
        <input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          type="password"
          className="mt-1 w-full rounded border border-black/10 dark:border-white/10 bg-transparent px-2 py-1.5 text-sm"
          autoComplete="off"
        />
      </label>
      <p className="text-gray-500 dark:text-gray-400">
        Read-only: the import never changes anything in Canvas. The token is stored encrypted and never shown again.
      </p>
      {error && <p className="text-amber-600 dark:text-amber-400">{error}</p>}
      <button
        type="submit"
        disabled={!baseUrl.trim() || !token.trim() || saving}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-40"
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Connect
      </button>
    </form>
  );
}
