/**
 * Storage Providers Tab
 *
 * Configure R2, S3, Vercel Blob providers
 * Set default provider with warning about migration
 */

"use client";

import { useState, useEffect } from "react";
import { getSurfaceStyles } from "@/lib/design-system";
import { toast } from "sonner";
import { maskSensitiveValue } from "@/lib/infrastructure/crypto/encryption";
import { ProviderConfigForm } from "./ProviderConfigForm";

interface StorageProvider {
  id: string;
  provider: "r2" | "s3" | "vercel";
  displayName: string;
  isDefault: boolean;
  isActive: boolean;
  config?: {
    bucket?: string;
    region?: string;
    endpoint?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export function StorageProvidersTab() {
  const glass0 = getSurfaceStyles("glass-0");
  const glass1 = getSurfaceStyles("glass-1");

  const [providers, setProviders] = useState<StorageProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<"r2" | "s3" | "vercel" | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [pendingDefaultId, setPendingDefaultId] = useState<string | null>(null);

  // Fetch providers on mount
  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    try {
      const response = await fetch("/api/content/storage");
      if (!response.ok) throw new Error("Failed to fetch providers");

      const data = await response.json();
      setProviders(data.data.configs || []);
    } catch (error) {
      console.error("[ProvidersTab] Fetch error:", error);
      toast.error("Failed to load storage providers");
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = (providerId: string) => {
    console.log("[ProvidersTab] Set default provider:", providerId);
    setPendingDefaultId(providerId);
    setShowWarning(true);
  };

  const handleConfirmSwitch = async () => {
    if (!pendingDefaultId) return;

    try {
      const response = await fetch(`/api/content/storage/${pendingDefaultId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });

      if (!response.ok) throw new Error("Failed to set default provider");

      toast.success("Default provider updated");
      setShowWarning(false);
      setPendingDefaultId(null);
      await fetchProviders(); // Refresh the list
    } catch (error) {
      console.error("[ProvidersTab] Set default error:", error);
      toast.error("Failed to update default provider");
    }
  };

  const handleAddProvider = () => {
    console.log("[ProvidersTab] Add provider clicked");
    setShowAddProvider(true);
  };

  const handleEditProvider = (providerId: string) => {
    console.log("[ProvidersTab] Edit provider:", providerId);
    toast.info("Edit configuration form coming soon");
  };

  const handleDeleteProvider = async (providerId: string) => {
    if (!confirm("Are you sure you want to delete this provider? This cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(`/api/content/storage/${providerId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete provider");

      toast.success("Provider deleted");
      await fetchProviders(); // Refresh the list
    } catch (error) {
      console.error("[ProvidersTab] Delete error:", error);
      toast.error("Failed to delete provider");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading storage providers...</div>
      </div>
    );
  }

  const defaultProvider = providers.find((p) => p.isDefault);
  const otherProviders = providers.filter((p) => !p.isDefault);

  return (
    <div className="space-y-6">
      {/* Current Default Provider */}
      {defaultProvider && (
        <div
          className="border border-primary rounded-lg p-6"
          style={{
            background: glass0.background,
            backdropFilter: glass0.backdropFilter,
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">
                  {defaultProvider.displayName}
                </h3>
                <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                  Default
                </span>
                {defaultProvider.isActive && (
                  <span className="px-2 py-1 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    Active
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                All new uploads use this provider
              </p>

              <div className="mt-4 space-y-2 text-sm">
                {defaultProvider.config?.bucket && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Bucket:</span>
                    <code className="text-gray-300">{defaultProvider.config.bucket}</code>
                  </div>
                )}
                {defaultProvider.config?.region && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Region:</span>
                    <code className="text-gray-300">{defaultProvider.config.region}</code>
                  </div>
                )}
                {defaultProvider.config?.endpoint && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Endpoint:</span>
                    <code className="text-gray-300 text-xs">{maskSensitiveValue(defaultProvider.config.endpoint, 15)}</code>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">Provider:</span>
                  <code className="text-gray-300 uppercase">{defaultProvider.provider}</code>
                </div>
                {!defaultProvider.config && (
                  <p className="text-xs text-gray-500 italic mt-2">
                    Configuration details hidden for security
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={() => handleEditProvider(defaultProvider.id)}
              className="px-4 py-2 text-sm rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
            >
              Edit Configuration
            </button>
          </div>
        </div>
      )}

      {/* Other Providers */}
      {otherProviders.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-400">Other Providers</h3>
          {otherProviders.map((provider) => (
            <div
              key={provider.id}
              className="border border-white/10 rounded-lg p-4"
              style={{
                background: glass0.background,
                backdropFilter: glass0.backdropFilter,
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h4 className="font-medium">{provider.displayName}</h4>
                    {!provider.isActive && (
                      <span className="px-2 py-1 text-xs rounded-full bg-gray-500/20 text-gray-400 border border-gray-500/30">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {provider.config?.bucket || provider.config?.region || "Configuration hidden"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSetDefault(provider.id)}
                    className="px-3 py-1 text-xs rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                  >
                    Set Default
                  </button>
                  <button
                    onClick={() => handleDeleteProvider(provider.id)}
                    className="px-3 py-1 text-xs rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Provider */}
      {!showAddProvider ? (
        <div
          className="border border-white/10 rounded-lg p-6"
          style={{
            background: glass0.background,
            backdropFilter: glass0.backdropFilter,
          }}
        >
          <h3 className="text-lg font-semibold">Add Storage Provider</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Configure additional providers for redundancy
          </p>

          <button
            onClick={handleAddProvider}
            className="px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary/90 transition-colors font-medium"
          >
            + Add Provider
          </button>
        </div>
      ) : selectedProvider ? (
        <ProviderConfigForm
          provider={selectedProvider}
          onSuccess={() => {
            setSelectedProvider(null);
            setShowAddProvider(false);
            fetchProviders();
          }}
          onCancel={() => {
            setSelectedProvider(null);
            setShowAddProvider(false);
          }}
        />
      ) : (
        <div
          className="border border-white/10 rounded-lg p-6"
          style={{
            background: glass0.background,
            backdropFilter: glass0.backdropFilter,
          }}
        >
          <h3 className="text-lg font-semibold mb-4">Choose Provider</h3>

          <div className="space-y-3">
            {["r2", "s3", "vercel"].map((provider) => (
              <button
                key={provider}
                onClick={() => {
                  setSelectedProvider(provider as "r2" | "s3" | "vercel");
                }}
                className="w-full p-4 text-left border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium capitalize">{provider === "r2" ? "Cloudflare R2" : provider === "s3" ? "Amazon S3" : "Vercel Blob"}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {provider === "r2" && "Zero egress fees, S3-compatible"}
                      {provider === "s3" && "AWS S3 with global CDN"}
                      {provider === "vercel" && "Simple, serverless storage"}
                    </div>
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-gray-400"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowAddProvider(false)}
            className="mt-4 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Provider Switching Warning */}
      <div
        className="border border-yellow-500/30 rounded-lg p-6 bg-yellow-500/10"
        style={{
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <div className="flex gap-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-yellow-400 flex-shrink-0 mt-0.5"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-yellow-400">
              Warning: Changing Storage Provider
            </h4>
            <p className="text-sm text-gray-300 mt-2">
              Changing your default provider only affects <strong>new uploads</strong>.
              Existing files remain in their current provider.
            </p>
            <p className="text-sm text-gray-300 mt-2 font-semibold">
              Manual migration is not currently supported. Switching is final.
            </p>
          </div>
        </div>
      </div>

      {/* Warning Dialog (Modal) */}
      {showWarning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div
            className="w-full max-w-md p-6 border border-white/10 rounded-lg"
            style={{
              background: glass1.background,
              backdropFilter: glass1.backdropFilter,
            }}
          >
            <div className="flex gap-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-yellow-400 flex-shrink-0"
              >
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold">Confirm Provider Change</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  You are about to change your default storage provider.
                </p>

                <ul className="mt-4 space-y-2 text-sm text-gray-300">
                  <li className="flex gap-2">
                    <span>•</span>
                    <span>New uploads will go to the new provider</span>
                  </li>
                  <li className="flex gap-2">
                    <span>•</span>
                    <span>Existing files will stay in their current provider</span>
                  </li>
                  <li className="flex gap-2">
                    <span>•</span>
                    <span>Migration is not automatic</span>
                  </li>
                </ul>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => setShowWarning(false)}
                    className="flex-1 px-4 py-2 text-sm rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmSwitch}
                    className="flex-1 px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary/90 transition-colors font-medium"
                  >
                    I Understand, Continue
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
