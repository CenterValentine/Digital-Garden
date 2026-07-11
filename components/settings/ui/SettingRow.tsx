import type { ReactNode } from "react";

import { Label } from "@/components/client/ui/label";
import { cn } from "@/lib/core/utils";

interface SettingRowProps {
  label: string;
  description?: string;
  /** id of the control this row labels — wires Label htmlFor for a11y. */
  htmlFor?: string;
  /** "row" puts the control to the right; "stack" puts it below (wide controls). */
  layout?: "row" | "stack";
  className?: string;
  children: ReactNode;
}

/**
 * The label + description + control row used for every individual setting.
 * Replaces the previously copy-pasted flex rows across settings pages.
 */
export function SettingRow({
  label,
  description,
  htmlFor,
  layout = "row",
  className,
  children,
}: SettingRowProps) {
  return (
    <div
      className={cn(
        layout === "row"
          ? "flex items-center justify-between gap-6"
          : "space-y-2",
        className
      )}
    >
      <div className={cn("space-y-0.5", layout === "row" && "min-w-0")}>
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className={cn(layout === "row" && "shrink-0")}>{children}</div>
    </div>
  );
}
