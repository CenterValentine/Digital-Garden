"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import type { JSONContent } from "@tiptap/core";
import {
  Building2,
  Columns3,
  LayoutDashboard,
  LayoutGrid,
  List,
  Mail,
  Network,
  Phone,
  UserRound,
  Users,
} from "lucide-react";

import { ExpandableEditor } from "../editor/ExpandableEditor";
import {
  FolderViewContainer,
  type FolderViewMode,
} from "../folder-views/FolderViewContainer";
import { useContentStore, type WorkspacePaneId } from "@/state/content-store";
import { useLeftPanelViewStore } from "@/state/left-panel-view-store";
import { useTreeStateStore } from "@/state/tree-state-store";

interface PersonWorkspaceProps {
  personId: string;
  paneId: WorkspacePaneId;
}

interface PersonDetailResponse {
  success: boolean;
  data?: {
    personId: string;
    displayName: string;
    slug: string;
    givenName: string | null;
    familyName: string | null;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
    primaryGroupId: string;
    primaryGroupName: string;
    treePresence?: {
      isVisibleInFileTree: boolean;
      selectedNodeId: string;
      contentAncestorIds: string[];
      peopleAncestorIds: string[];
    } | null;
    metadata: {
      organization: string | null;
      jobTitle: string | null;
      birthday: string | null;
      website: string | null;
      notes: string | null;
      notesTiptapJson?: JSONContent;
      contentView?: {
        viewMode: FolderViewMode;
        viewPrefs: Record<string, unknown>;
      };
      address: {
        line1: string | null;
        line2: string | null;
        city: string | null;
        region: string | null;
        postalCode: string | null;
        country: string | null;
      };
    };
  };
  error?: {
    code: string;
    message: string;
  };
}

interface PersonFormState {
  displayName: string;
  givenName: string;
  familyName: string;
  email: string;
  phone: string;
  avatarUrl: string;
  organization: string;
  jobTitle: string;
  birthday: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

type PersonWorkspaceViewMode = "profile" | FolderViewMode;

interface PeopleMentionSearchResponse {
  success: boolean;
  data?: {
    results?: Array<{
      treeNodeKind: string;
      id: string;
      personId: string;
      label: string;
      slug: string;
      email?: string | null;
      phone?: string | null;
      avatarUrl?: string | null;
    }>;
  };
}

interface TagSearchResult {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  _count?: {
    contentTags?: number;
  };
}

function emptyFormState(): PersonFormState {
  return {
    displayName: "",
    givenName: "",
    familyName: "",
    email: "",
    phone: "",
    avatarUrl: "",
    organization: "",
    jobTitle: "",
    birthday: "",
    website: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
  };
}

const CONTENT_VIEW_MODES: FolderViewMode[] = [
  "list",
  "gallery",
  "kanban",
  "dashboard",
  "canvas",
];

const VIEW_MODE_ICONS: Record<PersonWorkspaceViewMode, ReactNode> = {
  profile: <UserRound className="h-4 w-4" />,
  list: <List className="h-4 w-4" />,
  gallery: <LayoutGrid className="h-4 w-4" />,
  kanban: <Columns3 className="h-4 w-4" />,
  dashboard: <LayoutDashboard className="h-4 w-4" />,
  canvas: <Network className="h-4 w-4" />,
};

export function PersonWorkspace({ personId, paneId }: PersonWorkspaceProps) {
  const [form, setForm] = useState<PersonFormState>(() => emptyFormState());
  const [primaryGroupName, setPrimaryGroupName] = useState("People");
  const [viewMode, setViewMode] = useState<PersonWorkspaceViewMode>("profile");
  const [contentViewMode, setContentViewMode] = useState<FolderViewMode>("list");
  const [contentViewPrefs, setContentViewPrefs] = useState<Record<string, unknown>>({});
  const [profileNoteContent, setProfileNoteContent] = useState<JSONContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipNextRefreshRef = useRef(false);

  const updateContentTab = useContentStore((state) => state.updateContentTab);
  const { setActiveView } = useLeftPanelViewStore();

  const loadWorkspace = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/people/persons/${personId}`, {
          credentials: "include",
          signal,
        });
        const result = (await response.json()) as PersonDetailResponse;

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error?.message || "Failed to load contact");
        }

        const nextContentViewMode = result.data.metadata.contentView?.viewMode ?? "list";
        const nextContentViewPrefs = result.data.metadata.contentView?.viewPrefs ?? {};

        setPrimaryGroupName(result.data.primaryGroupName);
        setForm({
          displayName: result.data.displayName,
          givenName: result.data.givenName || "",
          familyName: result.data.familyName || "",
          email: result.data.email || "",
          phone: result.data.phone || "",
          avatarUrl: result.data.avatarUrl || "",
          organization: result.data.metadata.organization || "",
          jobTitle: result.data.metadata.jobTitle || "",
          birthday: result.data.metadata.birthday || "",
          website: result.data.metadata.website || "",
          addressLine1: result.data.metadata.address.line1 || "",
          addressLine2: result.data.metadata.address.line2 || "",
          city: result.data.metadata.address.city || "",
          region: result.data.metadata.address.region || "",
          postalCode: result.data.metadata.address.postalCode || "",
          country: result.data.metadata.address.country || "",
        });
        setContentViewMode(nextContentViewMode);
        setContentViewPrefs(nextContentViewPrefs);
        setViewMode((current) => (current === "profile" ? "profile" : nextContentViewMode));
        setProfileNoteContent(
          result.data.metadata.notesTiptapJson && Object.keys(result.data.metadata.notesTiptapJson).length > 0
            ? result.data.metadata.notesTiptapJson
            : {
                type: "doc",
                content: result.data.metadata.notes
                  ? [{ type: "paragraph", content: [{ type: "text", text: result.data.metadata.notes }] }]
                  : [{ type: "paragraph" }],
              }
        );
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }
        console.error("[PersonWorkspace] Failed to load workspace:", loadError);
        setError(loadError instanceof Error ? loadError.message : "Failed to load contact");
      } finally {
        setIsLoading(false);
      }
    },
    [personId]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadWorkspace(controller.signal);
    return () => controller.abort();
  }, [loadWorkspace]);

  useEffect(() => {
    const handleRefresh = () => {
      if (skipNextRefreshRef.current) {
        skipNextRefreshRef.current = false;
        return;
      }
      void loadWorkspace();
    };

    window.addEventListener("dg:people-refresh", handleRefresh);
    return () => window.removeEventListener("dg:people-refresh", handleRefresh);
  }, [loadWorkspace]);

  const updateField = useCallback((key: keyof PersonFormState, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }, []);

  const profileSummary = useMemo(
    () =>
      [
        form.organization
          ? {
              label: form.organization,
              icon: <Building2 className="h-3.5 w-3.5" />,
            }
          : null,
        form.email
          ? {
              label: form.email,
              icon: <Mail className="h-3.5 w-3.5" />,
            }
          : null,
        form.phone
          ? {
              label: form.phone,
              icon: <Phone className="h-3.5 w-3.5" />,
            }
          : null,
      ].filter(Boolean) as Array<{ label: string; icon: ReactNode }>,
    [form.email, form.organization, form.phone]
  );

  const persistPeopleRefresh = useCallback(() => {
    skipNextRefreshRef.current = true;
    window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
    window.dispatchEvent(new CustomEvent("dg:people-refresh"));
  }, []);

  const handleSave = useCallback(async () => {
    const nextDisplayName = form.displayName.trim();
    if (!nextDisplayName) {
      toast.error("Display name is required");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/people/persons/${personId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: nextDisplayName,
          givenName: form.givenName.trim() || null,
          familyName: form.familyName.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          avatarUrl: form.avatarUrl.trim() || null,
          organization: form.organization.trim() || null,
          jobTitle: form.jobTitle.trim() || null,
          birthday: form.birthday.trim() || null,
          website: form.website.trim() || null,
          addressLine1: form.addressLine1.trim() || null,
          addressLine2: form.addressLine2.trim() || null,
          city: form.city.trim() || null,
          region: form.region.trim() || null,
          postalCode: form.postalCode.trim() || null,
          country: form.country.trim() || null,
        }),
      });
      const result = (await response.json()) as PersonDetailResponse;

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error?.message || "Failed to update contact");
      }

      setForm((current) => ({
        ...current,
        displayName: nextDisplayName,
      }));
      setPrimaryGroupName(result.data.primaryGroupName);
      updateContentTab(`person:${personId}`, {
        title: nextDisplayName,
        contentType: "person-profile",
      });
      persistPeopleRefresh();
      toast.success("Contact updated", {
        description: nextDisplayName,
      });
    } catch (saveError) {
      console.error("[PersonWorkspace] Failed to update contact:", saveError);
      toast.error("Failed to update contact", {
        description: saveError instanceof Error ? saveError.message : "Unknown error",
      });
    } finally {
      setIsSaving(false);
    }
  }, [form, personId, persistPeopleRefresh, updateContentTab]);

  const handleContentViewUpdate = useCallback(
    async (updates: {
      viewMode?: FolderViewMode;
      viewPrefs?: Record<string, unknown>;
      sortMode?: string | null;
      includeReferencedContent?: boolean;
    }) => {
      const nextViewMode = updates.viewMode ?? contentViewMode;
      const nextViewPrefs = updates.viewPrefs ?? contentViewPrefs;
      const previousViewMode = contentViewMode;
      const previousViewPrefs = contentViewPrefs;

      setContentViewMode(nextViewMode);
      setContentViewPrefs(nextViewPrefs);
      if (viewMode !== "profile") {
        setViewMode(nextViewMode);
      }

      try {
        const response = await fetch(`/api/people/persons/${personId}`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contentViewMode: nextViewMode,
            contentViewPrefs: nextViewPrefs,
          }),
        });
        const result = (await response.json()) as PersonDetailResponse;

        if (!response.ok || !result.success) {
          throw new Error(result.error?.message || "Failed to update contact view");
        }
      } catch (error) {
        console.error("[PersonWorkspace] Failed to update contact view:", error);
        setContentViewMode(previousViewMode);
        setContentViewPrefs(previousViewPrefs);
        if (viewMode !== "profile") {
          setViewMode(previousViewMode);
        }
        toast.error("Failed to update contact view", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    [contentViewMode, contentViewPrefs, personId, viewMode]
  );

  const handleProfileNoteSave = useCallback(
    async (content: JSONContent) => {
      const previousContent = profileNoteContent;
      setProfileNoteContent(content);

      try {
        const response = await fetch(`/api/people/persons/${personId}`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            notesTiptapJson: content,
          }),
        });
        const result = (await response.json()) as PersonDetailResponse;

        if (!response.ok || !result.success) {
          throw new Error(result.error?.message || "Failed to save contact notes");
        }
      } catch (error) {
        setProfileNoteContent(previousContent ?? null);
        throw error;
      }
    },
    [personId, profileNoteContent]
  );

  const fetchPeopleMentions = useCallback(async (query: string) => {
    try {
      const params = new URLSearchParams();
      params.set("q", query);
      params.set("limit", "20");
      const response = await fetch(`/api/people/search?${params.toString()}`, {
        credentials: "include",
      });

      const result = (await response.json()) as PeopleMentionSearchResponse;
      if (!response.ok || !result.success) {
        return [];
      }

      return (result.data?.results || [])
        .filter((item) => item.treeNodeKind === "person")
        .map((item) => ({
          id: item.id,
          personId: item.personId,
          label: item.label,
          slug: item.slug,
          email: item.email || null,
          phone: item.phone || null,
          avatarUrl: item.avatarUrl || null,
        }));
    } catch (error) {
      console.error("[PersonWorkspace] Error fetching people mentions:", error);
      return [];
    }
  }, []);

  const handlePersonMentionClick = useCallback(
    async (targetPersonId: string) => {
      try {
        const response = await fetch(`/api/people/persons/${targetPersonId}`, {
          credentials: "include",
        });
        const result = (await response.json()) as PersonDetailResponse;

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error?.message || "Failed to load person");
        }

        const treePresence = result.data.treePresence;
        if (treePresence?.isVisibleInFileTree) {
          const treeState = useTreeStateStore.getState();
          treeState.expandMany([
            ...(treePresence.contentAncestorIds || []),
            ...(treePresence.peopleAncestorIds || []),
          ]);
          treeState.setSelectedIds([treePresence.selectedNodeId || `person:${targetPersonId}`]);
          setActiveView("files");
          window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
          return;
        }

        setActiveView("people");
        window.dispatchEvent(
          new CustomEvent("dg:people-focus", {
            detail: {
              personId: targetPersonId,
              openProfile: true,
            },
          })
        );
      } catch (error) {
        console.error("[PersonWorkspace] Error opening person mention:", error);
        toast.error("Failed to open person", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    [setActiveView]
  );

  const fetchTags = useCallback(async (query: string) => {
    try {
      const response = await fetch(`/api/content/tags?search=${encodeURIComponent(query)}`, {
        credentials: "include",
      });

      if (!response.ok) {
        return [];
      }

      const tags = (await response.json()) as TagSearchResult[];
      return tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        color: tag.color,
        usageCount: tag._count?.contentTags || 0,
      }));
    } catch (error) {
      console.error("[PersonWorkspace] Error fetching tags:", error);
      return [];
    }
  }, []);

  const handleOpenContentView = useCallback(
    (nextMode: FolderViewMode) => {
      setViewMode(nextMode);
      void handleContentViewUpdate({ viewMode: nextMode });
    },
    [handleContentViewUpdate]
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-gray-500">Loading contact...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="text-sm font-medium text-red-500">Failed to load contact</div>
          <div className="mt-2 text-xs text-gray-500">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b border-white/10 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{form.displayName || "Contact"}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {primaryGroupName}
              </span>
              {profileSummary.map((item) => (
                <span key={item.label} className="inline-flex items-center gap-1.5">
                  {item.icon}
                  {item.label}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={viewMode !== "profile" || isSaving || !form.displayName.trim()}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {viewMode === "profile" ? (isSaving ? "Saving..." : "Save Contact") : "Contact"}
          </button>
        </div>

        <div className="mt-4 flex items-center justify-end">
          <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setViewMode("profile")}
              className={`rounded p-1.5 transition-colors ${
                viewMode === "profile"
                  ? "bg-primary/20 text-primary"
                  : "text-gray-400 hover:bg-white/10 hover:text-white"
              }`}
              title="Profile"
            >
              {VIEW_MODE_ICONS.profile}
            </button>
            {CONTENT_VIEW_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleOpenContentView(mode)}
                className={`rounded p-1.5 transition-colors ${
                  viewMode === mode
                    ? "bg-primary/20 text-primary"
                    : "text-gray-400 hover:bg-white/10 hover:text-white"
                }`}
                title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} view`}
              >
                {VIEW_MODE_ICONS[mode]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {viewMode === "profile" ? (
          <section className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-white/50 p-4">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <ProfileField label="Display name" value={form.displayName} onChange={(value) => updateField("displayName", value)} />
                <ProfileField label="Avatar URL" value={form.avatarUrl} onChange={(value) => updateField("avatarUrl", value)} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <ProfileField label="Given name" value={form.givenName} onChange={(value) => updateField("givenName", value)} />
                <ProfileField label="Family name" value={form.familyName} onChange={(value) => updateField("familyName", value)} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <ProfileField label="Email" value={form.email} onChange={(value) => updateField("email", value)} type="email" />
                <ProfileField label="Phone" value={form.phone} onChange={(value) => updateField("phone", value)} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <ProfileField label="Organization" value={form.organization} onChange={(value) => updateField("organization", value)} />
                <ProfileField label="Job title" value={form.jobTitle} onChange={(value) => updateField("jobTitle", value)} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <ProfileField label="Birthday" value={form.birthday} onChange={(value) => updateField("birthday", value)} />
                <ProfileField label="Website" value={form.website} onChange={(value) => updateField("website", value)} />
              </div>
              <ProfileField label="Address line 1" value={form.addressLine1} onChange={(value) => updateField("addressLine1", value)} />
              <ProfileField label="Address line 2" value={form.addressLine2} onChange={(value) => updateField("addressLine2", value)} />
              <div className="grid gap-3 md:grid-cols-2">
                <ProfileField label="City" value={form.city} onChange={(value) => updateField("city", value)} />
                <ProfileField label="State / Region" value={form.region} onChange={(value) => updateField("region", value)} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <ProfileField label="Postal code" value={form.postalCode} onChange={(value) => updateField("postalCode", value)} />
                <ProfileField label="Country" value={form.country} onChange={(value) => updateField("country", value)} />
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-white/70">
              <ExpandableEditor
                contentId={`person:${personId}`}
                contentType="contact"
                noteContent={profileNoteContent}
                onSave={handleProfileNoteSave}
                fetchPeopleMentions={fetchPeopleMentions}
                onPersonMentionClick={handlePersonMentionClick}
                fetchTags={fetchTags}
              />
            </div>
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/50">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Assigned Content</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Files and folders owned by this contact.
                </p>
              </div>
            </div>
            <div className="h-[min(72vh,720px)] overflow-hidden">
              <FolderViewContainer
                viewMode={viewMode}
                folderId={`person:${personId}`}
                paneId={paneId}
                folderTitle={form.displayName || "Contact"}
                contentQuery={{
                  personId,
                  parentId: null,
                }}
                viewPrefs={contentViewPrefs}
                sortMode={null}
                includeReferencedContent={false}
                onUpdateView={handleContentViewUpdate}
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ProfileField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-gold-primary/60"
      />
    </label>
  );
}
