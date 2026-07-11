import type { ReactNode } from "react";

import { cn } from "@/lib/core/utils";

interface SettingsPageProps {
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Standard settings page frame: one h1 per page, optional description and
 * header actions, `space-y-8` between sections. Keeps heading scale uniform
 * across every settings surface (page h1 → section h2, no skips).
 */
export function SettingsPage({
  title,
  description,
  badge,
  actions,
  className,
  children,
}: SettingsPageProps) {
  return (
    <div className={cn("space-y-8", className)}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {badge}
          </div>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </header>
      {children}
    </div>
  );
}
