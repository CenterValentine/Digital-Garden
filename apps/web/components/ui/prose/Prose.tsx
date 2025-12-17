import * as React from "react";
import { proseVariants } from "./Prose.recipe";
import { cn } from "@/lib/utils";

export interface ProseProps extends React.HTMLAttributes<HTMLDivElement> {
  intent?: "default" | "blog" | "compact";
}

export const Prose = React.forwardRef<HTMLDivElement, ProseProps>(
  ({ intent, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(proseVariants({ intent }), className)}
        {...props}
      />
    );
  }
);

Prose.displayName = "Prose";
