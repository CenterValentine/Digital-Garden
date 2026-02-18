/**
 * Preferences Settings Page
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { getSurfaceStyles } from "@/lib/design/system";
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
  const isSavingRef = useRef(false); // Synchronous flag to prevent double-clicks
  const [hasGoogleAuth, setHasGoogleAuth] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // File tree settings
  const [defaultFolderViewMode, setDefaultFolderViewMode] = useState<"list" | "gallery" | "kanban" | "dashboard" | "canvas">("list");
  const [defaultFolderSortMode, setDefaultFolderSortMode] = useState<"asc" | "desc" | "manual">("manual");
  const [showFileExtensions, setShowFileExtensions] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [isLoadingFileTree, setIsLoadingFileTree] = useState(true);

  // External link settings
  const [previewsEnabled, setPreviewsEnabled] = useState(false);
  const [allowAllDomains, setAllowAllDomains] = useState(false);
  const [allowlistedHosts, setAllowlistedHosts] = useState<string[]>([]);
  const [allowHttp, setAllowHttp] = useState(false);
  const [newHost, setNewHost] = useState("");
  const [isLoadingExternal, setIsLoadingExternal] = useState(true);

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

  // Load file tree settings from user settings
  useEffect(() => {
    async function loadFileTreeSettings() {
      try {
        const response = await fetch("/api/user/settings");
        const data = await response.json();

        console.log("[Preferences] API response:", data);
        console.log("[Preferences] Settings data:", data.data);

        if (data.success && data.data?.fileTree) {
          const { fileTree } = data.data;
          console.log("[Preferences] Loaded file tree settings:", fileTree);
          if (fileTree.defaultFolderViewMode) setDefaultFolderViewMode(fileTree.defaultFolderViewMode);
          if (fileTree.defaultFolderSortMode) setDefaultFolderSortMode(fileTree.defaultFolderSortMode);
          if (fileTree.showFileExtensions !== undefined) setShowFileExtensions(fileTree.showFileExtensions);
          if (fileTree.compactMode !== undefined) setCompactMode(fileTree.compactMode);
        }
      } catch (err) {
        console.error("Failed to load file tree settings:", err);
      } finally {
        setIsLoadingFileTree(false);
      }
    }

    loadFileTreeSettings();
  }, []);

  // Load external link settings from user settings
  useEffect(() => {
    async function loadExternalSettings() {
      try {
        const response = await fetch("/api/user/settings");
        const data = await response.json();

        console.log("[Preferences] External settings response:", data);

        if (data.success && data.data?.external) {
          const { external } = data.data;
          console.log("[Preferences] Loaded external settings:", external);
          if (external.previewsEnabled !== undefined) setPreviewsEnabled(external.previewsEnabled);
          if (external.allowAllDomains !== undefined) setAllowAllDomains(external.allowAllDomains);
          if (external.allowlistedHosts) setAllowlistedHosts(external.allowlistedHosts);
          if (external.allowHttp !== undefined) setAllowHttp(external.allowHttp);
        } else {
          console.log("[Preferences] No external settings found in response");
        }
      } catch (err) {
        console.error("Failed to load external settings:", err);
      } finally {
        setIsLoadingExternal(false);
      }
    }

    loadExternalSettings();
  }, []);

  // Save file tree settings
  const saveFileTreeSettings = async () => {
    // Prevent double-click saves with synchronous ref check
    if (isSavingRef.current) {
      console.log("[Preferences] Save already in progress, ignoring");
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const response = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileTree: {
            defaultFolderViewMode,
            defaultFolderSortMode,
            showFileExtensions,
            compactMode,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      toast.success("File tree settings saved", {
        icon: <Check className="h-4 w-4" />,
      });
    } catch (err) {
      console.error("Failed to save file tree settings:", err);
      toast.error("Failed to save settings", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  // Save external settings
  const saveExternalSettings = async () => {
    // Prevent double-click saves with synchronous ref check
    if (isSavingRef.current) {
      console.log("[Preferences] Save already in progress, ignoring");
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);

    try {
      console.log("[Preferences] Saving external settings:", {
        previewsEnabled,
        allowAllDomains,
        allowlistedHosts,
        allowHttp,
      });

      const response = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          external: {
            previewsEnabled,
            allowAllDomains,
            allowlistedHosts,
            allowHttp,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      console.log("[Preferences] External settings saved successfully");
      toast.success("External link settings saved", {
        icon: <Check className="h-4 w-4" />,
      });
    } catch (err) {
      console.error("Failed to save external settings:", err);
      toast.error("Failed to save settings", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  // Add host to allowlist
  const handleAddHost = () => {
    const trimmed = newHost.trim();
    if (trimmed && !allowlistedHosts.includes(trimmed)) {
      setAllowlistedHosts([...allowlistedHosts, trimmed]);
      setNewHost("");
    }
  };

  // Remove host from allowlist
  const handleRemoveHost = (host: string) => {
    setAllowlistedHosts(allowlistedHosts.filter(h => h !== host));
  };

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

      {/* File Tree Display Settings */}
      <div
        className="border border-white/10 rounded-lg p-6"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h3 className="text-lg font-semibold mb-4">File Tree Display</h3>

        {isLoadingFileTree ? (
          <div className="text-sm text-gray-400">Loading preferences...</div>
        ) : (
          <div className="space-y-6">
            {/* Default Folder View Mode */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Default Folder View
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Choose the default view mode for new folders
              </p>
              <div className="space-y-2">
                {[
                  { value: "list", label: "List View", description: "Traditional file tree layout" },
                  { value: "gallery", label: "Gallery View", description: "Visual grid for media files" },
                  { value: "kanban", label: "Kanban View", description: "Drag-and-drop cards" },
                  { value: "dashboard", label: "Dashboard View", description: "Rearrangeable tiles" },
                  { value: "canvas", label: "Canvas View", description: "Visual graph layout" },
                ].map((mode) => (
                  <label
                    key={mode.value}
                    className="flex items-start gap-3 p-2.5 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <input
                      type="radio"
                      name="defaultFolderViewMode"
                      value={mode.value}
                      checked={defaultFolderViewMode === mode.value}
                      onChange={(e) => setDefaultFolderViewMode(e.target.value as any)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{mode.label}</div>
                      <div className="text-sm text-gray-400">{mode.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Default Sort Mode */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Default Sort Order
              </label>
              <div className="space-y-2">
                {[
                  { value: "manual", label: "Manual Order", description: "Drag and drop to reorder (default)" },
                  { value: "asc", label: "Alphabetical (A-Z)", description: "Sort by name ascending" },
                  { value: "desc", label: "Alphabetical (Z-A)", description: "Sort by name descending" },
                ].map((mode) => (
                  <label
                    key={mode.value}
                    className="flex items-start gap-3 p-2.5 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <input
                      type="radio"
                      name="defaultFolderSortMode"
                      value={mode.value}
                      checked={defaultFolderSortMode === mode.value}
                      onChange={(e) => setDefaultFolderSortMode(e.target.value as any)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{mode.label}</div>
                      <div className="text-sm text-gray-400">{mode.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Display Options */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Display Options
              </label>
              <div className="space-y-2">
                {/* Show File Extensions */}
                <label className="flex items-center gap-3 p-2.5 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={showFileExtensions}
                    onChange={(e) => setShowFileExtensions(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">Show File Extensions</div>
                    <div className="text-sm text-gray-400">
                      Display file extensions (.md, .pdf, etc.) in tree view
                    </div>
                  </div>
                </label>

                {/* Compact Mode */}
                <label className="flex items-center gap-3 p-2.5 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={compactMode}
                    onChange={(e) => setCompactMode(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">Compact Mode</div>
                    <div className="text-sm text-gray-400">
                      Reduce spacing for more visible files
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-4 border-t border-white/10">
              <Button onClick={saveFileTreeSettings} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save File Tree Settings"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* External Links Settings */}
      <div
        className="border border-white/10 rounded-lg p-6"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h3 className="text-lg font-semibold mb-4">External Links</h3>

        {isLoadingExternal ? (
          <div className="text-sm text-gray-400">Loading preferences...</div>
        ) : (
          <div className="space-y-6">
            {/* Enable Previews Toggle */}
            <div>
              <label className="flex items-center gap-3 p-2.5 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={previewsEnabled}
                  onChange={(e) => setPreviewsEnabled(e.target.checked)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">Enable Open Graph Previews</div>
                  <div className="text-sm text-gray-400">
                    Fetch and display Open Graph metadata from external URLs
                  </div>
                </div>
              </label>
            </div>

            {/* Allow All Domains Toggle */}
            <div>
              <label className="flex items-center gap-3 p-2.5 rounded-lg border border-yellow-500/30 bg-yellow-500/5 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={allowAllDomains}
                  onChange={(e) => setAllowAllDomains(e.target.checked)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">Allow All Domains</div>
                  <div className="text-sm text-gray-400">
                    ⚠️ Bypass allowlist and fetch previews from any domain (less secure)
                  </div>
                </div>
              </label>
            </div>

            {/* Allowlisted Hosts */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Allowed Hostnames {allowAllDomains && <span className="text-xs text-yellow-400">(Currently bypassed)</span>}
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Only URLs from these hostnames can have previews fetched. Supports wildcards (e.g., *.example.com)
              </p>

              {/* Add host input */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  placeholder="github.com or *.wikipedia.org"
                  value={newHost}
                  onChange={(e) => setNewHost(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddHost();
                    }
                  }}
                  className="flex-1 px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleAddHost}
                  className="px-4 py-2 bg-primary/20 hover:bg-primary/30 border border-primary/30 rounded-lg text-sm font-medium text-primary transition-colors"
                >
                  Add
                </button>
              </div>

              {/* Host list */}
              <div className="space-y-2">
                {allowlistedHosts.length === 0 ? (
                  <div className="text-sm text-gray-500 italic">
                    No hosts allowed. Previews will not work.
                  </div>
                ) : (
                  allowlistedHosts.map((host) => (
                    <div
                      key={host}
                      className="flex items-center justify-between p-2 rounded-lg border border-white/10 bg-white/5"
                    >
                      <span className="text-sm text-gray-300">{host}</span>
                      <button
                        onClick={() => handleRemoveHost(host)}
                        className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Allow HTTP Toggle */}
            <div>
              <label className="flex items-center gap-3 p-2.5 rounded-lg border border-yellow-500/30 bg-yellow-500/5 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={allowHttp}
                  onChange={(e) => setAllowHttp(e.target.checked)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">Allow HTTP URLs</div>
                  <div className="text-sm text-gray-400">
                    ⚠️ HTTP connections are not secure. Only enable if necessary.
                  </div>
                </div>
              </label>
            </div>

            {/* Save Button */}
            <div className="pt-4 border-t border-white/10">
              <Button onClick={saveExternalSettings} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save External Link Settings"}
              </Button>
            </div>
          </div>
        )}
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
