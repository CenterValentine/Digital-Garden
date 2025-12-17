import { cva } from "class-variance-authority";

export const cardVariants = cva(
  "rounded-lg border bg-surface-default shadow-sm transition-all",
  {
    variants: {
      intent: {
        default: "border-gray-200 dark:border-gray-800",
        highlight:
          "border-intent-primary bg-intent-primary/5 dark:bg-intent-primary/10",
        warning:
          "border-intent-warning bg-intent-warning/5 dark:bg-intent-warning/10",
        error: "border-intent-danger bg-intent-danger/5 dark:bg-intent-danger/10",
      },
      size: {
        compact: "p-4",
        standard: "p-6",
        jumbo: "p-8",
      },
    },
    defaultVariants: {
      intent: "default",
      size: "standard",
    },
  }
);

export const cardHeaderVariants = cva("flex flex-col space-y-1.5", {
  variants: {
    size: {
      compact: "mb-3",
      standard: "mb-4",
      jumbo: "mb-6",
    },
  },
  defaultVariants: {
    size: "standard",
  },
});

export const cardTitleVariants = cva(
  "text-2xl font-semibold leading-none tracking-tight"
);

export const cardDescriptionVariants = cva(
  "text-sm text-intent-neutral"
);

export const cardContentVariants = cva("");

export const cardFooterVariants = cva("flex items-center", {
  variants: {
    size: {
      compact: "mt-3 pt-3",
      standard: "mt-4 pt-4",
      jumbo: "mt-6 pt-6",
    },
  },
  defaultVariants: {
    size: "standard",
  },
});
