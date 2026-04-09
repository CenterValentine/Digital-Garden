"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderTree, UserRound, Users } from "lucide-react";
import type {
  PeopleTreeGroupNode,
  PeopleTreeResponse,
} from "@/lib/domain/people";

interface PeopleTreeApiResponse {
  success: boolean;
  data?: PeopleTreeResponse;
  error?: {
    code: string;
    message: string;
  };
}

type PeopleSettingsSection = "groups" | "people" | "mounted";

interface FlattenedGroup {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  personCount: number;
  subgroupCount: number;
  mounted: boolean;
}

interface FlattenedPerson {
  id: string;
  displayName: string;
  slug: string;
  primaryGroupName: string;
  email: string | null;
  phone: string | null;
  mounted: boolean;
}

interface FlattenedMountedItem {
  id: string;
  kind: "group" | "person";
  label: string;
  parentLabel: string;
}

function flattenGroups(
  nodes: PeopleTreeGroupNode[],
  groups: FlattenedGroup[] = [],
  people: FlattenedPerson[] = [],
  mounted: FlattenedMountedItem[] = []
): {
  groups: FlattenedGroup[];
  people: FlattenedPerson[];
  mounted: FlattenedMountedItem[];
} {
  for (const node of nodes) {
    groups.push({
      id: node.groupId,
      name: node.name,
      slug: node.slug,
      isDefault: node.isDefault,
      personCount: node.people.length,
      subgroupCount: node.childGroups.length,
      mounted: Boolean(node.mount),
    });

    if (node.mount) {
      mounted.push({
        id: `group:${node.groupId}`,
        kind: "group",
        label: node.name,
        parentLabel: node.parentGroupId ? "Subgroup" : "Top-level group",
      });
    }

    for (const person of node.people) {
      people.push({
        id: person.personId,
        displayName: person.displayName,
        slug: person.slug,
        primaryGroupName: node.name,
        email: person.email,
        phone: person.phone,
        mounted: Boolean(person.mount),
      });

      if (person.mount) {
        mounted.push({
          id: `person:${person.personId}`,
          kind: "person",
          label: person.displayName,
          parentLabel: node.name,
        });
      }
    }

    flattenGroups(node.childGroups, groups, people, mounted);
  }

  return { groups, people, mounted };
}

export default function PeopleSettingsDialog() {
  const [tree, setTree] = useState<PeopleTreeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<PeopleSettingsSection>("groups");

  useEffect(() => {
    const controller = new AbortController();

    const loadTree = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/people/tree", {
          credentials: "include",
          signal: controller.signal,
        });
        const result = (await response.json()) as PeopleTreeApiResponse;

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error?.message || "Failed to load People data");
        }

        setTree(result.data);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("[PeopleSettingsDialog] Failed to load People data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadTree();
    return () => controller.abort();
  }, []);

  const flattened = useMemo(() => {
    if (!tree) {
      return {
        groups: [] as FlattenedGroup[],
        people: [] as FlattenedPerson[],
        mounted: [] as FlattenedMountedItem[],
      };
    }

    const rootGroups =
      tree.groups.length > 0 ? tree.groups : [tree.defaultGroup];

    return flattenGroups(rootGroups);
  }, [tree]);

  const sectionLabel =
    activeSection === "groups"
      ? "Groups"
      : activeSection === "people"
        ? "People"
        : "Mounted";
  const statsReady = !isLoading && Boolean(tree);

  const renderStatValue = (value: number) => {
    if (!statsReady) {
      return (
        <div className="h-9 w-14 animate-pulse rounded-md bg-white/10" aria-hidden="true" />
      );
    }

    return <>{value}</>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-4xl font-semibold tracking-tight text-white">
          People
        </h2>
        <p className="mt-3 max-w-3xl text-base text-gray-400">
          People organizes contact records, groups, and the content linked to
          each person.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <button
          type="button"
          onClick={() => setActiveSection("groups")}
          className={`rounded-2xl border p-5 text-left transition-colors ${
            activeSection === "groups"
              ? "border-gold-primary/40 bg-gold-primary/10"
              : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
          }`}
        >
          <div className="flex items-center gap-3 text-gold-primary">
            <Users className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">
              Groups
            </span>
          </div>
          <div className="mt-4 text-xl font-semibold text-white">
            {renderStatValue(tree?.stats.groups ?? 0)}
          </div>
          <p className="mt-2 text-sm text-gray-400">
            Group records structure the People tree and organize related content.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection("people")}
          className={`rounded-2xl border p-5 text-left transition-colors ${
            activeSection === "people"
              ? "border-gold-primary/40 bg-gold-primary/10"
              : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
          }`}
        >
          <div className="flex items-center gap-3 text-gold-primary">
            <UserRound className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">
              People
            </span>
          </div>
          <div className="mt-4 text-xl font-semibold text-white">
            {renderStatValue(tree?.stats.people ?? 0)}
          </div>
          <p className="mt-2 text-sm text-gray-400">
            Open the People panel to search contacts or jump into person workspaces.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection("mounted")}
          className={`rounded-2xl border p-5 text-left transition-colors ${
            activeSection === "mounted"
              ? "border-gold-primary/40 bg-gold-primary/10"
              : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
          }`}
        >
          <div className="flex items-center gap-3 text-gold-primary">
            <FolderTree className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">
              Mounted
            </span>
          </div>
          <div className="mt-4 text-xl font-semibold text-white">
            {renderStatValue(
              (tree?.stats.mountedGroups ?? 0) + (tree?.stats.mountedPeople ?? 0)
            )}
          </div>
          <p className="mt-2 text-sm text-gray-400">
            Mounted groups and people are contacts and subgroups visible in the file tree.
          </p>
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{sectionLabel}</h3>
            <p className="mt-1 text-sm text-gray-400">
              {activeSection === "groups"
                ? "All group records in the People tree."
                : activeSection === "people"
                  ? "All contact records currently tracked in People."
                  : "Contacts and groups currently mounted into the file tree."}
            </p>
          </div>
          <div className="text-sm text-gray-400">
            {activeSection === "groups"
              ? flattened.groups.length
              : activeSection === "people"
                ? flattened.people.length
                : flattened.mounted.length}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {isLoading ? (
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-gray-400">
              Loading {sectionLabel.toLowerCase()}...
            </div>
          ) : activeSection === "groups" ? (
            flattened.groups.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-gray-400">
                No groups found.
              </div>
            ) : (
              flattened.groups.map((group) => (
                <div
                  key={group.id}
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">
                        {group.name}
                      </div>
                      <div className="mt-1 text-xs text-gray-400">
                        {group.slug} · {group.personCount} people · {group.subgroupCount} subgroups
                      </div>
                    </div>
                    <div className="text-xs uppercase tracking-[0.14em] text-gold-primary">
                      {group.isDefault ? "Default" : group.mounted ? "Mounted" : "Group"}
                    </div>
                  </div>
                </div>
              ))
            )
          ) : activeSection === "people" ? (
            flattened.people.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-gray-400">
                No people found.
              </div>
            ) : (
              flattened.people.map((person) => (
                <div
                  key={person.id}
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">
                        {person.displayName}
                      </div>
                      <div className="mt-1 text-xs text-gray-400">
                        {person.primaryGroupName}
                        {person.email ? ` · ${person.email}` : ""}
                        {person.phone ? ` · ${person.phone}` : ""}
                      </div>
                    </div>
                    <div className="text-xs uppercase tracking-[0.14em] text-gold-primary">
                      {person.mounted ? "Mounted" : "Person"}
                    </div>
                  </div>
                </div>
              ))
            )
          ) : flattened.mounted.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-gray-400">
              No mounted groups or people found.
            </div>
          ) : (
            flattened.mounted.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {item.label}
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      {item.parentLabel}
                    </div>
                  </div>
                  <div className="text-xs uppercase tracking-[0.14em] text-gold-primary">
                    {item.kind}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
