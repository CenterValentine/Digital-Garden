"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, Folder, Search } from "lucide-react";
import { Input } from "@/components/client/ui/input";
import { Label } from "@/components/client/ui/label";
import { Switch } from "@/components/client/ui/switch";
import { getSurfaceStyles } from "@/lib/design/system";
import type { TreeNode } from "@/lib/domain/content/types";
import {
  getPeriodicNotesSettings,
  type PeriodicNoteKind,
  type PeriodicNoteKindSettings,
} from "@/lib/domain/periodic-notes";
import type { PageTemplateWithCategory } from "@/lib/domain/templates";
import { useSettingsStore } from "@/state/settings-store";

interface FolderOption {
  id: string | null;
  title: string;
  path: string;
}

interface TreeApiResponse {
  success: boolean;
  data?: {
    tree: TreeNode[];
  };
  error?: {
    message: string;
  };
}

function collectNormalFolderOptions(nodes: TreeNode[], parentPath = "") {
  const folders: FolderOption[] = [];

  function visit(node: TreeNode, pathPrefix: string, insidePeopleMount: boolean) {
    const isPeopleMount =
      insidePeopleMount ||
      node.treeNodeKind === "peopleGroup" ||
      node.treeNodeKind === "person" ||
      Boolean(node.peopleGroupId) ||
      Boolean(node.personId) ||
      Boolean(node.peopleMount);
    const path = pathPrefix ? `${pathPrefix} / ${node.title}` : node.title;

    if (!isPeopleMount && node.contentType === "folder") {
      folders.push({
        id: node.id,
        title: node.title,
        path,
      });
    }

    node.children.forEach((child) => visit(child, path, isPeopleMount));
  }

  nodes.forEach((node) => visit(node, parentPath, false));
  return folders;
}

function normalizeSearchValue(value: string) {
  return value.toLowerCase().trim();
}

function scoreFolderOption(folder: FolderOption, query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return 1;

  const title = normalizeSearchValue(folder.title);
  const path = normalizeSearchValue(folder.path);
  const pathSegments = path.split("/").map((segment) => segment.trim());
  const words = path.split(/[\s/_-]+/).filter(Boolean);

  if (title === normalizedQuery) return 120;
  if (path === normalizedQuery) return 110;
  if (title.startsWith(normalizedQuery)) return 95;
  if (pathSegments.some((segment) => segment.startsWith(normalizedQuery))) return 85;
  if (words.some((word) => word.startsWith(normalizedQuery))) return 75;
  if (title.includes(normalizedQuery)) return 60;
  if (path.includes(normalizedQuery)) return 45;

  let index = 0;
  for (const letter of normalizedQuery.split("")) {
    index = path.indexOf(letter, index);
    if (index === -1) return 0;
    index += 1;
  }
  return 20;
}

export default function PeriodicNotesSettingsDialog() {
  const glass0 = getSurfaceStyles("glass-0");
  const periodicNotes = useSettingsStore((state) => state.periodicNotes);
  const setPeriodicNotesSettings = useSettingsStore(
    (state) => state.setPeriodicNotesSettings
  );
  const settings = getPeriodicNotesSettings({ periodicNotes });
  const [folders, setFolders] = useState<FolderOption[]>([
    { id: null, title: "Root", path: "Root" },
  ]);
  const [templates, setTemplates] = useState<PageTemplateWithCategory[]>([]);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [folderResponse, templateResponse] = await Promise.all([
          fetch("/api/content/content/tree", {
            credentials: "include",
          }),
          fetch("/api/content/page-templates", {
            credentials: "include",
          }),
        ]);
        const [folderResult, templateResult] = await Promise.all([
          folderResponse.json() as Promise<TreeApiResponse>,
          templateResponse.json(),
        ]);

        if (folderResponse.ok && folderResult.success && folderResult.data) {
          setFolders([
            { id: null, title: "Root", path: "Root" },
            ...collectNormalFolderOptions(folderResult.data.tree).sort((a, b) =>
              a.path.localeCompare(b.path)
            ),
          ]);
        }

        if (templateResponse.ok && Array.isArray(templateResult)) {
          setTemplates(templateResult);
        }
      } catch (error) {
        console.error("[PeriodicNotesSettingsDialog] Failed to load options:", error);
        toast.error("Failed to load daily note settings options");
      }
    };

    void loadOptions();
  }, []);

  const updateKind = (
    kind: PeriodicNoteKind,
    updates: Partial<PeriodicNoteKindSettings>
  ) => {
    const next = {
      ...settings[kind],
      ...updates,
    };
    void setPeriodicNotesSettings(
      kind === "daily" ? { daily: next } : { weekly: next }
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <CalendarCheck className="h-7 w-7 text-gold-primary" />
          <h1 className="text-3xl font-bold">Daily Notes</h1>
        </div>
        <p className="mt-2 text-sm text-gray-400">
          Create a note for today or this ISO week from the left-panel header.
        </p>
      </div>

      <PeriodicNoteSection
        title="Daily Notes"
        description="Use today as the note period."
        kind="daily"
        values={settings.daily}
        folders={folders}
        templates={templates}
        onChange={updateKind}
        surfaceStyle={glass0}
      />

      <PeriodicNoteSection
        title="Weekly Notes"
        description="Use the current ISO week as the note period."
        kind="weekly"
        values={settings.weekly}
        folders={folders}
        templates={templates}
        onChange={updateKind}
        surfaceStyle={glass0}
      />
    </div>
  );
}

function PeriodicNoteSection({
  title,
  description,
  kind,
  values,
  folders,
  templates,
  onChange,
  surfaceStyle,
}: {
  title: string;
  description: string;
  kind: PeriodicNoteKind;
  values: PeriodicNoteKindSettings;
  folders: FolderOption[];
  templates: PageTemplateWithCategory[];
  onChange: (
    kind: PeriodicNoteKind,
    updates: Partial<PeriodicNoteKindSettings>
  ) => void;
  surfaceStyle: ReturnType<typeof getSurfaceStyles>;
}) {
  const folderValue = values.folderId ?? "root";
  const templateValue = values.templateId ?? "none";
  const templateOptions = useMemo(
    () =>
      templates.map((template) => ({
        id: template.id,
        label: `${template.title} (${template.categoryName})`,
      })),
    [templates]
  );

  return (
    <section
      className="rounded-lg border border-white/10 p-6"
      style={{
        background: surfaceStyle.background,
        backdropFilter: surfaceStyle.backdropFilter,
      }}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-gray-400">{description}</p>
        </div>
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
          <span className="text-xs font-medium text-gray-300">Enabled</span>
          <Switch
            checked={values.enabled}
            onCheckedChange={(enabled) => onChange(kind, { enabled })}
            aria-label={`${values.enabled ? "Disable" : "Enable"} ${title}`}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label id={`${kind}-folder-label`}>Folder</Label>
          <FolderPathPicker
            labelledBy={`${kind}-folder-label`}
            folders={folders}
            value={folderValue}
            onChange={(nextValue) =>
              onChange(kind, {
                folderId: nextValue === "root" ? null : nextValue,
              })
            }
          />
          <p className="text-xs text-gray-500">
            People groups, subgroups, and people folders are excluded.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${kind}-template`}>Page Template</Label>
          <select
            id={`${kind}-template`}
            value={templateValue}
            onChange={(event) =>
              onChange(kind, {
                templateId:
                  event.target.value === "none" ? null : event.target.value,
              })
            }
            className="flex h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm"
          >
            <option value="none">No template</option>
            {templateOptions.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${kind}-filename-format`}>Filename Format</Label>
          <Input
            id={`${kind}-filename-format`}
            value={values.filenameFormat}
            onChange={(event) =>
              onChange(kind, { filenameFormat: event.target.value })
            }
            onBlur={(event) => {
              if (!event.target.value.trim()) {
                onChange(kind, {
                  filenameFormat:
                    kind === "daily" ? "YYYY-MM-DD" : "GGGG-[W]WW",
                });
              }
            }}
          />
          <div className="rounded-md border border-gold-primary/20 bg-gold-primary/10 px-3 py-2 text-xs text-gray-300">
            Use Moment-compatible tokens such as{" "}
            <code className="rounded bg-black/25 px-1 py-0.5">YYYY-MM-DD</code>,{" "}
            <code className="rounded bg-black/25 px-1 py-0.5">DD-MM-YYYY</code>, or{" "}
            <code className="rounded bg-black/25 px-1 py-0.5">[Daily] YYYY-MM-DD</code>.
            Read the{" "}
            <a
              href="https://momentjs.com/docs/#/displaying/format/"
              target="_blank"
              rel="noreferrer"
              className="text-gold-primary underline-offset-4 hover:underline"
            >
              Moment format reference
            </a>
            .
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Auto-create on app open</p>
            <p className="text-xs text-gray-500">
              Create missing note content without opening the note.
            </p>
          </div>
          <Switch
            checked={values.autoCreateOnOpen}
            onCheckedChange={(autoCreateOnOpen) =>
              onChange(kind, {
                autoCreateOnOpen,
                enabled: autoCreateOnOpen ? true : values.enabled,
              })
            }
            aria-label={`Auto-create ${title.toLowerCase()} on app open`}
          />
        </div>
      </div>
    </section>
  );
}

function FolderPathPicker({
  labelledBy,
  folders,
  value,
  onChange,
}: {
  labelledBy: string;
  folders: FolderOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedFolder = folders.find((folder) => (folder.id ?? "root") === value);
  const filteredFolders = useMemo(
    () =>
      folders
        .map((folder) => ({ folder, score: scoreFolderOption(folder, query) }))
        .filter((result) => result.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.folder.path.localeCompare(b.folder.path);
        })
        .map((result) => result.folder),
    [folders, query]
  );

  return (
    <div className="space-y-2" aria-labelledby={labelledBy}>
      <div className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm">
        <Folder className="h-4 w-4 shrink-0 text-gold-primary" />
        <span className="min-w-0 flex-1 truncate">
          {selectedFolder?.path ?? "Root"}
        </span>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search folders..."
          className="w-full rounded-md border border-white/10 bg-black/20 px-8 py-2 text-xs outline-none focus:border-gold-primary"
        />
      </div>

      <div className="overflow-hidden rounded-md border border-white/10 bg-black/20 text-xs">
        <div className="max-h-40 overflow-y-auto">
          {filteredFolders.length === 0 ? (
            <div className="px-3 py-2 text-gray-500">No folders match your search</div>
          ) : (
            filteredFolders.slice(0, 30).map((folder) => {
              const optionValue = folder.id ?? "root";
              const selected = optionValue === value;

              return (
                <button
                  key={optionValue}
                  type="button"
                  onClick={() => onChange(optionValue)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                    selected
                      ? "bg-gold-primary/10 text-gold-primary"
                      : "hover:bg-white/10"
                  }`}
                >
                  <Folder className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{folder.path}</span>
                  {selected ? <span className="shrink-0 text-[11px]">Selected</span> : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
