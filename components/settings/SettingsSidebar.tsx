/**
 * Settings Sidebar Navigation
 *
 * Grouped navigation: Workspace / AI & Connections / Data / Publishing /
 * Extensions. Extension entries derive from registered manifests — never
 * from free-form manifest path strings — so dead links are structurally
 * impossible.
 */

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import {
  ArrowLeft,
  Brain,
  Database,
  Download,
  FileText,
  FolderCog,
  Globe,
  Palette,
  Puzzle,
  Sparkles,
  Trash2,
} from "lucide-react";

import { LAST_CONTENT_ROUTE_KEY } from "@/components/content/NotesLayoutMarker";
import { cn } from "@/lib/core/utils";
import { getSurfaceStyles } from "@/lib/design/system";
import { renderExtensionIcon } from "@/lib/extensions";
import { useAllExtensionManifests } from "@/lib/extensions/client-registry";
import { useExtensionActivationStore } from "@/state/extension-activation-store";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  /** Rendered dimmed (e.g. a disabled extension). Still navigable. */
  dimmed?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const CORE_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      {
        href: "/settings/appearance",
        label: "Appearance",
        icon: <Palette size={16} />,
      },
      {
        href: "/settings/files",
        label: "Editor & Files",
        icon: <FolderCog size={16} />,
      },
      {
        href: "/settings/templates",
        label: "Templates & Snippets",
        icon: <FileText size={16} />,
      },
    ],
  },
  {
    label: "AI & Connections",
    items: [
      { href: "/settings/ai", label: "AI", icon: <Brain size={16} />, badge: "New" },
      {
        href: "/settings/mcp",
        label: "MCP",
        icon: <Sparkles size={16} />,
        badge: "Soon",
      },
    ],
  },
  {
    label: "Data",
    items: [
      {
        href: "/settings/storage",
        label: "Storage",
        icon: <Database size={16} />,
      },
      {
        href: "/settings/export",
        label: "Export & Backup",
        icon: <Download size={16} />,
      },
      { href: "/settings/trash", label: "Trash", icon: <Trash2 size={16} /> },
    ],
  },
  {
    label: "Publishing",
    items: [
      {
        href: "/settings/sites",
        label: "Sites & Domains",
        icon: <Globe size={16} />,
      },
    ],
  },
];

function isItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // Prefix-match nested routes, but never let a group index page (e.g.
  // /settings/extensions) claim its children.
  if (href === "/settings/extensions") return false;
  return pathname.startsWith(`${href}/`);
}

export function SettingsSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const glass1 = getSurfaceStyles("glass-1");

  // Every installed extension gets a nav entry derived from its id —
  // disabled ones stay visible (dimmed) so their settings remain findable.
  const manifests = useAllExtensionManifests();
  const activationOverrides = useExtensionActivationStore(
    (state) => state.overrides
  );
  const extensionItems: NavItem[] = [
    {
      href: "/settings/extensions",
      label: "Overview",
      icon: <Puzzle size={16} />,
    },
    ...[...manifests]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((manifest) => ({
        href: `/settings/extensions/${manifest.id}`,
        label: manifest.label,
        icon: renderExtensionIcon(manifest.iconName, "h-4 w-4"),
        dimmed: !(
          activationOverrides[manifest.id] ?? manifest.enabledByDefault
        ),
      })),
  ];

  const groups: NavGroup[] = [
    ...CORE_GROUPS,
    { label: "Extensions", items: extensionItems },
  ];

  // Back to the last content route the user visited, not the previous
  // settings sub-page. NotesLayoutMarker writes the user's pathname to
  // sessionStorage on every non-settings render; we read that here so
  // "Back" jumps cleanly out of settings instead of walking through
  // internal settings history. Falls back to `/` (direct link / first-
  // visit / private-browsing edge cases).
  const handleBack = useCallback(() => {
    if (typeof window === "undefined") {
      router.push("/");
      return;
    }
    let target: string | null = null;
    try {
      target = window.sessionStorage.getItem(LAST_CONTENT_ROUTE_KEY);
    } catch {
      target = null;
    }
    router.push(target && !target.startsWith("/settings") ? target : "/");
  }, [router]);

  return (
    <nav aria-label="Settings" className="p-4">
      <button
        type="button"
        onClick={handleBack}
        title="Back to where you were"
        aria-label="Back"
        className="mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10"
      >
        <ArrowLeft size={16} />
        <span>Back</span>
      </button>

      <div className="mb-2 px-3 py-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Settings
        </h2>
      </div>

      <div className="space-y-5">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = isItemActive(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "font-medium text-primary"
                        : "text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10",
                      item.dimmed && !isActive && "opacity-60"
                    )}
                    style={
                      isActive
                        ? {
                            background: glass1.background,
                            backdropFilter: glass1.backdropFilter,
                          }
                        : {}
                    }
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
                        {item.badge}
                      </span>
                    )}
                    {item.dimmed && (
                      <span className="text-xs text-muted-foreground">Off</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
