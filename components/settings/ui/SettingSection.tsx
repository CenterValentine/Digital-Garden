import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/core/utils";
import { getSurfaceStyles } from "@/lib/design/system";

interface SettingSectionProps {
  title: string;
  description?: string;
  /** Header-right slot — hosts a SavedIndicator or section-level action. */
  action?: ReactNode;
  /** Divider-separated bottom slot — hosts a DirtySaveBar or form actions. */
  footer?: ReactNode;
  intent?: "default" | "danger";
  className?: string;
  children?: ReactNode;
}

/**
 * Glass settings card: the one place the Liquid Glass surface treatment is
 * applied within settings. Sections are h2 so the page h1 → section h2
 * hierarchy holds everywhere.
 */
export function SettingSection({
  title,
  description,
  action,
  footer,
  intent = "default",
  className,
  children,
}: SettingSectionProps) {
  const glass = getSurfaceStyles("glass-0");
  const style: CSSProperties = {
    background: glass.background,
    backdropFilter: glass.backdropFilter,
  };

  return (
    <section
      style={style}
      className={cn(
        "rounded-xl border p-6",
        intent === "danger"
          ? "border-red-500/30"
          : "border-black/10 dark:border-white/10",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2
            className={cn(
              "text-base font-semibold",
              intent === "danger" && "text-red-600 dark:text-red-400"
            )}
          >
            {title}
          </h2>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action && (
          <div className="flex shrink-0 items-center gap-2">{action}</div>
        )}
      </div>
      {children && <div className="mt-4 space-y-4">{children}</div>}
      {footer && (
        <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/10">
          {footer}
        </div>
      )}
    </section>
  );
}
