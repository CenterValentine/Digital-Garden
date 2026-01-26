/**
 * Admin Sidebar Navigation
 *
 * Navigation for admin panel sections.
 * Matches SettingsSidebar pattern with inline SVG icons.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSurfaceStyles } from "@/lib/design-system";

// Inline SVG Icons (server-compatible)
const DashboardIcon = () => (
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
  >
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);

const UsersIcon = () => (
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
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const FileTextIcon = () => (
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
  >
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" x2="8" y1="13" y2="13" />
    <line x1="16" x2="8" y1="17" y2="17" />
    <line x1="10" x2="8" y1="9" y2="9" />
  </svg>
);

const ActivityIcon = () => (
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
  >
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const ShieldIcon = () => (
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
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: <DashboardIcon />,
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: <UsersIcon />,
  },
  {
    href: "/admin/content",
    label: "Content",
    icon: <FileTextIcon />,
  },
  {
    href: "/admin/audit-logs",
    label: "Audit Logs",
    icon: <ActivityIcon />,
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const glass1 = getSurfaceStyles("glass-1");

  return (
    <div className="p-4 space-y-2">
      {/* Header */}
      <div className="px-3 py-2 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <ShieldIcon />
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
            Admin Panel
          </h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Owner access only</p>
      </div>

      {/* Navigation Items */}
      {navItems.map((item) => {
        // Match exact path or any sub-path
        const isActive =
          pathname === item.href ||
          (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`
              flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all
              ${
                isActive
                  ? "text-primary font-medium"
                  : "text-gray-300 hover:text-white"
              }
            `}
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
            <span className="flex-1">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
