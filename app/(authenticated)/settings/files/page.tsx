/**
 * Editor & Files Settings
 *
 * Uploads, office document viewing, file tree display, and external link
 * previews. Hybrid save model: toggles/radios apply instantly (localStorage
 * store or debounced section PATCH — the same persistence paths the old
 * Preferences page used); the ONLYOFFICE URL keeps an explicit Save.
 */

"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check } from "lucide-react";

import { Input } from "@/components/client/ui/input";
import { Switch } from "@/components/client/ui/switch";
import { Button } from "@/components/client/ui/button";
import {
  DirtySaveBar,
  RadioCardGroup,
  SavedIndicator,
  SettingRow,
  SettingSection,
  SettingsPage,
  useDirtyForm,
  usePatchSettingsSection,
  useTransientSaved,
} from "@/components/settings/ui";
import { useUploadSettingsStore } from "@/state/upload-settings-store";

type FolderViewMode = "list" | "gallery" | "kanban" | "dashboard" | "canvas";
type FolderSortMode = "asc" | "desc" | "manual";
type OfficeViewerMode = "google-docs" | "onlyoffice" | "microsoft-viewer";

const UPLOAD_OPTIONS = [
  {
    value: "manual" as const,
    title: "Ask before uploading",
    description: "Review and rename files before they upload.",
  },
  {
    value: "automatic" as const,
    title: "Upload immediately",
    description: "Files upload as soon as you select or drop them.",
  },
];

const VIEW_MODE_OPTIONS = [
  { value: "list" as FolderViewMode, title: "List", description: "Traditional file tree layout." },
  { value: "gallery" as FolderViewMode, title: "Gallery", description: "Visual grid for media files." },
  { value: "kanban" as FolderViewMode, title: "Kanban", description: "Drag-and-drop cards." },
  { value: "dashboard" as FolderViewMode, title: "Dashboard", description: "Rearrangeable tiles." },
  { value: "canvas" as FolderViewMode, title: "Canvas", description: "Visual graph layout." },
];

const SORT_MODE_OPTIONS = [
  { value: "manual" as FolderSortMode, title: "Manual", description: "Drag and drop to reorder." },
  { value: "asc" as FolderSortMode, title: "Alphabetical (A–Z)", description: "Sort by name ascending." },
  { value: "desc" as FolderSortMode, title: "Alphabetical (Z–A)", description: "Sort by name descending." },
];

export default function FilesSettingsPage() {
  // Uploads + office viewer — client store (localStorage), same as before.
  const {
    uploadMode,
    setUploadMode,
    officeViewerMode,
    setOfficeViewerMode,
    onlyofficeServerUrl,
    setOnlyofficeServerUrl,
  } = useUploadSettingsStore();
  const uploadSaved = useTransientSaved();
  const officeSaved = useTransientSaved();

  const [hasGoogleAuth, setHasGoogleAuth] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function checkGoogleAuth() {
      try {
        const response = await fetch("/api/auth/provider");
        const data = await response.json();
        if (!cancelled && data.success && data.data.hasGoogleAuth) {
          setHasGoogleAuth(true);
        }
      } catch {
        // Non-fatal: badge simply doesn't show.
      }
    }
    void checkGoogleAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const onlyofficeForm = useDirtyForm({ url: onlyofficeServerUrl ?? "" });
  const { resetTo: resetOnlyofficeForm } = onlyofficeForm;
  useEffect(() => {
    resetOnlyofficeForm({ url: onlyofficeServerUrl ?? "" });
  }, [onlyofficeServerUrl, resetOnlyofficeForm]);

  // File tree + external links — backend settings blob via the same
  // partial-PATCH bodies the old page sent, now per change (debounced).
  const [fileTree, setFileTree] = useState({
    defaultFolderViewMode: "list" as FolderViewMode,
    defaultFolderSortMode: "manual" as FolderSortMode,
    showFileExtensions: false,
    compactMode: false,
  });
  const [external, setExternal] = useState({
    previewsEnabled: false,
    allowAllDomains: false,
    allowlistedHosts: [] as string[],
    allowHttp: false,
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const [newHost, setNewHost] = useState("");

  const fileTreePatch = usePatchSettingsSection("fileTree");
  const externalPatch = usePatchSettingsSection("external");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/user/settings");
        const data = await response.json();
        if (cancelled) return;
        if (data.success && data.data) {
          if (data.data.fileTree) {
            setFileTree((prev) => ({ ...prev, ...data.data.fileTree }));
          }
          if (data.data.external) {
            setExternal((prev) => ({ ...prev, ...data.data.external }));
          }
        }
      } catch {
        // Defaults remain; saving still works.
      }
      if (!cancelled) setIsLoaded(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateFileTree = (patch: Partial<typeof fileTree>) => {
    const next = { ...fileTree, ...patch };
    setFileTree(next);
    fileTreePatch.patch(next);
  };

  const updateExternal = (patch: Partial<typeof external>) => {
    const next = { ...external, ...patch };
    setExternal(next);
    externalPatch.patch(next);
  };

  const handleAddHost = () => {
    const trimmed = newHost.trim();
    if (trimmed && !external.allowlistedHosts.includes(trimmed)) {
      updateExternal({ allowlistedHosts: [...external.allowlistedHosts, trimmed] });
      setNewHost("");
    }
  };

  return (
    <SettingsPage
      title="Editor & Files"
      description="Uploads, document viewing, file tree display, and link previews."
    >
      <SettingSection
        title="Uploads"
        description="What happens when you add files."
        action={<SavedIndicator status={uploadSaved.status} error={uploadSaved.error} />}
      >
        <RadioCardGroup
          aria-label="Upload confirmation"
          value={uploadMode}
          onValueChange={(next) => {
            setUploadMode(next);
            uploadSaved.markSaved();
          }}
          options={UPLOAD_OPTIONS}
        />
      </SettingSection>

      <SettingSection
        title="Office Documents"
        description="How Word, Excel, and PowerPoint files open."
        action={<SavedIndicator status={officeSaved.status} error={officeSaved.error} />}
      >
        <RadioCardGroup
          aria-label="Office document viewing mode"
          value={officeViewerMode}
          onValueChange={(next: OfficeViewerMode) => {
            setOfficeViewerMode(next);
            officeSaved.markSaved();
          }}
          options={[
            {
              value: "google-docs" as OfficeViewerMode,
              title: "Google Docs, Sheets & Slides",
              description: hasGoogleAuth
                ? "Full editing with auto-save, synced to your Google Drive."
                : "View-only mode. Sign in with Google for editing.",
              badge: hasGoogleAuth ? (
                <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-xs text-green-700 dark:text-green-400">
                  Recommended
                </span>
              ) : undefined,
            },
            {
              value: "onlyoffice" as OfficeViewerMode,
              title: "ONLYOFFICE editor",
              description: "Full editing with auto-save. Requires your own server.",
            },
            {
              value: "microsoft-viewer" as OfficeViewerMode,
              title: "Microsoft Office Online",
              description: "Read-only preview using Microsoft's viewer.",
            },
          ]}
        />

        {officeViewerMode === "onlyoffice" && (
          <div className="space-y-2 border-t border-black/10 pt-4 dark:border-white/10">
            <SettingRow
              label="ONLYOFFICE server URL"
              description="Your self-hosted ONLYOFFICE Document Server."
              htmlFor="onlyoffice-url"
              layout="stack"
            >
              <Input
                id="onlyoffice-url"
                type="url"
                placeholder="https://your-onlyoffice-server.com"
                value={onlyofficeForm.values.url}
                onChange={(event) => onlyofficeForm.update({ url: event.target.value })}
              />
            </SettingRow>
            {onlyofficeServerUrl ? (
              <p className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                <Check className="h-3 w-3" />
                Connected: {onlyofficeServerUrl}
              </p>
            ) : (
              <p className="flex items-center gap-1 text-xs text-yellow-700 dark:text-yellow-400">
                <AlertCircle className="h-3 w-3" />
                No server configured. Office documents fall back to view-only mode.
              </p>
            )}
            <DirtySaveBar
              isDirty={onlyofficeForm.isDirty}
              onSave={() => {
                setOnlyofficeServerUrl(onlyofficeForm.values.url.trim() || null);
                officeSaved.markSaved();
              }}
              onRevert={onlyofficeForm.revert}
            />
          </div>
        )}
      </SettingSection>

      <SettingSection
        title="File Tree"
        description="Defaults for folders and the tree view."
        action={<SavedIndicator status={fileTreePatch.status} error={fileTreePatch.error} />}
      >
        {!isLoaded ? (
          <p className="text-sm text-muted-foreground">Loading preferences…</p>
        ) : (
          <>
            <SettingRow
              label="Default folder view"
              description="View mode for folders that haven't set their own."
              layout="stack"
            >
              <RadioCardGroup
                aria-label="Default folder view"
                value={fileTree.defaultFolderViewMode}
                onValueChange={(next) => updateFileTree({ defaultFolderViewMode: next })}
                options={VIEW_MODE_OPTIONS}
                columns={2}
              />
            </SettingRow>
            <SettingRow
              label="Default sort order"
              description="How items in a folder are ordered."
              layout="stack"
            >
              <RadioCardGroup
                aria-label="Default sort order"
                value={fileTree.defaultFolderSortMode}
                onValueChange={(next) => updateFileTree({ defaultFolderSortMode: next })}
                options={SORT_MODE_OPTIONS}
                columns={2}
              />
            </SettingRow>
            <div className="space-y-4 border-t border-black/10 pt-4 dark:border-white/10">
              <SettingRow
                label="Show file extensions"
                description="Display .md, .pdf, and other extensions in the tree."
                htmlFor="show-file-extensions"
              >
                <Switch
                  id="show-file-extensions"
                  checked={fileTree.showFileExtensions}
                  onCheckedChange={(checked) => updateFileTree({ showFileExtensions: checked })}
                />
              </SettingRow>
              <SettingRow
                label="Use compact spacing"
                description="Reduce row height so more files fit on screen."
                htmlFor="compact-mode"
              >
                <Switch
                  id="compact-mode"
                  checked={fileTree.compactMode}
                  onCheckedChange={(checked) => updateFileTree({ compactMode: checked })}
                />
              </SettingRow>
            </div>
          </>
        )}
      </SettingSection>

      <SettingSection
        title="External Links"
        description="Previews for bookmarked and linked URLs."
        action={<SavedIndicator status={externalPatch.status} error={externalPatch.error} />}
      >
        {!isLoaded ? (
          <p className="text-sm text-muted-foreground">Loading preferences…</p>
        ) : (
          <>
            <SettingRow
              label="Show link previews"
              description="Fetch Open Graph metadata from external URLs to render rich previews."
              htmlFor="previews-enabled"
            >
              <Switch
                id="previews-enabled"
                checked={external.previewsEnabled}
                onCheckedChange={(checked) => updateExternal({ previewsEnabled: checked })}
              />
            </SettingRow>
            <SettingRow
              label="Allow all domains"
              description="Bypass the allowlist and fetch previews from any domain. Less secure."
              htmlFor="allow-all-domains"
            >
              <Switch
                id="allow-all-domains"
                checked={external.allowAllDomains}
                onCheckedChange={(checked) => updateExternal({ allowAllDomains: checked })}
              />
            </SettingRow>

            <SettingRow
              label="Allowed hostnames"
              description={
                external.allowAllDomains
                  ? "Currently bypassed because all domains are allowed. Supports wildcards (*.example.com)."
                  : "Only these hostnames can have previews fetched. Supports wildcards (*.example.com)."
              }
              layout="stack"
            >
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="github.com or *.wikipedia.org"
                    value={newHost}
                    onChange={(event) => setNewHost(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleAddHost();
                      }
                    }}
                  />
                  <Button type="button" variant="secondary" onClick={handleAddHost}>
                    Add
                  </Button>
                </div>
                {external.allowlistedHosts.length === 0 ? (
                  <p className="text-sm italic text-muted-foreground">
                    No hosts allowed. Previews will not work.
                  </p>
                ) : (
                  <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {external.allowlistedHosts.map((host) => (
                      <li
                        key={host}
                        className="flex items-center justify-between rounded-lg border border-black/10 bg-black/[0.02] p-2 dark:border-white/10 dark:bg-white/5"
                      >
                        <span className="text-sm">{host}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          onClick={() =>
                            updateExternal({
                              allowlistedHosts: external.allowlistedHosts.filter(
                                (candidate) => candidate !== host
                              ),
                            })
                          }
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </SettingRow>

            <SettingRow
              label="Allow HTTP URLs"
              description="HTTP connections are not secure. Only enable if necessary."
              htmlFor="allow-http"
            >
              <Switch
                id="allow-http"
                checked={external.allowHttp}
                onCheckedChange={(checked) => updateExternal({ allowHttp: checked })}
              />
            </SettingRow>
          </>
        )}
      </SettingSection>
    </SettingsPage>
  );
}
