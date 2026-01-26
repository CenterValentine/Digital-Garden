/**
 * Preferences Settings Page
 */

"use client";

import { useState, useEffect } from "react";
import { getSurfaceStyles } from "@/lib/design-system";
import { useUploadSettingsStore } from "@/state/upload-settings-store";
import { Button } from "@/components/ui/glass/button";
import { AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";

export default function PreferencesSettingsPage() {
  const glass0 = getSurfaceStyles("glass-0");
  const {
    uploadMode,
    setUploadMode,
    officeViewerMode,
    setOfficeViewerMode,
    onlyofficeServerUrl,
    setOnlyofficeServerUrl,
  } = useUploadSettingsStore();

  const [serverUrlInput, setServerUrlInput] = useState(onlyofficeServerUrl || "");
  const [isSaving, setIsSaving] = useState(false);
  const [hasGoogleAuth, setHasGoogleAuth] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check if user has Google authentication
  useEffect(() => {
    async function checkGoogleAuth() {
      try {
        const response = await fetch("/api/auth/provider");
        const data = await response.json();

        if (data.success && data.data.hasGoogleAuth) {
          setHasGoogleAuth(true);
        }
      } catch (err) {
        console.error("Failed to check Google auth:", err);
      } finally {
        setIsCheckingAuth(false);
      }
    }

    checkGoogleAuth();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Preferences</h1>
        <p className="text-muted-foreground mt-2">Editor settings and workflow customization</p>
      </div>

      {/* File Upload Settings */}
      <div
        className="border border-white/10 rounded-lg p-6"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h3 className="text-lg font-semibold mb-4">File Upload</h3>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-300">Upload Confirmation</label>
          <div className="space-y-2">
            {/* Manual Mode - Now First */}
            <label className="flex items-start gap-3 p-2.5 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer transition-colors">
              <input
                type="radio"
                name="uploadMode"
                value="manual"
                checked={uploadMode === 'manual'}
                onChange={(e) => setUploadMode(e.target.value as 'manual')}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="text-sm text-gray-400">
                  Review and rename files before uploading.
                </div>
              </div>
            </label>

            {/* Automatic Mode - Now Second */}
            <label className="flex items-start gap-3 p-2.5 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer transition-colors">
              <input
                type="radio"
                name="uploadMode"
                value="automatic"
                checked={uploadMode === 'automatic'}
                onChange={(e) => setUploadMode(e.target.value as 'automatic')}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="text-sm text-gray-400">
                  Files upload immediately after selection or drag-and-drop.
                </div>
              </div>
            </label>
          </div>

          {/* Current Setting Indicator */}
          <div className="pt-2 border-t border-white/10">
            <div className="text-xs text-gray-400">
              {uploadMode === 'automatic' ? (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-2"></span>
                  Files will upload automatically
                </>
              ) : (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                  You'll confirm each upload
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Office Document Settings */}
      <div
        className="border border-white/10 rounded-lg p-6"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h3 className="text-lg font-semibold mb-4">Office Documents</h3>

        <div className="space-y-4">
          {/* Viewer Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">Viewing Mode</label>
            <div className="space-y-2">
              {/* Google Docs - Editing for Google users, View-only for others */}
              <label className="flex items-start gap-3 p-2.5 rounded-lg border border-green-500/30 bg-green-500/5 hover:bg-green-500/10 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="officeViewerMode"
                  value="google-docs"
                  checked={officeViewerMode === "google-docs"}
                  onChange={(e) => setOfficeViewerMode(e.target.value as "google-docs")}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm flex items-center gap-2">
                    Google Docs/Sheets/Slides
                    {hasGoogleAuth && (
                      <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                        Recommended
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-400">
                    {hasGoogleAuth
                      ? "Full editing with auto-save, synced to your Google Drive"
                      : "View-only mode (sign in with Google for editing)"}
                  </div>
                </div>
              </label>

              {/* ONLYOFFICE - Edit Mode */}
              <label className="flex items-start gap-3 p-2.5 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="officeViewerMode"
                  value="onlyoffice"
                  checked={officeViewerMode === "onlyoffice"}
                  onChange={(e) => setOfficeViewerMode(e.target.value as "onlyoffice")}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">ONLYOFFICE Editor</div>
                  <div className="text-sm text-gray-400">
                    Full editing with auto-save (requires server setup)
                  </div>
                </div>
              </label>

              {/* Microsoft Viewer - View Only */}
              <label className="flex items-start gap-3 p-2.5 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="officeViewerMode"
                  value="microsoft-viewer"
                  checked={officeViewerMode === "microsoft-viewer"}
                  onChange={(e) => setOfficeViewerMode(e.target.value as "microsoft-viewer")}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">Microsoft Office Online (View Only)</div>
                  <div className="text-sm text-gray-400">
                    Read-only preview using Microsoft's viewer
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* ONLYOFFICE Server Configuration */}
          {officeViewerMode === "onlyoffice" && (
            <div className="pt-4 border-t border-white/10">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                ONLYOFFICE Document Server URL
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://your-onlyoffice-server.com"
                  value={serverUrlInput}
                  onChange={(e) => setServerUrlInput(e.target.value)}
                  className="flex-1 px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button
                  onClick={() => {
                    setIsSaving(true);
                    setOnlyofficeServerUrl(serverUrlInput || null);
                    setTimeout(() => {
                      setIsSaving(false);
                      toast.success("Settings saved", {
                        icon: <Check className="h-4 w-4" />,
                      });
                    }, 300);
                  }}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              </div>
              {onlyofficeServerUrl ? (
                <p className="text-xs text-green-400 mt-2 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Connected: {onlyofficeServerUrl}
                </p>
              ) : (
                <p className="text-xs text-yellow-400 mt-2 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  No server configured. Office documents will fall back to view-only mode.
                </p>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Need help setting up ONLYOFFICE?{" "}
                <a
                  href="https://api.onlyoffice.com/docs/docs-api/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  View documentation
                </a>
              </p>
            </div>
          )}

          {/* Status Indicator */}
          <div className="pt-2 border-t border-white/10">
            <div className="text-xs text-gray-400">
              {officeViewerMode === "google-docs" && hasGoogleAuth ? (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                  Office documents will open in Google Docs (full editing)
                </>
              ) : officeViewerMode === "google-docs" && !hasGoogleAuth ? (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                  Office documents will open in Google Docs (view-only mode)
                </>
              ) : officeViewerMode === "onlyoffice" && onlyofficeServerUrl ? (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                  Office documents will open in ONLYOFFICE editor
                </>
              ) : officeViewerMode === "onlyoffice" && !onlyofficeServerUrl ? (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-2"></span>
                  ONLYOFFICE not configured - using view-only mode
                </>
              ) : (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                  Office documents will open in view-only mode
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Future Settings Placeholder */}
      <div
        className="border border-white/10 rounded-lg p-6"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h3 className="text-lg font-semibold mb-4">Editor & Shortcuts</h3>
        <p className="text-sm text-muted-foreground">
          Editor preferences and keyboard shortcuts will be available here soon.
        </p>
      </div>
    </div>
  );
}
