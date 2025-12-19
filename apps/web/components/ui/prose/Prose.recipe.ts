import { cva } from "class-variance-authority";

export const proseVariants = cva(
  "prose prose-slate max-w-none dark:prose-invert",
  {
    variants: {
      intent: {
        default: "prose-slate",
        blog: "prose-lg prose-slate",
        compact: "prose-sm prose-slate",
      },
    },
    defaultVariants: {
      intent: "default",
    },
  }
);
