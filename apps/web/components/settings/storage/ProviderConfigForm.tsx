/**
 * Provider Configuration Form
 *
 * Form for configuring R2, S3, or Vercel Blob storage providers
 * Collects credentials and configuration, encrypts before sending to API
 */

"use client";

import { useState } from "react";
import { getSurfaceStyles } from "@/lib/design-system";
import { toast } from "sonner";

interface ProviderConfigFormProps {
  provider: "r2" | "s3" | "vercel";
  onSuccess: () => void;
  onCancel: () => void;
}

export function ProviderConfigForm({ provider, onSuccess, onCancel }: ProviderConfigFormProps) {
  const glass0 = getSurfaceStyles("glass-0");

  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState(getDefaultDisplayName(provider));

  // R2-specific fields
  const [r2AccountId, setR2AccountId] = useState("");
  const [r2AccessKeyId, setR2AccessKeyId] = useState("");
  const [r2SecretAccessKey, setR2SecretAccessKey] = useState("");
  const [r2BucketName, setR2BucketName] = useState("");
  const [r2Endpoint, setR2Endpoint] = useState("");

  // S3-specific fields
  const [s3AccessKeyId, setS3AccessKeyId] = useState("");
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState("");
  const [s3BucketName, setS3BucketName] = useState("");
  const [s3Region, setS3Region] = useState("us-east-1");

  // Vercel-specific fields
  const [vercelToken, setVercelToken] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let config: any = {};
      let credentials: any = {};

      if (provider === "r2") {
        config = {
          bucket: r2BucketName,
          endpoint: r2Endpoint,
        };
        credentials = {
          accountId: r2AccountId,
          accessKeyId: r2AccessKeyId,
          secretAccessKey: r2SecretAccessKey,
        };
      } else if (provider === "s3") {
        config = {
          bucket: s3BucketName,
          region: s3Region,
        };
        credentials = {
          accessKeyId: s3AccessKeyId,
          secretAccessKey: s3SecretAccessKey,
        };
      } else if (provider === "vercel") {
        config = {};
        credentials = {
          token: vercelToken,
        };
      }

      const response = await fetch("/api/notes/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          displayName,
          config,
          credentials,
          isDefault: false, // Don't automatically set as default
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create provider");
      }

      toast.success(`${displayName} configured successfully`);
      onSuccess();
    } catch (error) {
      console.error("[ProviderConfigForm] Submit error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to configure provider");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="border border-white/10 rounded-lg p-6"
      style={{
        background: glass0.background,
        backdropFilter: glass0.backdropFilter,
      }}
    >
      <h3 className="text-lg font-semibold mb-4">
        Configure {getDefaultDisplayName(provider)}
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Display Name */}
        <div>
          <label className="block text-sm font-medium mb-2">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="My Storage Provider"
            required
          />
        </div>

        {/* R2 Fields */}
        {provider === "r2" && (
          <>
            <div>
              <label className="block text-sm font-medium mb-2">Account ID</label>
              <input
                type="text"
                value={r2AccountId}
                onChange={(e) => setR2AccountId(e.target.value)}
                className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                placeholder="a1b2c3d4e5f6..."
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Access Key ID</label>
              <input
                type="text"
                value={r2AccessKeyId}
                onChange={(e) => setR2AccessKeyId(e.target.value)}
                className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                placeholder="AKIA..."
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Secret Access Key</label>
              <input
                type="password"
                value={r2SecretAccessKey}
                onChange={(e) => setR2SecretAccessKey(e.target.value)}
                className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                placeholder="Secret key"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Bucket Name</label>
              <input
                type="text"
                value={r2BucketName}
                onChange={(e) => setR2BucketName(e.target.value)}
                className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="my-bucket"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Endpoint</label>
              <input
                type="url"
                value={r2Endpoint}
                onChange={(e) => setR2Endpoint(e.target.value)}
                className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                placeholder="https://[account-id].r2.cloudflarestorage.com"
                required
              />
            </div>
          </>
        )}

        {/* S3 Fields */}
        {provider === "s3" && (
          <>
            <div>
              <label className="block text-sm font-medium mb-2">Access Key ID</label>
              <input
                type="text"
                value={s3AccessKeyId}
                onChange={(e) => setS3AccessKeyId(e.target.value)}
                className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                placeholder="AKIA..."
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Secret Access Key</label>
              <input
                type="password"
                value={s3SecretAccessKey}
                onChange={(e) => setS3SecretAccessKey(e.target.value)}
                className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                placeholder="Secret key"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Bucket Name</label>
              <input
                type="text"
                value={s3BucketName}
                onChange={(e) => setS3BucketName(e.target.value)}
                className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="my-bucket"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Region</label>
              <select
                value={s3Region}
                onChange={(e) => setS3Region(e.target.value)}
                className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              >
                <option value="us-east-1">US East (N. Virginia)</option>
                <option value="us-east-2">US East (Ohio)</option>
                <option value="us-west-1">US West (N. California)</option>
                <option value="us-west-2">US West (Oregon)</option>
                <option value="eu-west-1">EU (Ireland)</option>
                <option value="eu-central-1">EU (Frankfurt)</option>
                <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
              </select>
            </div>
          </>
        )}

        {/* Vercel Fields */}
        {provider === "vercel" && (
          <div>
            <label className="block text-sm font-medium mb-2">Read/Write Token</label>
            <input
              type="password"
              value={vercelToken}
              onChange={(e) => setVercelToken(e.target.value)}
              className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
              placeholder="vercel_blob_rw_..."
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Get your token from{" "}
              <a
                href="https://vercel.com/dashboard/stores"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Vercel Dashboard → Storage
              </a>
            </p>
          </div>
        )}

        {/* Security Notice */}
        <div className="border border-blue-500/30 rounded-lg p-3 bg-blue-500/10">
          <div className="flex gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-blue-400 flex-shrink-0 mt-0.5"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
            </svg>
            <p className="text-xs text-gray-300">
              Your credentials are encrypted with AES-256-GCM before being stored in the database.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2 text-sm rounded-lg border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary/90 transition-colors font-medium disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </form>
    </div>
  );
}

function getDefaultDisplayName(provider: "r2" | "s3" | "vercel"): string {
  switch (provider) {
    case "r2":
      return "Cloudflare R2";
    case "s3":
      return "Amazon S3";
    case "vercel":
      return "Vercel Blob";
  }
}
