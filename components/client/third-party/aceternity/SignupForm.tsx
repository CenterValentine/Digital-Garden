/**
 * Signup Form
 * Source: https://ui.aceternity.com/components/signup-form
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/design/integrations";
import { cn } from "@/lib/core/utils";

export interface SignupFormProps {
  className?: string;
  color?: DigitalGardenColor;
  onSubmit?: (data: any) => void;
}

export function SignupForm({
  className,
  color = "shale",
  onSubmit,
}: SignupFormProps) {
  return (
    <form
      className={cn("space-y-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(new FormData(e.currentTarget));
      }}
    >
      {/* Original Aceternity component code should go here */}
    </form>
  );
}
