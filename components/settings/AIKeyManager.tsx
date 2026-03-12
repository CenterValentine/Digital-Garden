/**
 * AIKeyManager — Sprint 38
 *
 * BYOK key management UI for the AI settings page.
 * Lists stored keys (masked), allows add/verify/delete.
 * Communicates with /api/ai/keys endpoints.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { PROVIDER_CATALOG } from "@/lib/domain/ai";
import type { AIProviderId } from "@/lib/domain/ai";
import { Key, Trash2, CheckCircle2, XCircle, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

interface MaskedKey {
  id: string;
  providerId: AIProviderId;
  maskedKey: string;
  label: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export function AIKeyManager() {
  const [keys, setKeys] = useState<MaskedKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // Add form state
  const [newProviderId, setNewProviderId] = useState<AIProviderId>("anthropic");
  const [newApiKey, setNewApiKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<boolean | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/keys");
      const data = await res.json();
      if (data.success) setKeys(data.data);
    } catch (err) {
      console.error("Failed to load API keys:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  // Providers that don't have a stored key yet
  const availableProviders = PROVIDER_CATALOG.filter(
    (p) => !keys.some((k) => k.providerId === p.id)
  );

  const handleVerify = async () => {
    if (!newApiKey.trim()) return;
    setIsVerifying(true);
    setVerifyResult(null);

    try {
      const res = await fetch("/api/ai/keys/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: newProviderId, apiKey: newApiKey }),
      });
      const data = await res.json();
      setVerifyResult(data.success && data.data?.valid === true);
    } catch {
      setVerifyResult(false);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSave = async () => {
    if (!newApiKey.trim()) return;
    setIsSaving(true);

    try {
      const res = await fetch("/api/ai/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: newProviderId,
          apiKey: newApiKey,
          label: newLabel || undefined,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setKeys(data.data);
        setShowAddForm(false);
        setNewApiKey("");
        setNewLabel("");
        setVerifyResult(null);
        toast.success("API key saved");
      } else {
        toast.error(data.error?.message || "Failed to save key");
      }
    } catch {
      toast.error("Failed to save key");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (keyId: string) => {
    setDeletingId(keyId);
    try {
      const res = await fetch(`/api/ai/keys/${keyId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setKeys(data.data);
        toast.success("API key removed");
      }
    } catch {
      toast.error("Failed to remove key");
    } finally {
      setDeletingId(null);
    }
  };

  const getProviderName = (providerId: string) =>
    PROVIDER_CATALOG.find((p) => p.id === providerId)?.name ?? providerId;

  if (isLoading) {
    return (
      <div className="text-sm text-gray-400 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading API keys...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stored Keys List */}
      {keys.length > 0 ? (
        <div className="space-y-2">
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center gap-3 p-2.5 rounded-lg border border-white/10 bg-white/[0.02]"
            >
              <Key className="h-4 w-4 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {getProviderName(key.providerId)}
                  </span>
                  {key.label && (
                    <span className="text-xs text-gray-500">({key.label})</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 font-mono">
                  {key.maskedKey}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {key.isActive && (
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Active" />
                )}
                <button
                  onClick={() => handleDelete(key.id)}
                  disabled={deletingId === key.id}
                  className="p-1.5 rounded-md text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  title="Remove key"
                >
                  {deletingId === key.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          No API keys stored. Add a key to use your own provider accounts.
        </p>
      )}

      {/* Add Key Form */}
      {showAddForm ? (
        <div className="p-4 rounded-lg border border-primary/20 bg-primary/5 space-y-3">
          {/* Provider Select */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Provider
            </label>
            <select
              value={newProviderId}
              onChange={(e) => {
                setNewProviderId(e.target.value as AIProviderId);
                setVerifyResult(null);
              }}
              className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {availableProviders.length > 0 ? (
                availableProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              ) : (
                // If all providers have keys, still allow updating existing ones
                PROVIDER_CATALOG.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (update existing)
                  </option>
                ))
              )}
            </select>
          </div>

          {/* API Key Input */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              API Key
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={newApiKey}
                onChange={(e) => {
                  setNewApiKey(e.target.value);
                  setVerifyResult(null);
                }}
                placeholder="sk-..."
                className="flex-1 px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                onClick={handleVerify}
                disabled={isVerifying || !newApiKey.trim()}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                title="Test key with a minimal API call"
              >
                {isVerifying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : verifyResult === true ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                ) : verifyResult === false ? (
                  <XCircle className="h-3.5 w-3.5 text-red-400" />
                ) : null}
                Verify
              </button>
            </div>
            {verifyResult === true && (
              <p className="text-xs text-green-400 mt-1">Key is valid</p>
            )}
            {verifyResult === false && (
              <p className="text-xs text-red-400 mt-1">
                Key verification failed. Check the key and try again.
              </p>
            )}
          </div>

          {/* Label (optional) */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Label <span className="text-gray-500">(optional)</span>
            </label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Personal, Work"
              className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={isSaving || !newApiKey.trim()}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Key"}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewApiKey("");
                setNewLabel("");
                setVerifyResult(null);
              }}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-white/10 hover:bg-white/5 transition-colors text-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            setShowAddForm(true);
            // Default to first provider without a key
            if (availableProviders.length > 0) {
              setNewProviderId(availableProviders[0].id as AIProviderId);
            }
          }}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-dashed border-white/20 hover:border-primary/40 hover:bg-primary/5 transition-colors text-gray-400 hover:text-gray-300"
        >
          <Plus className="h-4 w-4" />
          Add API Key
        </button>
      )}
    </div>
  );
}
