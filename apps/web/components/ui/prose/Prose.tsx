import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const proseVariants = cva("prose", {
  variants: {
    intent: {
      default: "prose-lg",
      blog: "prose-xl max-w-none",
      compact: "prose-sm",
    },
  },
  defaultVariants: {
    intent: "default",
  },
});

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
